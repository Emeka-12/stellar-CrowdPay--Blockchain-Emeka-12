const db = require('../config/database');

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildContributionRow(transaction) {
  const metadata = transaction.metadata || {};
  const flow = metadata.flow === 'path_payment_strict_receive' || metadata.dest_amount
    ? metadata
    : metadata;
  const senderPublicKey = flow.contributor_public_key || flow.sender_public_key;
  const amount = numberOrNull(flow.dest_amount || flow.amount);
  const asset = flow.dest_asset || transaction.asset_type || flow.send_asset;

  if (!senderPublicKey || amount === null || !asset) return null;

  const anchor = metadata.anchor || {};
  const sourceAmount = numberOrNull(flow.source_amount || flow.quoted_source_amount);
  return {
    campaignId: transaction.campaign_id,
    senderPublicKey,
    amount,
    asset,
    anchorId: anchor.anchor_id || null,
    anchorTransactionId: anchor.anchor_transaction_id || null,
    anchorAsset: anchor.anchor_asset || null,
    anchorAmount: numberOrNull(anchor.anchor_amount),
    paymentType: flow.flow === 'path_payment_strict_receive'
      ? 'path_payment_strict_receive'
      : 'payment',
    sourceAmount,
    sourceAsset: flow.send_asset && flow.send_asset !== asset ? flow.send_asset : null,
    conversionRate: sourceAmount ? amount / sourceAmount : null,
    path: flow.path || null,
    txHash: transaction.tx_hash,
    displayName: flow.display_name || null,
    createdAt: transaction.created_at,
  };
}

async function listRecoverableTransactions(runner) {
  const { rows } = await runner.query(
    `SELECT st.tx_hash, st.campaign_id, st.metadata, st.created_at,
            c.asset_type
     FROM stellar_transactions st
     JOIN campaigns c ON c.id = st.campaign_id
     WHERE st.kind = 'contribution'
       AND st.tx_hash IS NOT NULL
     ORDER BY st.created_at ASC`
  );
  return rows;
}

async function recordAudit(runner, transaction, action, details) {
  await runner.query(
    `INSERT INTO contribution_backfill_audit (tx_hash, action, details)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tx_hash) DO UPDATE
       SET action = EXCLUDED.action, details = EXCLUDED.details, updated_at = NOW()`,
    [transaction.tx_hash, action, JSON.stringify(details || {})]
  );
}

async function backfillContributions({ runner = db, dryRun = true } = {}) {
  const transactions = await listRecoverableTransactions(runner);
  const result = { scanned: transactions.length, restored: 0, existing: 0, skipped: 0 };

  for (const transaction of transactions) {
    const contribution = buildContributionRow(transaction);
    if (!contribution) {
      result.skipped += 1;
      if (!dryRun) await recordAudit(runner, transaction, 'skipped', { reason: 'insufficient_metadata' });
      continue;
    }

    const { rows: existingRows } = await runner.query(
      'SELECT id FROM contributions WHERE tx_hash = $1',
      [transaction.tx_hash]
    );
    if (existingRows.length) {
      result.existing += 1;
      if (!dryRun) await recordAudit(runner, transaction, 'existing', { contribution_id: existingRows[0].id });
      continue;
    }

    if (dryRun) {
      result.restored += 1;
      continue;
    }

    const client = await runner.connect();
    try {
      await client.query('BEGIN');
      const { rows: insertedRows } = await client.query(
        `INSERT INTO contributions
           (campaign_id, sender_public_key, amount, asset, anchor_id, anchor_transaction_id,
            anchor_asset, anchor_amount, payment_type, source_amount, source_asset,
            conversion_rate, path, tx_hash, display_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16)
         ON CONFLICT (tx_hash) DO NOTHING
         RETURNING id`,
        [
          contribution.campaignId,
          contribution.senderPublicKey,
          contribution.amount,
          contribution.asset,
          contribution.anchorId,
          contribution.anchorTransactionId,
          contribution.anchorAsset,
          contribution.anchorAmount,
          contribution.paymentType,
          contribution.sourceAmount,
          contribution.sourceAsset,
          contribution.conversionRate,
          contribution.path ? JSON.stringify(contribution.path) : null,
          contribution.txHash,
          contribution.displayName,
          contribution.createdAt,
        ]
      );

      if (!insertedRows.length) {
        result.existing += 1;
        await client.query('COMMIT');
        await recordAudit(runner, transaction, 'existing', { reason: 'concurrent_insert' });
        continue;
      }

      const contributionId = insertedRows[0].id;
      await client.query(
        `UPDATE campaigns
         SET raised_amount = raised_amount + $1,
             status = CASE WHEN raised_amount + $1 >= target_amount THEN 'funded' ELSE status END
         WHERE id = $2`,
        [contribution.amount, contribution.campaignId]
      );
      await client.query(
        `UPDATE stellar_transactions
         SET contribution_id = $1, status = 'indexed', updated_at = NOW()
         WHERE tx_hash = $2 AND kind = 'contribution'`,
        [contributionId, contribution.txHash]
      );
      await client.query('COMMIT');
      await recordAudit(runner, transaction, 'restored', { contribution_id: contributionId });
      result.restored += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return result;
}

module.exports = { backfillContributions, buildContributionRow };