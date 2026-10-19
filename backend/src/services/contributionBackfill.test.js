const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContributionRow } = require('./contributionBackfill');

test('buildContributionRow reconstructs a path-payment contribution from audit metadata', () => {
  const row = buildContributionRow({
    campaign_id: 'campaign-1',
    tx_hash: 'tx-1',
    asset_type: 'USDC',
    created_at: '2026-09-24T00:00:00.000Z',
    metadata: {
      flow: 'path_payment_strict_receive',
      contributor_public_key: 'GCONTRIBUTOR',
      send_asset: 'XLM',
      dest_asset: 'USDC',
      dest_amount: '12.5',
      quoted_source_amount: '13.1',
      path: ['AQUA'],
      display_name: 'Ada',
    },
  });

  assert.deepEqual(row, {
    campaignId: 'campaign-1',
    senderPublicKey: 'GCONTRIBUTOR',
    amount: 12.5,
    asset: 'USDC',
    anchorId: null,
    anchorTransactionId: null,
    anchorAsset: null,
    anchorAmount: null,
    paymentType: 'path_payment_strict_receive',
    sourceAmount: 13.1,
    sourceAsset: 'XLM',
    conversionRate: 12.5 / 13.1,
    path: ['AQUA'],
    txHash: 'tx-1',
    displayName: 'Ada',
    createdAt: '2026-09-24T00:00:00.000Z',
  });
});

test('buildContributionRow rejects transactions without reconstructable metadata', () => {
  assert.equal(
    buildContributionRow({
      campaign_id: 'campaign-1',
      tx_hash: 'tx-2',
      asset_type: 'XLM',
      metadata: {},
    }),
    null
  );
});