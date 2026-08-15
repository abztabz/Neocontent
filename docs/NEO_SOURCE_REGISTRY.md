# NeoOS Source Registry

## Purpose

The Source Registry is the governed catalogue behind Neo Data Gateway. It is shared infrastructure for NeoContent, NeoCRM, NeoOS Wealth, the Living Website and future Neo products. It is not a NeoContent feature.

A listing in a public API directory is discovery input only. A provider enters this registry only after its official documentation, usage terms, authentication model, data rights, freshness, privacy implications and rate limits have been reviewed.

## Definition of complete

The registry is considered structurally complete when:

1. every core capability is declared in `capabilities.ts`;
2. every capability is labelled `ready`, `experimental`, or `gap`;
3. a `ready` capability has at least one approved provider;
4. an `experimental` capability has no approved provider and at least one governed candidate;
5. a `gap` deliberately has no provider rather than hiding an unreviewed dependency;
6. every provider has an explicit lifecycle status, commercial-use status, free-tier boundary, source quality, priority, adapter status, region coverage, freshness policy, data boundary, official terms/documentation URLs and review date;
7. blocked providers can never enter production selection;
8. API-key names are server-side metadata and are excluded from safe registry snapshots;
9. provider selection remains capability-based rather than product-specific.

This definition deliberately separates **registry completeness** from **adapter completeness**. Adapters are implemented only when a product needs a capability. The registry can therefore be complete while some approved providers still have `adapterStatus: planned`.

## Capability map

### Ready

- `news-discovery` — GDELT DOC 2.0.
- `scholarly-discovery` — Crossref with DataCite fallback.
- `company-filings` — SEC EDGAR.
- `company-registry` — UK Companies House (regional source; additional national registries may be added later).
- `economic-data` — ECB Data Portal and World Bank Indicators.
- `fx-rates` — ECB Data Portal reference-rate series.
- `open-data` — World Bank governed datasets.
- `government-open-data-discovery` — Data.gov Catalog API.
- `weather-forecast` — MET Norway WeatherAPI under its open-data terms.
- `dns-resolution` — Google Public DNS JSON API.

### Experimental

- `seo-serp-discovery` — SerpApi, Zenserp and Serper candidates; production activation remains separately gated.
- `jobs-discovery` — Arbeitnow and Adzuna candidates; ongoing commercial rights are not yet broad enough for automatic production approval.
- `market-data` — Alpha Vantage and Twelve Data candidates; free/personal tiers are not approved for Neo commercial production.
- `crypto-market-data` — CoinGecko candidate; commercial/redistribution rights depend on plan.
- `entertainment-metadata` — TMDB candidate; developer access is non-commercial and commercial use needs a separate agreement.
- `geocoding` — public Nominatim candidate; strict capacity, attribution, privacy and product-use restrictions make it unsuitable as a default shared production dependency.

### Explicit gaps

- `language-translation` — no third-party provider is approved yet. A future candidate must satisfy commercial-use, privacy/retention and multilingual-quality requirements.
- `email-validation` — intentionally left without a third-party provider because sending CRM personal data to a validator creates a privacy boundary that must be justified by an actual product requirement.

## Approved-source notes

### SEC EDGAR

SEC permits free public access to EDGAR data and scripted access under its fair-access policy. Neo clients must identify automated requests and stay within the SEC request-rate guidance. The registry does not imply permission to hammer filing pages or bypass caching.

### ECB Data Portal

Public ESCB statistics may be reused free of charge for commercial or non-commercial purposes when the source is quoted and the statistical data are not silently altered. Third-party data embedded in ECB products remain outside that general permission.

### World Bank Indicators

The API requires no key. World Bank datasets are generally available under CC BY 4.0 with attribution, but dataset metadata must be checked because third-party indicators can carry additional restrictions.

### Companies House

The live public company API requires an API key and currently applies a default limit of 600 requests per five minutes. Credentials stay server-side.

### MET Norway WeatherAPI

Open weather data require attribution and an identifying User-Agent. Products must cache responsibly and avoid sending confidential coordinates or personal location material.

### Data.gov

The current Catalog API is an official discovery API for government dataset metadata. A catalog record does not automatically grant rights to every underlying dataset; the originating agency's licence remains authoritative.

## Commercial-use guardrails

The following are deliberately not approved production sources under their free/developer access boundaries:

- Twelve Data free tier — free-tier data may not be used commercially.
- Open-Meteo free hosted endpoint — non-commercial only; paid or self-hosted use is a separate decision.
- TMDB developer API — non-commercial; commercial access requires an agreement.
- GNews free plan — development/testing only, not commercial production.
- Guardian Open Platform developer access — non-commercial; commercial/AI-derived use requires separate access.
- Adzuna organisational use beyond its permitted publishing/trial boundary may require written consent or a licence.
- Alpha Vantage commercial market-data use requires provider clearance and may require exchange entitlements.

These sources remain useful candidates because the registry records **why** they are not currently eligible instead of silently treating a free signup as production permission.

## Product boundary

Products consume capabilities, not vendor names. Examples:

- NeoContent asks for `news-discovery`, `scholarly-discovery`, and optionally `seo-serp-discovery`.
- NeoCRM can ask for `company-registry`, `company-filings`, `dns-resolution`, and later a privacy-approved validation capability.
- NeoOS Wealth can ask for `economic-data`, `fx-rates`, `company-filings`, and eventually an approved `market-data` source.
- Living Website can ask for `weather-forecast`, `government-open-data-discovery`, and later `language-translation`.

No product may promote an experimental or blocked provider merely because that provider offers a free plan.

## Next lifecycle

Once this registry branch is merged, future work follows this sequence:

1. product requests an existing capability;
2. if an approved adapter exists, use it;
3. if an approved provider exists but its adapter is planned, implement and test only that adapter;
4. if the capability is experimental, review/promote a candidate before production use;
5. if the capability is a gap, research providers without changing product code first.

This keeps provider research and licensing governance centralized instead of rediscovering the same API question separately in every Neo project.
