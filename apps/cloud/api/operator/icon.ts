import type { VercelRequestLike, VercelResponseLike } from "../_http.js";

export default function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  response.setHeader?.("content-type", "image/svg+xml; charset=utf-8");
  response.setHeader?.("cache-control", "public, max-age=86400");
  response.send?.('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#17202a"/><path d="M48 143V49h20l56 60V49h20v94h-19L68 82v61z" fill="#fff"/><circle cx="144" cy="49" r="13" fill="#4f9cff"/></svg>');
}
