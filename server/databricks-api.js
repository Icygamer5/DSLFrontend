/**
 * Small backend that queries Databricks SQL and exposes JSON APIs.
 * Run from DSLFrontend: npm run server  (or node server/databricks-api.js)
 * Frontend proxies /api to this server in dev (see vite.config.js).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';

const PORT = process.env.PORT || 3001;
const PAT = process.env.DATABRICKS_PAT;
const HOST = process.env.DATABRICKS_SERVER_HOSTNAME;
const WAREHOUSE_ID = process.env.DATABRICKS_WAREHOUSE_ID || (process.env.DATABRICKS_HTTP_PATH && process.env.DATABRICKS_HTTP_PATH.split('/').pop());
const TOP_CRISES_TABLE = process.env.DATABRICKS_TOP_CRISES_TABLE || 'top_crises';

const baseUrl = `https://${HOST}`;

async function executeSql(statement) {
  const res = await fetch(`${baseUrl}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: WAREHOUSE_ID,
      statement,
      wait_timeout: '30s',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Databricks API ${res.status}: ${err}`);
  }
  const data = await res.json();
  const statementId = data.statement_id;
  if (!statementId) throw new Error('No statement_id in response');

  // Poll until succeeded
  for (let i = 0; i < 60; i++) {
    const statusRes = await fetch(`${baseUrl}/api/2.0/sql/statements/${statementId}`, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const statusData = await statusRes.json();
    const s = statusData.status?.state;
    if (s === 'SUCCEEDED') {
      const manifest = statusData.manifest;
      const result = statusData.result?.data_array || [];
      const schema = manifest?.schema?.columns || [];
      const keys = schema.map((c) => c.name);
      return result.map((row) => {
        const obj = {};
        keys.forEach((k, idx) => { obj[k] = row[idx]; });
        return obj;
      });
    }
    if (s === 'FAILED') throw new Error(statusData.status?.error?.message || 'Statement failed');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Statement timed out');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/top_crises', async (req, res) => {
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).json({ error: 'Missing Databricks env: DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_WAREHOUSE_ID' });
  }
  try {
    const table = TOP_CRISES_TABLE.includes('.') ? TOP_CRISES_TABLE : `main.default.${TOP_CRISES_TABLE}`;
    const rows = await executeSql(`SELECT * FROM ${table}`);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, databricks: !!(PAT && HOST && WAREHOUSE_ID) });
});

app.listen(PORT, () => {
  console.log(`Databricks API server at http://localhost:${PORT}`);
  console.log(`  GET /api/top_crises  -> query table: ${TOP_CRISES_TABLE}`);
});
