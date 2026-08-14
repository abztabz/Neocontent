import test from 'node:test';
import assert from 'node:assert/strict';
import { NeoDataGateway } from '../src/index.js';

test('uses an eligible provider and returns provenance', async () => {
  const gateway = new NeoDataGateway({
    adapters: {
      'sec-edgar': async () => ({ filings: ['example'] }),
    },
  });

  const result = await gateway.request(
    'company-filings',
    { cik: '0000000000' },
    { includeExperimental: true },
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'sec-edgar');
  assert.deepEqual(result.data, { filings: ['example'] });
  assert.equal(result.provenance.status, 'experimental');
});

test('fails closed when no approved provider exists', async () => {
  const gateway = new NeoDataGateway();
  const result = await gateway.request('company-filings', {});
  assert.equal(result.ok, false);
});
