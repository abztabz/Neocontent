# Neo Authority Engine

Neo Authority Engine is a governed content-automation platform for existing WordPress websites.

## V1 promise

Connect a WordPress website and receive evidence-backed articles through a deliberately simple customer experience: topics appear under Researching, finished work arrives under Drafts, and the website owner edits, approves, rejects, or requests changes.

## V1 scope

- WordPress connector plugin
- Hosted cloud engine
- Private business discovery and governed knowledge base
- Live industry research from trusted sources
- Source trust and freshness checks
- Claim-to-source mapping
- Customer draft editing, approval, rejection, and change requests
- Scheduled background execution
- HMAC-authenticated plugin/cloud communication
- Idempotent publishing and audit history
- Private NeoOS operator queue for briefing and draft delivery
- Operator-managed ChatGPT generation with no customer API charges
- Strict separation between customer status data and private briefs/draft payloads

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

V1.3 private-operator workflow is in release-candidate development under Atlas engineering ownership with Aegis security oversight. The earlier customer-visible V1.2 manual workflow is withdrawn.
