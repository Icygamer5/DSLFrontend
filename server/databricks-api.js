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

// --- Decision Intelligence (Mary's UN requirements) ---
function normRow(row) {
  if (!row || typeof row !== 'object') return {};
  const o = {};
  for (const k of Object.keys(row)) o[k.toLowerCase()] = row[k];
  return o;
}

app.get('/api/mismatch', async (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).json({ error: 'Missing Databricks env' });
  }
  try {
    const table = getTableName();
    const rows = await executeSql(
      `SELECT country, country_iso3, year, people_in_need, people_targeted, funding, requirements, coverage_ratio FROM ${table} WHERE coverage_ratio IS NOT NULL AND people_in_need > 0`
    );
    const pinMax = Math.max(...rows.map((r) => Number(normRow(r).people_in_need) || 0), 1);
    const points = rows.map((r) => {
      const n = normRow(r);
      const coverage = Number(n.coverage_ratio) || 0;
      const fundingPct = Math.round(coverage * 100);
      const pin = Number(n.people_in_need) || 0;
      const severityProxy = Math.min(5, 0.5 + (1 - coverage) * 3 + (pin / pinMax) * 1.5);
      const isRed = severityProxy >= 4 && fundingPct < 25;
      return {
        country: n.country ?? n.country_name ?? n.country_iso3 ?? 'Unknown',
        country_iso3: n.country_iso3,
        year: n.year,
        severity: Math.round(severityProxy * 10) / 10,
        funding_pct: fundingPct,
        people_in_need: pin,
        is_red: isRed,
      };
    });
    res.json({ points });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message, points: [] });
  }
});

