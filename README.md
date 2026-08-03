# Neo Authority Engine

Neo Authority Engine is a governed content-automation platform for existing WordPress websites.

## V1 promise

Connect a WordPress website, review what the engine has learned about the business, add trusted source URLs, choose a publishing schedule, and generate one evidence-backed blog per content cycle.

## V1 scope

- WordPress connector plugin
- Hosted cloud engine
- Business discovery and approved knowledge base
- Knowledge-change approval before use
- User-added source URLs
- Live industry research from trusted sources
- Source trust and freshness checks
- Claim-to-source mapping
- Auto-publish or approval-required publishing
- Scheduled background execution
- HMAC-authenticated plugin/cloud communication
- Idempotent publishing and audit history

## Repository structure

```text
apps/cloud/                 Hosted Neo Authority Cloud
plugins/wordpress/          WordPress connector
packages/core/              Shared domain types and validation
supabase/migrations/        Database migrations
docs/                       Product and engineering documentation
.github/workflows/          CI workflows
```

## Status

V1 implementation is in progress under Atlas engineering ownership.
