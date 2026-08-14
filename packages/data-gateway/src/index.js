import { providersFor } from './registry.js';

export class NeoDataGateway {
  constructor({ adapters = {}, now = () => new Date() } = {}) {
    this.adapters = adapters;
    this.now = now;
  }

  async request(capability, input, options = {}) {
    const candidates = providersFor(capability, options);
    const attempts = [];

    for (const provider of candidates) {
      const adapter = this.adapters[provider.id];
      if (!adapter) continue;

      const startedAt = this.now();
      try {
        const payload = await adapter(input);
        const observedAt = this.now().toISOString();
        if (payload == null) throw new Error('Provider returned no data');

        return {
          ok: true,
          capability,
          provider: provider.id,
          observedAt,
          provenance: {
            provider: provider.name,
            status: provider.status,
          },
          data: payload,
          attempts,
        };
      } catch (error) {
        attempts.push({
          provider: provider.id,
          startedAt: startedAt.toISOString(),
          failedAt: this.now().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      ok: false,
      capability,
      observedAt: this.now().toISOString(),
      attempts,
      error: 'No eligible provider returned usable data',
    };
  }
}

export { PROVIDER_STATUS, providersFor, sourceRegistry } from './registry.js';