app.get('/api/decision-metrics', async (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).json({ error: 'Missing Databricks env' });
  }
  try {
    const table = getTableName();
    const rows = await executeSql(`SELECT country, year, people_in_need, people_targeted, funding, requirements, coverage_ratio FROM ${table}`);
    let structuralGap = 0;
    let severityGapSum = 0;
    let count = 0;
    const fundingByYear = {};
    rows.forEach((r) => {
      const n = normRow(r);
      const pin = Number(n.people_in_need) || 0;
      const targeted = Number(n.people_targeted) || 0;
      structuralGap += Math.max(0, pin - targeted);
      const cov = Number(n.coverage_ratio);
      if (cov != null && cov > 0) {
        severityGapSum += 1 / cov;
        count++;
      }
      const y = n.year;
      if (y != null) {
        fundingByYear[y] = (fundingByYear[y] || 0) + (Number(n.funding) || 0);
      }
    });
    const severityGap = count > 0 ? (severityGapSum / count).toFixed(2) : null;
    const years = Object.keys(fundingByYear).map(Number).sort((a, b) => b - a);
    let fundingVelocity = null;
    if (years.length >= 2) {
      const latest = fundingByYear[years[0]];
      const prev = fundingByYear[years[1]];
      if (prev > 0) {
        const pct = ((latest - prev) / prev) * 100;
        fundingVelocity = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '% YoY';
      }
    }
    res.json({
      severity_gap: severityGap,
      structural_gap: structuralGap,
      funding_velocity: fundingVelocity,
      structural_gap_formatted: structuralGap >= 1e6 ? `${(structuralGap / 1e6).toFixed(1)}M` : structuralGap.toLocaleString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/crisis-alert', async (req, res) => {
  const format = (req.query.format || 'markdown').toLowerCase();
  const top = Math.min(Math.max(parseInt(req.query.top, 10) || 3, 1), 20);
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  if (!PAT || !HOST || !WAREHOUSE_ID) {
    return res.status(500).send(format === 'csv' ? 'country,year,people_in_need,funding_gap,coverage_pct\n' : '# Crisis Alert\n\nNo data.\n');
  }
  try {
    const table = getTableName();
    const rows = await executeSql(
      `SELECT country, country_iso3, year, people_in_need, funding, requirements, coverage_ratio FROM ${table} WHERE coverage_ratio IS NOT NULL ORDER BY coverage_ratio ASC LIMIT ${top}`
    );
    const lines = rows.map((r) => {
      const n = normRow(r);
      const gap = Math.max(0, Number(n.requirements) - Number(n.funding));
      const pct = Math.round((Number(n.coverage_ratio) || 0) * 100);
      return { country: n.country ?? n.country_iso3, year: n.year, people_in_need: Number(n.people_in_need) || 0, funding_gap: gap, coverage_pct: pct };
    });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=crisis-alert.csv');
      const header = 'country,year,people_in_need,funding_gap,coverage_pct\n';
      const body = lines.map((l) => `${l.country},${l.year},${l.people_in_need},${l.funding_gap},${l.coverage_pct}`).join('\n');
      return res.send(header + body);
    }
    const md = `# Crisis Alert — Top ${top} Underfunded Emergencies\n\n| Country | Year | People in need | Funding gap | Coverage % |\n|--------|------|----------------|-------------|------------|\n${lines.map((l) => `| ${l.country} | ${l.year} | ${l.people_in_need.toLocaleString()} | $${(l.funding_gap / 1e6).toFixed(1)}M | ${l.coverage_pct}% |`).join('\n')}\n\n*Generated for low-bandwidth environments. File size kept minimal.*\n`;
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename=crisis-alert.md');
    res.send(md);
  } catch (e) {
    console.error(e);
    res.status(500).send(format === 'csv' ? 'error\n' : '# Crisis Alert\n\nError loading data.\n');
  }
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

// Genie: proxy so frontend can ask Genie (uses funding_gap, total_people_in_need from your space)
const GENIE_SPACE_ID = process.env.GENIE_SPACE_ID || '';

app.get('/api/genie/status', (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  const spaceId = process.env.GENIE_SPACE_ID || '';
  const hasPat = !!(process.env.DATABRICKS_PAT || '').trim();
  const hasHost = !!(process.env.DATABRICKS_SERVER_HOSTNAME || '').trim();
  const configured = !!(spaceId && hasPat && hasHost);
  res.json({
    configured,
    message: configured
      ? 'Genie is configured. Ask a question to run it.'
      : 'Missing in .env: GENIE_SPACE_ID, DATABRICKS_PAT, or DATABRICKS_SERVER_HOSTNAME. Restart the API server after editing .env.',
  });
});

async function genieFetch(path, opts = {}) {
  const url = `https://${HOST}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body !== undefined ? opts.body : undefined,
  });
  if (!res.ok) throw new Error(`Genie ${res.status}: ${await res.text()}`);
  return res.json();
}

app.post('/api/genie/ask', async (req, res) => {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  const spaceId = process.env.GENIE_SPACE_ID || '';
  if (!spaceId || !PAT || !HOST) {
    return res.status(502).json({ error: 'Genie not configured. Set GENIE_SPACE_ID, DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME in .env' });
  }
  const prompt = req.body?.prompt || req.body?.message || '';
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Send { "prompt": "e.g. Funding gap by country" }' });
  }
  try {
    const startRes = await genieFetch(`/api/2.0/genie/spaces/${spaceId}/start-conversation`, {
      method: 'POST',
      body: JSON.stringify({ content: prompt }),
    });
    const conversationId = startRes.conversation_id || startRes.id;
    const messageId = startRes.message_id || (startRes.message && startRes.message.message_id);
    if (!conversationId) throw new Error('No conversation_id from Genie start-conversation');

    let status = startRes.status || 'RUNNING';
    let result = startRes;
    const maxPolls = 60;
    for (let i = 0; i < maxPolls && status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED'; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (messageId) {
        result = await genieFetch(
          `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}`
        );
      } else {
        const listRes = await genieFetch(
          `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages`
        );
        const messages = listRes.messages || listRes.results || [];
        result = messages[messages.length - 1] || result;
      }
      status = result.status;
    }

    if (result.error) {
      return res.status(500).json({ error: result.error.message || result.error, result });
    }

    if (process.env.DEBUG_GENIE === '1') {
      const safe = { ...result, content: result.content ? '[present]' : undefined };
      if (result.query_result) safe.query_result_keys = Object.keys(result.query_result);
      if (result.attachments?.length) safe.attachment_ids = result.attachments.map((a) => a.attachment_id ?? a.id);
      console.log('Genie result keys:', Object.keys(result));
      console.log('Genie debug:', JSON.stringify(safe, null, 2).slice(0, 2000));
    }

    // Data delivery: use top-level query_result first (message response often includes it)
    const queryResult = result.query_result;
    let dataArray = null;
    let manifest = {};
    if (queryResult) {
      const stmt = queryResult.statement_response || queryResult;
      const res = stmt.result || queryResult.result || {};
      dataArray = res.data_array || queryResult.data_array;
      manifest = stmt.manifest || queryResult.manifest || {};
    }
    if (dataArray && Array.isArray(dataArray) && dataArray.length > 0) {
      const schema = manifest.schema || {};
      const columns = schema.columns || [];
      const columnNames = columns.map((c) => (typeof c === 'object' && c && c.name != null ? c.name : c)).filter(Boolean);
      if (columnNames.length) {
        result.data_array = dataArray.map((row) => {
          const obj = {};
          columnNames.forEach((col, idx) => { obj[col] = row[idx]; });
          return obj;
        });
      } else {
        result.data_array = dataArray;
      }
      if (process.env.NODE_ENV !== 'production') console.log('Genie: used query_result, rows:', result.data_array.length);
    }

    // Else try attachment query-result endpoint
    if (!result.data_array || result.data_array.length === 0) {
      const msgId = result.message_id || result.id;
      const attachments = result.attachments || [];
      for (const att of attachments) {
      const attId = att.attachment_id ?? att.id;
      if (!attId) continue;
      try {
        const qRes = await genieFetch(
          `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${msgId}/attachments/${attId}/query-result`
        );
        const stmt = qRes.statement_response || qRes;
        const manifest = stmt.manifest || {};
        const resResult = stmt.result || {};
        const dataArray = resResult.data_array || [];
        const schema = manifest.schema || {};
        const columns = schema.columns || [];
        const columnNames = columns.map((c) => (typeof c === 'object' && c && c.name != null ? c.name : c)).filter(Boolean);
        if (dataArray.length && columnNames.length) {
          const rows = dataArray.map((row) => {
            const obj = {};
            columnNames.forEach((col, idx) => { obj[col] = row[idx]; });
            return obj;
          });
          result.data_array = rows;
          result.attachments = [{ ...att, data_array: rows, schema_columns: columnNames }];
          break;
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('Genie attachment query-result:', err.message);
      }
      }
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

const helpHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API server</title></head>
<body style="font-family:sans-serif;padding:2rem;">
  <h1>Databricks API server</h1>
  <p>This port is for the <strong>API only</strong>. Open the dashboard here:</p>
  <p><a href="http://localhost:5173">http://localhost:5173</a> &nbsp; (or <a href="http://localhost:5174">5174</a> if 5173 is in use)</p>
  <p>API: <code>GET /api/health</code> &nbsp; <code>GET /api/top_crises</code> &nbsp; <code>GET /api/mismatch</code> &nbsp; <code>GET /api/decision-metrics</code> &nbsp; <code>GET /api/crisis-alert</code> &nbsp; <code>POST /api/genie/ask</code></p>
</body></html>`;

// Catch-all: any other path shows the same message (no more "Cannot GET")
app.use((req, res) => {
  if (req.path === '/favicon.ico') return res.status(204).end();
  res.type('html').status(200).send(helpHtml);
});

app.listen(PORT, () => {
  console.log(`Databricks API server at http://localhost:${PORT}`);
  console.log(`  GET /api/top_crises  -> query table: ${TOP_CRISES_TABLE}`);
  console.log(`  POST /api/chat       -> natural language -> SQL`);
  if (GENIE_SPACE_ID) console.log(`  POST /api/genie/ask  -> Genie (funding_gap, total_people_in_need)`);
});
