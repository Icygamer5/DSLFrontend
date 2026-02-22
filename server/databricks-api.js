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

// Serve index.html at / so http://localhost:3001 never 404s
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => {
  res.status(200).sendFile(path.join(publicDir, 'index.html'));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/top_crises', async (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  const tableName = process.env.DATABRICKS_TOP_CRISES_TABLE || 'top_crises';
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).json({ error: 'Missing Databricks env: DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_WAREHOUSE_ID' });
  }
  try {
    const table = tableName.includes('.') ? tableName : `main.default.${tableName}`;
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

// System context for Sphinx: table schema so we map columns correctly
const SPHINX_SYSTEM_PROMPT = `You are the Sphinx AI Agent. You have access to a table called 'gold_crisis_impact'.
The columns are: country (name), country_iso3 (3-letter code), funding_gap (money still needed),
people_in_need (population requiring aid), coverage_ratio (0.0 to 1.0), funding, requirements.
Always format money in millions or billions of USD (e.g. $725.6M).`;

function getTableName() {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  const t = process.env.DATABRICKS_TOP_CRISES_TABLE || 'top_crises';
  return t.includes('.') ? t : `main.default.${t}`;
}

// Normalize row keys (Databricks can return different casing). Prefer lowercase.
function norm(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    const lower = k.toLowerCase();
    if (!(lower in out)) out[lower] = row[k];
  }
  return out;
}

// Get country name from row regardless of column name
function getCountryName(row) {
  const r = norm(row);
  return r.country ?? r.country_name ?? r.name ?? r.country_iso3 ?? r.admin ?? 'Unknown';
}

