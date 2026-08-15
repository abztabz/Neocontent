import { providersFor, type SourceProvider } from "./registry.js";

export type GatewayAdapter = (
  input: Record<string, unknown>,
  provider: SourceProvider,
) => Promise<{ data: unknown; sourceObservedAt?: string | null }>;

export interface GatewayAttempt {
  provider: string;
  durationMs: number;
  outcome: "error" | "empty";
}

function hasUsableData(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function elapsedMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, Math.round(finishedAt.getTime() - startedAt.getTime()));
}

export class NeoDataGateway {
  constructor(
    private adapters: Record<string, GatewayAdapter>,
    private now: () => Date = () => new Date(),
  ) {}

  async request(
    capability: string,
    input: Record<string, unknown>,
    options: { includeExperimental?: boolean } = {},
  ) {
    const attempts: GatewayAttempt[] = [];
    for (const provider of providersFor(capability, options)) {
      const adapter = this.adapters[provider.id];
      if (!adapter) continue;
      const startedAt = this.now();
      try {
        const result = await adapter(input, provider);
        const finishedAt = this.now();
        if (!result || !hasUsableData(result.data)) {
          attempts.push({ provider: provider.id, durationMs: elapsedMs(startedAt, finishedAt), outcome: "empty" });
          continue;
        }
        return {
          ok: true as const,
          capability,
          provider: provider.id,
          observedAt: finishedAt.toISOString(),
          sourceObservedAt: result.sourceObservedAt ?? null,
          durationMs: elapsedMs(startedAt, finishedAt),
          provenance: {
            provider: provider.name,
            attribution: provider.attribution ?? null,
            dataBoundary: provider.dataBoundary,
          },
          data: result.data,
          attempts,
        };
      } catch {
        const finishedAt = this.now();
        attempts.push({ provider: provider.id, durationMs: elapsedMs(startedAt, finishedAt), outcome: "error" });
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
