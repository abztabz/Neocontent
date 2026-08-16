import { randomBytes } from "node:crypto";
import { createRepository } from "../../src/runtime.js";
import { createManualOperatorContentJob } from "../../src/operator/initial-content-job.js";
import { assertOperatorCsrf, assertSameOrigin, isOperatorAuthenticated, operatorCookies } from "../../src/operator/http-auth.js";
import type { VercelRequestLike, VercelResponseLike } from "../_http.js";

function html(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function sendResearchHtml(response: VercelResponseLike, status: number, body: string): void {
  const nonce = randomBytes(18).toString("base64");
  response.status(status);
  response.setHeader?.("content-type", "text/html; charset=utf-8");
  response.setHeader?.("cache-control", "no-store");
  response.setHeader?.("content-security-policy", `default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'nonce-${nonce}'`);
  response.setHeader?.("referrer-policy", "same-origin");
  response.setHeader?.("x-content-type-options", "nosniff");
  response.send?.(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Run Research Now · NeoContent</title><style nonce="${nonce}">:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f4f6f8}*{box-sizing:border-box}body{margin:0}.shell{width:min(760px,100%);margin:auto;padding:24px 18px 60px}a{color:#1456a0}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.card{background:#fff;border:1px solid #dfe4e8;border-radius:16px;padding:17px;margin:12px 0}.customer{font-weight:800;margin:0}.meta{margin:5px 0 14px;color:#687480;font-size:13px;overflow-wrap:anywhere}.button{border:0;border-radius:10px;padding:10px 14px;background:#1468d2;color:#fff;font:inherit;font-weight:800;cursor:pointer}.notice{border-left:4px solid #1468d2;background:#eef5ff;border-radius:8px;padding:12px 14px;line-height:1.45}.warning{border-left-color:#c47b00;background:#fff7e8}.empty{background:#fff;border:1px dashed #cbd2d8;border-radius:14px;padding:24px;color:#687480;text-align:center}@media(max-width:600px){.top{display:block}.top a{display:inline-block;margin-top:10px}.button{width:100%}}</style></head><body>${body}</body></html>`);
}

async function researchNow(request: VercelRequestLike, response: VercelResponseLike) {
  if (!isOperatorAuthenticated(request)) {
    response.setHeader?.("location", "/api/operator");
    response.status(303).send?.("");
    return;
  }

  const repository = createRepository();
  if (request.method === "POST") {
    try {
      assertSameOrigin(request);
      const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
      assertOperatorCsrf(request, body);
      const jobId = String(body.job_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Job identifier is invalid");
      const job = await repository.findOperatorContentJob(jobId);
      if (!job) throw new Error("Operator content job was not found");
      const site = job.sites && typeof job.sites === "object" && !Array.isArray(job.sites)
        ? job.sites as Record<string, unknown>
        : null;
      if (!site || String(site.id ?? "") !== String(job.site_id ?? "")) throw new Error("Customer site could not be resolved safely");
      const result = await createManualOperatorContentJob(repository, site);
      if (String((result as Record<string, unknown>).status ?? "") === "deferred") {
        const reason = html((result as Record<string, unknown>).reason ?? "Research is not eligible to run yet");
        return sendResearchHtml(response, 409, `<main class="shell"><div class="top"><h1>Research not started</h1><a href="/api/operator/research-now">Back</a></div><p class="notice warning">${reason}</p><p>No rule was bypassed. The existing research gates remain in force.</p></main>`);
      }
      response.setHeader?.("location", "/api/operator?view=action");
      response.status(303).send?.("");
      return;
    } catch (error) {
      return sendResearchHtml(response, 400, `<main class="shell"><div class="top"><h1>Research not started</h1><a href="/api/operator/research-now">Back</a></div><p class="notice warning">${html(error instanceof Error ? error.message : error)}</p></main>`);
    }
  }

  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });

  const jobs = await repository.listOperatorContentJobs(200);
  const latestBySite = new Map<string, Record<string, unknown>>();
  for (const job of jobs) {
    const siteId = String(job.site_id ?? "");
    if (siteId && !latestBySite.has(siteId)) latestBySite.set(siteId, job);
  }
  const csrf = html(operatorCookies(request).neo_operator_csrf ?? "");
  const cards = [...latestBySite.values()].map((job) => {
    const site = job.sites && typeof job.sites === "object" && !Array.isArray(job.sites)
      ? job.sites as Record<string, unknown>
      : {};
    return `<article class="card"><p class="customer">${html(site.business_name || "Unnamed customer")}</p><p class="meta">${html(site.website_url || "")} · Current workflow status: ${html(job.status || "unknown")}</p><form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="job_id" value="${html(job.id)}"><button class="button" type="submit">Run Research Now</button></form></article>`;
  }).join("");

  sendResearchHtml(response, 200, `<main class="shell"><div class="top"><div><p style="margin:0 0 5px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#687480">NeoContent operator</p><h1 style="margin:0">Run Research Now</h1></div><a href="/api/operator">Back to workspace</a></div><p class="notice"><strong>Additive manual trigger.</strong> This runs the same governed research pipeline immediately. It does not bypass website learning, operator-action, customer-review queue, Source Registry, Editorial DNA, evidence, or security rules, and it does not replace the scheduled cadence.</p>${cards || '<div class="empty">No operator-managed customer jobs are available yet.</div>'}</main>`);
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  const requestedView = Array.isArray(request.query.view) ? request.query.view[0] : request.query.view;
  if (requestedView === "research-now") return researchNow(request, response);

  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  response.setHeader?.("content-type", "application/manifest+json; charset=utf-8");
  response.setHeader?.("cache-control", "public, max-age=3600");
  response.json({
    id: "/api/operator",
    name: "NeoContent Operator",
    short_name: "NeoContent",
    description: "Private NeoContent operator workspace",
    start_url: "/api/operator?view=action",
    scope: "/api/operator",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#17202a",
    shortcuts: [
      {
        name: "Run Research Now",
        short_name: "Research Now",
        description: "Run an additional governed research cycle without replacing the scheduled cadence",
        url: "/api/operator/research-now",
      },
    ],
  });
}
