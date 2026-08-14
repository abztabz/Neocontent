# Neo Data Gateway

## Purpose

Neo Data Gateway is the provider-independent external-data layer for Neo products. Products request a capability rather than calling a vendor directly.

The public-apis/public-apis repository is treated only as a discovery catalogue. Listing there never makes a provider trusted or approved.

## Governance

Provider lifecycle:

- `experimental`: candidate under evaluation; never used by default.
- `approved`: cleared for production use.
- `blocked`: explicitly prohibited.
- `retired`: previously usable but no longer selected.

Before promotion to `approved`, review security, licensing/commercial use, privacy, reliability, freshness, rate limits and data accuracy.

Secrets must remain server-side. Provider responses should be normalized before they leave the gateway. Every successful response must carry provider provenance and observation time.

## Phase 1

The initial package implements:

1. a governed source registry;
2. capability-based provider selection;
3. fail-closed defaults;
4. optional experimental-provider execution;
5. sequential fallback between eligible adapters;
6. provenance and attempt metadata.

SEC EDGAR and FRED are seeded as experimental examples only. No live provider is enabled by this change.

## Next integration

NeoContent should first consume research-oriented capabilities through this package. After provider review, add adapters and normalized contracts for news discovery, economic/company evidence and other research signals. NeoCRM and NeoOS can later consume the same contracts without depending directly on individual vendors.
