# NeoOS Source Registry ownership

The canonical ownership of shared source governance is moving to the standalone `abztabz/NeoOS-Source-Registry` repository.

NeoContent is a consumer of the shared capability model, not the owner of provider policy. Its current `apps/cloud/src/data-gateway` copy remains temporarily vendored to protect the production deployment during cutover.

## Cutover rule

Do not add new provider-governance decisions directly to NeoContent. New capabilities, provider reviews, lifecycle status, commercial-use boundaries and shared gateway behavior belong in NeoOS-Source-Registry first.

NeoContent-specific research interpretation, Luna briefing, opportunity scoring and content workflows remain in NeoContent.

The vendored copy may be removed only after the standalone package/service has CI parity and NeoContent has a tested consumption path. Until then it is a compatibility copy, not the canonical registry.
