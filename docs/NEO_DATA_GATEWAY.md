# Neo Data Gateway

## Purpose

Neo Data Gateway is the provider-independent external-data layer for Neo products. Products request a capability rather than calling a vendor directly.

The `public-apis/public-apis` repository is discovery input only. Listing there never makes a provider trusted or approved.

The first deployable runtime lives in `apps/cloud/src/data-gateway` so it is compiled, tested and deployed with the existing NeoContent cloud service. The provider contract remains product-independent; other Neo products should consume a governed service boundary rather than call vendors directly.

## Governance

Provider lifecycle:

- `experimental`: candidate under evaluation; never used by production selection unless an explicit experimental capability gate is enabled;
- `approved`: cleared for the explicitly documented capability and data boundary;
- `blocked`: explicitly prohibited;
- `retired`: previously usable but no longer selected.

Before promotion to `approved`, review security, licensing/commercial use, privacy, reliability, freshness, rate limits, data accuracy and the exact data fields being retained.

Provider requests are HTTPS-only, origin-pinned, bounded, time-limited and redirect-disabled. Provider results are normalized before they enter NeoContent. Every successful result carries provenance and observation time. An empty provider result is treated as unavailable for that request so a fallback can be tried.

## Approved discovery providers

### GDELT DOC 2.0

Capability: `news-discovery`.

GDELT permits unrestricted commercial use of its datasets subject to GDELT attribution. NeoContent retains only discovery metadata such as headline, publisher/domain, date and source URL. A GDELT result is never treated as verification of the linked publisher's claim and does not grant rights to reproduce the linked article.

Terms: https://www.gdeltproject.org/about.html#termsofuse

### Crossref REST API

Capability: primary `scholarly-discovery` provider.

NeoContent uses public Crossref bibliographic metadata to locate potentially relevant scholarly works. It deliberately excludes abstracts and full text. A Crossref record is a discovery lead; the underlying work and its rights must be inspected before quotation or factual reliance.

Documentation: https://www.crossref.org/documentation/retrieve-metadata/rest-api/

`NEO_CROSSREF_MAILTO` may optionally identify NeoContent to Crossref's polite pool. It is not a required secret or credential.

### DataCite REST API

Capability: fallback `scholarly-discovery` provider.

DataCite's public API requires no authentication for DOI metadata retrieval, and DataCite makes its aggregated DOI metadata available under CC0. NeoContent retains only normalized bibliographic metadata and does not infer rights to linked resources. DataCite is attempted when Crossref fails or returns no usable records.

Documentation: https://support.datacite.org/docs/api

Metadata use policy: https://support.datacite.org/docs/datacite-data-file-use-policy

## Free-first SEO intelligence

Capability: `seo-serp-discovery`.

NeoContent now has adapters for two third-party SERP providers with free entry tiers:

- **SerpApi** — adapter implemented; current free plan advertises 250 searches per month. The adapter retains only organic ranking metadata, related questions/searches and a coarse result-count estimate. Snippets are deliberately discarded.
- **Zenserp** — adapter implemented as an experimental fallback; current free plan advertises 50 searches per month. Snippets/descriptions are deliberately discarded.

Two additional candidates are governed in the registry:

- **Serper** — experimental candidate because its current free allowance is materially larger, but no production adapter is enabled until its API contract and usage terms complete the same review.
- **serpstack** — blocked for NeoContent production under the currently published license terms.

The SEO capability is fail-closed. It runs only when `NEO_ENABLE_EXPERIMENTAL_SEO=true` and at least one provider credential is present server-side:

- `NEO_SERPAPI_KEY`
- `NEO_ZENSERP_KEY`

SERP intelligence is never factual evidence and is never represented as measured search volume, traffic or keyword difficulty. It is used to observe ranking pages, related queries, audience questions and current search-result language. Result-count estimates are explicitly labelled as search-engine result estimates only.

## Experimental providers

SEC EDGAR and FRED remain experimental. They are not selected by production requests until their dedicated adapters, usage constraints and data contracts are reviewed.

## NeoContent integration

Before an operator-managed Luna brief is created, NeoContent now:

1. learns the customer's public website;
2. selects a distinct content opportunity;
3. requests bounded current-news and scholarly discovery metadata through Neo Data Gateway;
4. optionally requests one bounded SERP snapshot when the free-first SEO capability is explicitly enabled;
5. runs independent capability requests in parallel while preserving sequential fallbacks inside each capability;
6. deduplicates factual discovery records before they enter the brief;
7. assigns a temporal role to each factual lead so current signals are not confused with historical context;
8. keeps SEO signals separate from factual research leads;
9. embeds normalized records in `externalResearchLeads` with an explicit discovery-only instruction;
10. requires Luna to independently verify any underlying factual source before using it as evidence;
11. continues creating the brief even if every external discovery provider is unavailable.

Provider availability therefore improves research speed without becoming a queue dependency or a source-of-truth shortcut.

## Research lead quality

Discovery records are curated before they enter Luna's governed brief:

- duplicates are collapsed by DOI first, then normalized HTTPS URL, then normalized title;
- common tracking parameters and URL fragments are ignored for duplicate detection;
- all records are explicitly reset to `verificationStatus: discovery_only` even if upstream metadata suggests otherwise;
- brief payloads are capped at 13 discovery leads;
- news records are labelled `current_signal`, `recent_signal`, or `historical_signal` based on publication date;
- scholarly records are labelled `recent_research` or `established_research`;
- missing dates are labelled `unknown_time` rather than guessed.

Luna is instructed to use these temporal roles only as research context. A historical news item cannot establish that a premise is current, and a discovery lead still requires independent verification.

## Observability and audit privacy

The gateway records only operational telemetry needed to judge source health:

- capability;
- selected provider;
- item count;
- request duration;
- fallback count;
- fallback provider identifier and coarse outcome (`error` or `empty`).

It deliberately does **not** persist research queries, article titles, source URLs, provider response bodies, raw exception messages, customer knowledge, or private website content in gateway health telemetry.

Each created content job stores a compact research summary in the existing operator audit event. This makes provider availability and fallback behavior reviewable without adding a new database table or placing research content in audit metadata.

The cloud runtime emits the same privacy-safe discovery summary to structured application logs. Provider failures remain non-blocking: health information is useful for operations but never becomes a dependency for creating a brief.

## Future product boundary

NeoCRM, NeoOS Wealth and future Neo products should consume normalized gateway capabilities rather than provider-specific endpoints. A shared authenticated service endpoint should only be introduced after inter-product authentication, tenant isolation and rate-governance are defined.
