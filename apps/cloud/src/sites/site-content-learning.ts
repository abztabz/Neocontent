import { createHash, randomUUID } from "node:crypto";
import type { SupabaseRepository } from "../db/supabase.js";
import { requestWordPressPinned } from "../publishing/wordpress-publisher.js";
import { detectPromptInjection } from "../research/extract-source.js";
import { decryptSecret } from "../security/secret-vault.js";
import { signRequest } from "../security/signatures.js";

type LearningRepository = Pick<SupabaseRepository,
  "findActiveContentSyncRun" | "insertContentSyncRun" | "updateContentSyncRun"
  | "upsertSiteContentItems" | "markSiteContentSnapshotCurrent" | "updateSite"
>;

type WordPressRequester = typeof requestWordPressPinned;

interface InventoryItem {
  externalContentId: string;
  contentType: "post" | "page" | "custom" | "media" | "site";
  subtype: string;
  url: string;
  title: string;
  excerpt: string;
  contentText: string;
  contentHash: string;
  voiceEligible: boolean;
  publishedAt: string | null;
  modifiedAt: string | null;
  metadata: Record<string, unknown>;
}

function text(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

function safeDate(value: unknown): string | null {
  const date = Date.parse(String(value ?? ""));
  return Number.isFinite(date) ? new Date(date).toISOString() : null;
}

function sameOriginUrl(value: unknown, origin: string): string {
  const raw = text(value, 2048);
  if (!raw) return "";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.hash) {
    throw new Error("Inventory item URL is outside the registered website");
  }
  return url.toString();
}

export function validateInventoryItem(value: unknown, origin: string): InventoryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Inventory item is invalid");
  const item = value as Record<string, unknown>;
  const contentType = text(item.contentType, 20) as InventoryItem["contentType"];
  if (!["post", "page", "custom", "media", "site"].includes(contentType)) throw new Error("Inventory content type is invalid");
  const externalContentId = text(item.externalContentId, 200);
  const contentHash = text(item.contentHash, 64);
  if (!externalContentId || !/^[0-9a-f]{64}$/.test(contentHash)) throw new Error("Inventory identity is invalid");
  const contentText = text(item.contentText, 50_000);
  const warnings = detectPromptInjection(contentText);
  const suppliedMetadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown> : {};
  const withWarnings = { ...suppliedMetadata, promptInjectionWarnings: warnings };
  const serializedMetadata = JSON.stringify(withWarnings);
  const metadata = serializedMetadata.length <= 20_000
    ? JSON.parse(serializedMetadata) as Record<string, unknown>
    : { promptInjectionWarnings: warnings, metadataTruncated: true };
  return {
    externalContentId,
    contentType,
    subtype: text(item.subtype, 100),
    url: sameOriginUrl(item.url, origin),
    title: text(item.title, 1000),
    excerpt: text(item.excerpt, 5000),
    contentText,
    contentHash,
    voiceEligible: item.voiceEligible === true && warnings.length === 0,
    publishedAt: safeDate(item.publishedAt),
    modifiedAt: safeDate(item.modifiedAt),
    metadata,
  };
}

export function inventoryUrl(site: Record<string, unknown>): URL {
  const callback = new URL(String(site.callback_url ?? ""));
  if (callback.protocol !== "https:" || callback.username || callback.password || (callback.port && callback.port !== "443")) {
    throw new Error("WordPress inventory origin is invalid");
  }
  if (!/(?:^|\/)wp-json\/neo-authority\/v1\/publish\/?$/.test(callback.pathname)) {
    throw new Error("WordPress inventory path is invalid");
  }
  callback.pathname = callback.pathname.replace(/publish\/?$/, "content-inventory");
  callback.search = "";
  callback.hash = "";
  return callback;
}

