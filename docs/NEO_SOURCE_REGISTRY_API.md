# NeoOS Source Registry API

The Source Registry exposes one public, read-only governance endpoint:

`GET /api/v1/source-registry`

Optional filter:

`GET /api/v1/source-registry?capability=economic-data`

The endpoint returns `neo-source-registry-v1` metadata for declared capabilities and governed providers. It exists so Neo products can inspect source readiness without importing NeoContent code or knowing provider secrets.

The endpoint is intentionally safe to cache and expose cross-origin. It returns governance metadata only: capability purpose/readiness, provider status, commercial-use and free-tier boundaries, source quality, adapter status, priority, attribution, quota notes, freshness policy, region coverage, data boundary, official terms/documentation URLs and review date.

It never returns API keys, secret values, secret environment-variable names, customer data, research queries, provider payloads or an operation that executes a provider request.

Provider execution remains inside Neo Data Gateway and is separately governed. A product must not infer that an `experimental` provider is production-approved merely because it appears in this endpoint.

Mutation methods return `405`. Unknown capability filters return `404`.
