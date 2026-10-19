/**
 * trustlines.js
 *
 * Utility to establish and inspect Stellar asset trustlines.
 * Trustlines must exist before an account can receive a non-native asset.
 *
 * Usage:
 *   node contracts/stellar/trustlines.js --add <accountSecret> <assetCode> <issuerPublicKey>
 *   node contracts/stellar/trustlines.js --check <accountPublicKey> <assetCode>
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });

const { Keypair, TransactionBuilder, Operation, Asset, Networks, BASE_FEE, Horizon } = require('@stellar/stellar-sdk');

// Authoritative value lives in backend/src/config/constants.js TX_TIMEOUT_CONTRIBUTION_S
const TX_TIMEOUT_CONTRIBUTION_S = 30;

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';
const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

const server = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || (isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org')
);

function handleError(err) {
  console.error(err);
  process.exit(1);
}

async function addTrustline(accountSecret, assetCode, issuerPublicKey) {
  const keypair = Keypair.fromSecret(accountSecret);
  const account = await server.loadAccount(keypair.publicKey());
  const asset = new Asset(assetCode, issuerPublicKey);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(TX_TIMEOUT_CONTRIBUTION_S)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  console.log(`Trustline established for ${assetCode}:${issuerPublicKey}`);
  console.log('Tx hash:', result.hash);
}

async function checkTrustline(publicKey, assetCode) {
  const account = await server.loadAccount(publicKey);
  const trusted = account.balances.find(
    (b) => b.asset_code === assetCode
  );
  if (trusted) {
    console.log(`${assetCode} trustline found. Balance: ${trusted.balance}`);
  } else {
    console.log(`No trustline for ${assetCode} on this account.`);
  }
}

const [,, flag, ...args] = process.argv;

if (flag === '--add') addTrustline(args[0], args[1], args[2]).catch(handleError);
else if (flag === '--check') checkTrustline(args[0], args[1]).catch(handleError);
else {
  console.log('Usage:');
  console.log('  node trustlines.js --add <accountSecret> <assetCode> <issuerPublicKey>');
  console.log('  node trustlines.js --check <accountPublicKey> <assetCode>');
}
