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
      select: "*", enabled: "eq.true", workflow_mode: "eq.cloud_api", next_run_at: `lte.${new Date().toISOString()}`,
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

  async updateKnowledgeCandidate(id: string, siteId: string, patch: Record<string, unknown>) {
    const query = new URLSearchParams({ id: `eq.${id}`, site_id: `eq.${siteId}` });
    const rows = await this.request<Record<string, unknown>[]>(`knowledge_candidates?${query.toString()}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    if (!rows[0]) throw new Error("Knowledge candidate was not found for this site");
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

  async findUserSourceForSite(id: string, siteId: string) {
    const query = new URLSearchParams({ select: "*", id: `eq.${id}`, site_id: `eq.${siteId}`, limit: "1" });
    const rows = await this.request<Record<string, unknown>[]>(`user_sources?${query.toString()}`);
    return rows[0] ?? null;
  }

  async updateUserSource(id: string, siteId: string, patch: Record<string, unknown>) {
    const query = new URLSearchParams({ id: `eq.${id}`, site_id: `eq.${siteId}` });
    const rows = await this.request<Record<string, unknown>[]>(`user_sources?${query.toString()}`, {
      method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) throw new Error("Source was not found for this site");
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

  async insertOperatorContentJob(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("operator_content_jobs?on_conflict=site_id,idempotency_key", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(input),
    });
    if (rows[0]) return rows[0];
    const existing = await this.request<Record<string, unknown>[]>(
      `operator_content_jobs?select=*&site_id=eq.${encodeURIComponent(String(input.site_id))}&idempotency_key=eq.${encodeURIComponent(String(input.idempotency_key))}&limit=1`,
    );
    return existing[0] ?? null;
  }

  async listCustomerContentJobs(siteId: string, limit = 50) {
    const query = new URLSearchParams({
      select: "id,topic,customer_summary,status,created_at,updated_at,delivered_at,reviewed_at,external_post_id",
      site_id: `eq.${siteId}`,
      order: "created_at.desc",
      limit: String(Math.min(Math.max(limit, 1), 100)),
    });
    return this.request<Record<string, unknown>[]>(`operator_content_jobs?${query.toString()}`);
  }

  async listOperatorContentJobs(limit = 100) {
    const query = new URLSearchParams({
      select: "*,sites(business_name,website_url)",
      order: "created_at.desc",
      limit: String(Math.min(Math.max(limit, 1), 200)),
    });
    return this.request<Record<string, unknown>[]>(`operator_content_jobs?${query.toString()}`);
  }

  async findOperatorContentJob(id: string) {
    const rows = await this.request<Record<string, unknown>[]>(
      `operator_content_jobs?select=*,sites(*)&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ?? null;
  }

  async updateOperatorContentJob(id: string, patch: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>(`operator_content_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) throw new Error("Operator content job was not found");
    return rows[0];
  }

  async updateOperatorContentJobForSite(id: string, siteId: string, patch: Record<string, unknown>) {
    const query = new URLSearchParams({ id: `eq.${id}`, site_id: `eq.${siteId}` });
    const rows = await this.request<Record<string, unknown>[]>(`operator_content_jobs?${query.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) throw new Error("Operator content job was not found for this site");
    return rows[0];
  }

  async insertOperatorAuditEvent(input: Record<string, unknown>) {
    const rows = await this.request<Record<string, unknown>[]>("operator_audit_events", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return rows[0] ?? null;
  }

  async listOperatorAuditEvents(limit = 500) {
    const query = new URLSearchParams({
      select: "id,job_id,event_type,actor_type,outcome,metadata,occurred_at",
      order: "occurred_at.desc",
      limit: String(Math.min(Math.max(limit, 1), 1000)),
    });
    return this.request<Record<string, unknown>[]>(`operator_audit_events?${query.toString()}`);
  }

  async listRunsSince(siteId: string, since: string, limit = 3) {
    const query = new URLSearchParams({
      select: "id,started_at",
      site_id: `eq.${siteId}`,
      started_at: `gte.${since}`,
      order: "started_at.desc",
      limit: String(limit),
    });
    return this.request<Record<string, unknown>[]>(`runs?${query.toString()}`);
  }

  async findRunByIdempotencyKey(siteId: string, idempotencyKey: string) {
    const query = new URLSearchParams({
      select: "id,status,article_id,reason,completed_at",
      site_id: `eq.${siteId}`,
      idempotency_key: `eq.${idempotencyKey}`,
      limit: "1",
    });
    const rows = await this.request<Record<string, unknown>[]>(`runs?${query.toString()}`);
    return rows[0] ?? null;
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
