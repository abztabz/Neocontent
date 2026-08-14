export const PROVIDER_STATUS = Object.freeze({
  APPROVED: 'approved',
  EXPERIMENTAL: 'experimental',
  BLOCKED: 'blocked',
  RETIRED: 'retired',
});

export const sourceRegistry = Object.freeze([
  {
    id: 'sec-edgar',
    name: 'SEC EDGAR',
    capabilities: ['company-filings'],
    status: PROVIDER_STATUS.EXPERIMENTAL,
    auth: 'none',
    commercialReview: true,
    freshnessPolicy: 'source-defined',
  },
  {
    id: 'fred',
    name: 'FRED',
    capabilities: ['economic-data'],
    status: PROVIDER_STATUS.EXPERIMENTAL,
    auth: 'api-key',
    commercialReview: true,
    freshnessPolicy: 'release-date',
  },
]);

export function providersFor(capability, { includeExperimental = false } = {}) {
  const allowed = includeExperimental
    ? new Set([PROVIDER_STATUS.APPROVED, PROVIDER_STATUS.EXPERIMENTAL])
    : new Set([PROVIDER_STATUS.APPROVED]);

  return sourceRegistry.filter(
    (provider) => provider.capabilities.includes(capability) && allowed.has(provider.status),
  );
}
