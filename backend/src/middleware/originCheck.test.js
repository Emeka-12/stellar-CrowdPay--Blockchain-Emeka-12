const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { originCheck } = require('./originCheck');

function buildApp() {
  const app = express();
  app.use(originCheck);
  app.all('/thing', (req, res) => res.json({ ok: true }));
  return app;
}

test('allows safe methods regardless of origin', async () => {
  const res = await request(buildApp())
    .get('/thing')
    .set('Sec-Fetch-Site', 'cross-site')
    .set('Origin', 'https://evil.example');
  assert.equal(res.status, 200);
});

test('blocks cross-site POST via Sec-Fetch-Site', async () => {
  const res = await request(buildApp()).post('/thing').set('Sec-Fetch-Site', 'cross-site');
  assert.equal(res.status, 403);
});

test('allows same-site POST via Sec-Fetch-Site', async () => {
  const res = await request(buildApp()).post('/thing').set('Sec-Fetch-Site', 'same-site');
  assert.equal(res.status, 200);
});

test('blocks POST from a foreign Origin when Sec-Fetch-Site is absent', async () => {
  const res = await request(buildApp()).post('/thing').set('Origin', 'https://evil.example');
  assert.equal(res.status, 403);
});

test('allows POST from the configured frontend origin', async () => {
  const res = await request(buildApp())
    .post('/thing')
    .set('Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  assert.equal(res.status, 200);
});

test('allows POST with no Origin or Sec-Fetch-Site (non-browser clients)', async () => {
  const res = await request(buildApp()).post('/thing');
  assert.equal(res.status, 200);
});