async function readInventoryPage(site: Record<string, unknown>, cursor: string, snapshotId: string, requester: WordPressRequester) {
  const url = inventoryUrl(site);
  const body = JSON.stringify({ cursor, perPage: 20, snapshotId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: decryptSecret(String(site.encrypted_site_secret ?? "")),
    purpose: "cloud-inventory",
    method: "POST",
    path: url.pathname,
    timestamp,
    body,
  });
  const response = await requester({
    url,
    method: "POST",
    body,
    timeoutMs: 12_000,
    maximumBytes: 750_000,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-neo-site-id": String(site.external_site_id ?? ""),
      "x-neo-timestamp": timestamp,
      "x-neo-signature": signature,
    },
  });
  if (response.status === 404) throw new Error("WORDPRESS_INVENTORY_UPGRADE_REQUIRED");
  if (response.status !== 200 || !response.contentType.toLowerCase().includes("application/json")) {
    throw new Error(`WORDPRESS_INVENTORY_HTTP_${response.status}`);
  }
  const payload = JSON.parse(response.body) as Record<string, unknown>;
  if (payload.schemaVersion !== "neo-site-inventory-v1" || payload.snapshotId !== snapshotId || payload.cursor !== cursor) {
    throw new Error("WORDPRESS_INVENTORY_SCHEMA_INVALID");
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length > 20) throw new Error("WORDPRESS_INVENTORY_PAGE_TOO_LARGE");
  const nextCursor = payload.nextCursor === null ? null : text(payload.nextCursor, 100);
  if (nextCursor !== null && !/^(content|media):\d{1,7}$/.test(nextCursor)) throw new Error("WORDPRESS_INVENTORY_CURSOR_INVALID");
  const validated = items.map((item) => validateInventoryItem(item, url.origin));
  if (cursor === "content:0" && payload.site && typeof payload.site === "object" && !Array.isArray(payload.site)) {
    const snapshot = payload.site as Record<string, unknown>;
    const name = text(snapshot.name, 300);
    const description = text(snapshot.description, 1000);
    const locale = text(snapshot.locale, 50);
    const homeUrl = sameOriginUrl(snapshot.homeUrl, url.origin);
    const menus = Array.isArray(snapshot.menus) ? snapshot.menus.slice(0, 20) : [];
    const menuText = menus.map((menu) => {
      if (!menu || typeof menu !== "object" || Array.isArray(menu)) return "";
      const record = menu as Record<string, unknown>;
      const entries = Array.isArray(record.items) ? record.items.slice(0, 100) : [];
      return `${text(record.name, 200)}: ${entries.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
        const item = entry as Record<string, unknown>;
        const itemUrl = sameOriginUrl(item.url, url.origin);
        return `${text(item.label, 300)} (${itemUrl})`;
      }).filter(Boolean).join(", ")}`;
    }).filter(Boolean).join("\n").slice(0, 20_000);
    const contentText = `${name}\n${description}\n${menuText}`.trim();
    validated.unshift({
      externalContentId: "site:snapshot",
      contentType: "site",
      subtype: "navigation",
      url: homeUrl,
      title: name,
      excerpt: description,
      contentText,
      contentHash: createHash("sha256").update(`${homeUrl}\n${locale}\n${contentText}`).digest("hex"),
      voiceEligible: false,
      publishedAt: null,
      modifiedAt: null,
      metadata: { locale, menus },
    });
  }
  return { items: validated, nextCursor };
}

export async function processSiteContentLearning(
  repository: LearningRepository,
  site: Record<string, unknown>,
  maximumPages = 4,
  requester: WordPressRequester = requestWordPressPinned,
) {
  const siteId = String(site.id ?? "");
  const organizationId = String(site.organization_id ?? "");
  if (!siteId || !organizationId) throw new Error("Registered site cannot start content learning");
  let run = await repository.findActiveContentSyncRun(siteId);
  if (!run) run = await repository.insertContentSyncRun({
    organization_id: organizationId,
    site_id: siteId,
    snapshot_id: randomUUID(),
    status: "pending",
    cursor: "content:0",
  });
  if (!run) throw new Error("Content learning run could not be created");
  const runId = String(run.id);
  const snapshotId = String(run.snapshot_id);
  let cursor = String(run.cursor || "content:0");
  let processed = Number(run.processed_count ?? 0);
  await repository.updateSite(siteId, { content_learning_status: "learning" });
  await repository.updateContentSyncRun(runId, { status: "running", started_at: run.started_at ?? new Date().toISOString() });

  try {
    for (let page = 0; page < Math.min(Math.max(maximumPages, 1), 10); page += 1) {
      const result = await readInventoryPage(site, cursor, snapshotId, requester);
      const now = new Date().toISOString();
      await repository.upsertSiteContentItems(result.items.map((item) => ({
        organization_id: organizationId,
        site_id: siteId,
        external_content_id: item.externalContentId,
        content_type: item.contentType,
        subtype: item.subtype,
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        content_text: item.contentText,
        content_hash: item.contentHash,
        voice_eligible: item.voiceEligible,
        is_current: true,
        published_at: item.publishedAt,
        modified_at: item.modifiedAt,
        metadata: item.metadata,
        last_seen_snapshot_id: snapshotId,
        updated_at: now,
      })));
      processed += result.items.length;
      if (result.nextCursor === null) {
        await repository.markSiteContentSnapshotCurrent(siteId, snapshotId);
        const completedAt = new Date().toISOString();
        const nextSync = new Date(Date.now() + 7 * 86400_000).toISOString();
        await repository.updateContentSyncRun(runId, { status: "completed", processed_count: processed, cursor, completed_at: completedAt, error_code: "" });
        await repository.updateSite(siteId, {
          content_learning_status: "completed",
          content_learning_completed_at: completedAt,
          content_learning_next_sync_at: nextSync,
          content_item_count: processed,
          content_learning_version: 1,
        });
        return { status: "completed", processedCount: processed };
      }
      cursor = result.nextCursor;
      await repository.updateContentSyncRun(runId, { status: "running", cursor, processed_count: processed });
    }
    return { status: "learning", processedCount: processed, cursor };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "CONTENT_LEARNING_FAILED";
    const upgrade = code === "WORDPRESS_INVENTORY_UPGRADE_REQUIRED";
    await repository.updateContentSyncRun(runId, { status: upgrade ? "upgrade_required" : "failed", error_code: code });
    await repository.updateSite(siteId, { content_learning_status: upgrade ? "upgrade_required" : "failed" });
    throw error;
  }
}
