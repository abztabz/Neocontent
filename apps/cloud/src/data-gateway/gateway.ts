import { providersFor, type SourceProvider } from "./registry.js";

export type GatewayAdapter = (
  input: Record<string, unknown>,
  provider: SourceProvider,
) => Promise<{ data: unknown; sourceObservedAt?: string | null }>;

function hasUsableData(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export class NeoDataGateway {
  constructor(
    private adapters: Record<string, GatewayAdapter>,
    private now: () => Date = () => new Date(),
  ) {}

  async request(capability: string, input: Record<string, unknown>) {
    const attempts: Array<Record<string, string>> = [];
    for (const provider of providersFor(capability)) {
      const adapter = this.adapters[provider.id];
      if (!adapter) continue;
      const startedAt = this.now().toISOString();
      try {
        const result = await adapter(input, provider);
        if (!result || !hasUsableData(result.data)) throw new Error("Provider returned no usable data");
        return {
          ok: true as const,
          capability,
          provider: provider.id,
          observedAt: this.now().toISOString(),
          sourceObservedAt: result.sourceObservedAt ?? null,
          provenance: {
            provider: provider.name,
            attribution: provider.attribution ?? null,
            dataBoundary: provider.dataBoundary,
          },
          data: result.data,
          attempts,
        };
      } catch (error) {
        attempts.push({
          provider: provider.id,
          startedAt,
          failedAt: this.now().toISOString(),
          message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      }
    }
    return {
      ok: false as const,
      capability,
      observedAt: this.now().toISOString(),
      attempts,
      error: "No eligible provider returned usable data",
    };
  }
}
