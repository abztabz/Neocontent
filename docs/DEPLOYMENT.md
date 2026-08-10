# Neo Authority Engine V1 Deployment

## Required services

- Vercel project with Root Directory set to `apps/cloud`
- Supabase PostgreSQL project
- HTTPS WordPress test site with administrator access

The operator-managed workflow uses the operator's existing ChatGPT access. Customers never receive ChatGPT, prompt, briefing, JSON-import, model, or API controls. An OpenAI API key is optional and is required only if a future site is explicitly migrated to automated cloud generation.

## 1. Database

Apply migrations in order:

1. `supabase/migrations/001_v1_foundation.sql`
2. `supabase/migrations/002_source_review_suggestions.sql`
3. `supabase/migrations/003_request_replay_guard.sql`
4. `supabase/migrations/004_security_hardening.sql`
5. `supabase/migrations/005_operator_content_queue.sql`
6. `supabase/migrations/006_operator_command_center.sql`
7. `supabase/migrations/007_operator_push_notifications.sql`

After applying migrations, run Supabase security and performance advisors. The service-role key must remain server-side and must never be added to WordPress.

## 2. Cloud environment

Configure these Vercel environment variables for Production:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY= # optional; leave unset for operator-managed-only deployments
OPENAI_MODEL=gpt-5-mini
OPENAI_RESEARCH_MODEL=gpt-5-mini
NEO_SECRET_ENCRYPTION_KEY=
CRON_SECRET=
NEO_REGISTRATION_TOKEN=
NEO_OPERATOR_TOKEN=
NEO_VAPID_SUBJECT=mailto:operator@example.com
NEO_VAPID_PUBLIC_KEY=
NEO_VAPID_PRIVATE_KEY=
NEO_MAX_MANUAL_RUNS_PER_HOUR=3
```

Generate `NEO_SECRET_ENCRYPTION_KEY` as 32 random bytes encoded in base64. Generate `CRON_SECRET`, `NEO_REGISTRATION_TOKEN`, and `NEO_OPERATOR_TOKEN` as independent high-entropy secrets of at least 32 characters. `NEO_REGISTRATION_TOKEN` is reserved for controlled server-to-server enrollment and is never shown to a website owner. The operator token must remain private to the NeoOS operator.

Generate one VAPID key pair with `npx web-push generate-vapid-keys --json`. Store the public and private values in their matching Vercel variables and set `NEO_VAPID_SUBJECT` to an operator-controlled `mailto:` address. Never put the private VAPID key in WordPress, Git, screenshots, or chat.

Do not expose Production secrets to Preview deployments. Use a separate Supabase project and separate OpenAI, encryption, cron, and registration credentials for Preview, or disable Preview environment access until that isolation exists.

## 3. Vercel

- Import the GitHub repository.
- Set Root Directory to `apps/cloud`.
- Deploy a Preview build first.
- Confirm the serverless routes are present.
- Do not promote to Production until the end-to-end WordPress draft gate passes.

## 4. WordPress

Download the `neo-authority-engine-wordpress-v1.5.2` artifact from the latest successful CI run and upload the ZIP under **Plugins → Add New → Upload Plugin**. Website owners connect with one button; no license or enrollment key is shown. The Connect form posts directly from the browser to NeoContent, bypassing the customer host's constrained WordPress POST handling. NeoContent sends a purpose-separated signed callback that marks the plugin pending. WordPress performs no activation-time outbound request and runs no NeoContent polling cron. New sites remain pending until approved in the private operator dashboard, after which the cloud sends a separate signed activation callback to WordPress.

During activation:

1. Complete the business profile.
2. Choose the content focus and cadence.
3. Select **Connect NeoContent**.
4. The browser returns after NeoContent securely marks the request pending.
5. Approve the request in the private operator dashboard.

After activation, the customer sees only **Researching** and **Drafts**. Private briefs and completed JSON are accessible only at `/api/operator` after operator authentication.

## 5. End-to-end acceptance gate

Approve the browser-mediated connection and verify:

- exactly one WordPress draft is created;
- the title does not duplicate an existing article;
- business claims match approved knowledge;
- material industry claims map to approved or live governed sources;
- source URLs, publishers, dates, and retrieval records are retained;
- the article is blocked when evidence is insufficient;
- replaying the same request does not create another post;
- the customer status endpoint never returns `brief_payload`, `draft_payload`, or operator feedback;
- the operator can retrieve the private brief and deliver a valid completed JSON draft;
- invalid operator sessions and CSRF tokens are rejected;
- the customer can edit, approve/publish, reject, or request changes;
- revisions replace only the existing unpublished draft;
- operator-managed sites never enter the paid-model cron path;
- WordPress contains no scheduled NeoContent polling or operator-sync event;
- a blocked cloud request cannot replace the WordPress admin page with a 503 response;
- job and review states are stored in Supabase.
- the installed Home Screen operator app can subscribe, receive a generic test alert, deep-link to `/api/operator?view=action`, disable alerts, and remove an expired subscription;
- Lock Screen notification payloads reveal no customer, article, status count, feedback, brief, or job identifier.

Only after this gate passes should the PR be marked ready and the Vercel deployment promoted to Production.
