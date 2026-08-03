export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export class SupabaseRepository {
  constructor(private readonly config: SupabaseConfig) {
    if (!config.url || !config.serviceRoleKey) throw new Error("Supabase configuration is incomplete");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        authorization: `Bearer ${this.config.serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  async findSiteByExternalId(externalSiteId: string) {
    const query = new URLSearchParams({ select: "*", external_site_id: `eq.${externalSiteId}`, limit: "1" });
    const rows = await this.request<Record<string, unknown>[]>(`sites?${query.toString()}`);
    return rows[0] ?? null;
  }

  async consumeRequestSignature(siteId: string, signatureHash: string): Promise<void> {
    try {
      await this.request<Record<string, unknown>[]>("request_replay_guard", {
        method: "POST",
        body: JSON.stringify({
          site_id: siteId,
          signature_hash: signatureHash,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate key|23505/i.test(message)) throw new Error("Signed request replay detected");
      throw error;
    }
  }

  async listDueSites(limit = 20) {
    const query = new URLSearchParams({
      select: "*", enabled: "eq.true", next_run_at: `lte.${new Date().toISOString()}`,
      order: "next_run_at.asc", limit: String(limit),
    });
    return this.request<Record<string, unknown>[]>(`sites?${query.toString()}`);
  }

  async createOrganization(name: string) {
    const rows = await this.request<Record<string, unknown>[]>("organizations", { method: "POST", body: JSON.stringify({ name }) });
    return rows[0];
  }

  async upsertSite(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("sites?on_conflict=organization_id,external_site_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(input),
    });
    return rows[0];
  }

  async updateSite(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`sites?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return rows[0];
  }

  async insertKnowledgeCandidate(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("knowledge_candidates?on_conflict=site_id,fingerprint", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(input),
    });
    return rows[0] ?? null;
  }

  async updateKnowledgeCandidate(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`knowledge_candidates?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    return rows[0];
  }

  async listPendingKnowledgeCandidates(siteId: string) {
    const query = new URLSearchParams({ select: "*", site_id: `eq.${siteId}`, status: "eq.pending", order: "detected_at.desc" });
    return this.request<Record<string, unknown>[]>(`knowledge_candidates?${query.toString()}`);
  }

  async upsertKnowledgeItem(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("knowledge_items", {
      method: "POST", body: JSON.stringify(input),
    });
    return rows[0];
  }

  async insertUserSource(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("user_sources", { method: "POST", body: JSON.stringify(input) });
    return rows[0];
  }

  async updateUserSource(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`user_sources?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return rows[0];
  }

  async listApprovedKnowledge(siteId: string) {
    const query = new URLSearchParams({ select: "*", site_id: `eq.${siteId}`, status: "eq.approved", order: "approved_at.desc" });
    return this.request<Record<string, unknown>[]>(`knowledge_items?${query.toString()}`);
  }

  async listApprovedSources(siteId: string) {
    const query = new URLSearchParams({ select: "*", site_id: `eq.${siteId}`, status: "eq.approved", order: "updated_at.desc" });
    return this.request<Record<string, unknown>[]>(`user_sources?${query.toString()}`);
  }

  async listRecentArticles(siteId: string, limit = 30) {
    const query = new URLSearchParams({ select: "title,status,created_at", site_id: `eq.${siteId}`, order: "created_at.desc", limit: String(limit) });
    return this.request<Record<string, unknown>[]>(`articles?${query.toString()}`);
  }

  async insertArticle(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("articles", { method: "POST", body: JSON.stringify(input) });
    return rows[0];
  }

  async updateArticle(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`articles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return rows[0];
  }

  async insertRun(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("runs", { method: "POST", body: JSON.stringify(input) });
    return rows[0];
  }

  async updateRun(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`runs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return rows[0];
  }
}