// Format currency: no scientific notation, use $XM / $XB for large numbers
function formatMoney(value) {
  const num = Number(value);
  if (num !== num) return '$0';
  const abs = Math.abs(num);
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

// Funding gap should be positive (requirements - funding). If DB returns negative, use absolute.
function getFundingGap(row) {
  const r = norm(row);
  const gap = r.funding_gap;
  if (gap != null) return Math.abs(Number(gap));
  const req = Number(r.requirements);
  const fund = Number(r.funding);
  if (req === req && fund === fund) return Math.max(0, req - fund);
  return 0;
}

function buildSqlFromMessage(message, table) {
  const q = (message || '').toLowerCase();
  const safeTable = table.replace(/[;'"\\]/g, '');

  if (q.includes('largest funding gap') || q.includes('biggest funding gap') || q.includes('most underfunded') || (q.includes('top 3') && q.includes('funding gap'))) {
    const limit = q.includes('top 3') ? 3 : 5;
    return `SELECT country, country_iso3, year, funding_gap, coverage_ratio, funding, requirements FROM ${safeTable} ORDER BY ABS(COALESCE(funding_gap, requirements - funding, 0)) DESC NULLS LAST LIMIT ${limit}`;
  }
  if (q.includes('people in need') || q.includes('most people in need') || q.includes('highest need')) {
    return `SELECT country, country_iso3, year, people_in_need, people_targeted FROM ${safeTable} ORDER BY people_in_need DESC NULLS LAST LIMIT 5`;
  }
  if (q.includes('coverage') || q.includes('lowest coverage') || q.includes('least funded')) {
    return `SELECT country, country_iso3, year, coverage_ratio, funding, requirements FROM ${safeTable} WHERE coverage_ratio IS NOT NULL ORDER BY coverage_ratio ASC LIMIT 5`;
  }
  if (q.includes('how many countries') || q.includes('number of countries')) {
    return `SELECT COUNT(DISTINCT country_iso3) AS country_count FROM ${safeTable}`;
  }
  if (q.includes('total funding') || q.includes('total requirement')) {
    return `SELECT year, SUM(funding) AS total_funding, SUM(requirements) AS total_requirements FROM ${safeTable} GROUP BY year ORDER BY year DESC LIMIT 5`;
  }
  // Default: return sample for context
  return `SELECT country, country_iso3, year, people_in_need, funding, funding_gap, coverage_ratio FROM ${safeTable} ORDER BY year DESC, people_in_need DESC NULLS LAST LIMIT 10`;
}

function formatReply(message, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "I queried the gold_crisis_impact table but got no rows. Try asking about funding gaps, people in need, or coverage.";
  }
  const q = (message || '').toLowerCase();
  const normalized = rows.map(norm);
  const r0 = normalized[0];

  if (process.env.NODE_ENV !== 'production') {
    console.log('Databricks Row (first):', JSON.stringify(rows[0]));
    console.log('Databricks Row keys:', rows[0] ? Object.keys(rows[0]) : []);
  }

  if (r0.country_count !== undefined && r0.country_count != null) {
    return `There are **${Number(r0.country_count)}** distinct countries in the gold_crisis_impact table.`;
  }
  if (r0.total_funding !== undefined && r0.total_funding != null) {
    return normalized.map((r) => `${r.year}: Total funding ${formatMoney(r.total_funding)}, Total requirements ${formatMoney(r.total_requirements)}`).join('. ');
  }
  if ((r0.funding_gap != null || r0.requirements != null) && rows.length > 0) {
    const list = normalized.slice(0, q.includes('top 3') ? 3 : 5);
    const parts = list.map((r, i) => {
      const name = getCountryName(r);
      const gap = getFundingGap(r);
      const pct = ((r.coverage_ratio ?? 0) * 100).toFixed(1);
      return `${i + 1}. ${name}: ${formatMoney(gap)} gap (${pct}% coverage)`;
    });
    return parts.join('. ');
  }
  if (r0.people_in_need != null && rows.length > 0) {
    const list = normalized.slice(0, q.includes('top 3') ? 3 : 5);
    const parts = list.map((r, i) => {
      const name = getCountryName(r);
      const pin = Number(r.people_in_need);
      const str = pin >= 1e6 ? `${(pin / 1e6).toFixed(1)}M` : pin.toLocaleString();
      return `${i + 1}. ${name}: ${str} people in need`;
    });
    return parts.join('. ');
  }
  if (r0.coverage_ratio != null && rows.length > 0) {
    const top = normalized[0];
    const name = getCountryName(top);
    const pct = ((top.coverage_ratio || 0) * 100).toFixed(1);
    return `Lowest coverage: ${name} at ${pct}% (${formatMoney(top.funding)} of ${formatMoney(top.requirements)} required).`;
  }
  return `I found ${rows.length} row(s). Top: ${getCountryName(r0)} (${r0.year ?? 'N/A'}).`;
}

app.post('/api/chat', async (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).json({ error: 'Missing Databricks credentials. Set DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_WAREHOUSE_ID in .env' });
  }
  const message = req.body?.message || req.body?.query || '';
  if (!message.trim()) {
    return res.status(400).json({ error: 'Send { "message": "your question" }' });
  }
  try {
    const table = getTableName();
    const sql = buildSqlFromMessage(message, table);
    const rows = await executeSql(sql);
    const reply = formatReply(message, rows);
    res.json({ reply, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message, reply: `Sorry, I couldn't query the data: ${e.message}` });
  }
});

const helpHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API server</title></head>
<body style="font-family:sans-serif;padding:2rem;">
  <h1>Databricks API server</h1>
  <p>This port is for the <strong>API only</strong>. Open the dashboard here:</p>
  <p><a href="http://localhost:5173">http://localhost:5173</a> &nbsp; (or <a href="http://localhost:5174">5174</a> if 5173 is in use)</p>
  <p>API: <code>GET /api/health</code> &nbsp; <code>GET /api/top_crises</code></p>
</body></html>`;

// Catch-all: any other path shows the same message (no more "Cannot GET")
app.use((req, res) => {
  if (req.path === '/favicon.ico') return res.status(204).end();
  res.type('html').status(200).send(helpHtml);
});

app.listen(PORT, () => {
  console.log(`Databricks API server at http://localhost:${PORT}`);
  console.log(`  GET /api/top_crises  -> query table: ${TOP_CRISES_TABLE}`);
  console.log(`  POST /api/chat       -> natural language -> SQL on gold_crisis_impact`);
});
