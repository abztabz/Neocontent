import type { VercelRequestLike, VercelResponseLike } from "../_http.js";

export default function handler(request: VercelRequestLike, response: VercelResponseLike) {
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
  });
}
