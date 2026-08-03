# Neo Authority Engine V1 Deployment

## Required services

- Vercel project with Root Directory set to `apps/cloud`
- Supabase PostgreSQL project
- OpenAI API project with Responses API access
- HTTPS WordPress test site with administrator access

## 1. Database

Apply migrations in order:

1. `supabase/migrations/001_v1_foundation.sql`
2. `supabase/migrations/002_source_review_suggestions.sql`
3. `supabase/migrations/003_request_replay_guard.sql`

After applying migrations, run Supabase security and performance advisors. The service-role key must remain server-side and must never be added to WordPress.

## 2. Cloud environment

Configure these Vercel environment variables for Preview and Production:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_RESEARCH_MODEL=gpt-5-mini
NEO_SECRET_ENCRYPTION_KEY=
CRON_SECRET=
```

Generate `NEO_SECRET_ENCRYPTION_KEY` as 32 random bytes encoded in base64. Generate `CRON_SECRET` as an independent high-entropy secret.

## 3. Vercel

- Import the GitHub repository.
- Set Root Directory to `apps/cloud`.
- Deploy a Preview build first.
- Confirm the serverless routes are present.
- Do not promote to Production until the end-to-end WordPress draft gate passes.

## 4. WordPress

Download the `neo-authority-engine-wordpress-v1` artifact from the latest successful CI run and upload the ZIP under **Plugins → Add New → Upload Plugin**.

In **Neo Authority → Settings**:

1. Enter the Vercel deployment URL.
2. Complete the business profile.
3. Select **Save for approval** for the first test.
4. Select **Balanced** or **Industry authority**.
5. Save settings.
6. Register/sync the site.

In **Knowledge Review**:

1. Scan the website.
2. Review every candidate.
3. Approve only accurate business statements.

In **Neo Authority**:

1. Add at least one authoritative source URL.
2. Review the trust and freshness assessment.
3. Select the evidence statements the engine may use.
4. Approve the source.

## 5. End-to-end acceptance gate

Run **Generate blog now** and verify:

- exactly one WordPress draft is created;
- the title does not duplicate an existing article;
- business claims match approved knowledge;
- material industry claims map to approved or live governed sources;
- source URLs, publishers, dates, and retrieval records are retained;
- the article is blocked when evidence is insufficient;
- replaying the same request does not create another post;
- pending knowledge changes block the run;
- the run and article records are stored in Supabase.

Only after this gate passes should the PR be marked ready and the Vercel deployment promoted to Production.
