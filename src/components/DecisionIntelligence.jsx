/**
 * Decision Intelligence: Red-flag scatter (Severity vs Funding %), 3 mismatch metrics, Crisis Alert export.
 * Addresses Mary's UN requirements: mismatch logic, accessibility, low-bandwidth export.
 * Uses Databricks API when available; falls back to static top_crises data so the page always shows data.
 */
import { useState, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { AlertTriangle, Download } from 'lucide-react';
import staticCrises from '../data/top_crises.json';

// Build mismatch points and decision metrics from raw rows (same logic as backend)
function buildFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { points: [], metrics: null };
  const norm = (r) => {
    if (!r || typeof r !== 'object') return {};
    const o = {};
    for (const k of Object.keys(r)) o[k.toLowerCase()] = r[k];
    return o;
  };
  const withCoverage = rows.filter((r) => {
    const n = norm(r);
    const cov = n.coverage_ratio;
    const pin = Number(n.people_in_need) || 0;
    return cov != null && pin > 0;
  });
  const pinMax = Math.max(...withCoverage.map((r) => Number(norm(r).people_in_need) || 0), 1);
  const points = withCoverage.map((r) => {
    const n = norm(r);
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
  let structuralGap = 0;
  let severityGapSum = 0;
  let count = 0;
  rows.forEach((r) => {
    const n = norm(r);
    const pin = Number(n.people_in_need) || 0;
    const targeted = Number(n.people_targeted) || 0;
    structuralGap += Math.max(0, pin - targeted);
    const cov = Number(n.coverage_ratio);
    if (cov != null && cov > 0) {
      severityGapSum += 1 / cov;
      count++;
    }
  });
  const severityGap = count > 0 ? (severityGapSum / count).toFixed(2) : null;
  // Funding velocity: YoY change in total funding (latest year vs previous year)
  const byYear = {};
  rows.forEach((r) => {
    const n = norm(r);
    const y = n.year;
    if (y == null) return;
    if (!byYear[y]) byYear[y] = 0;
    byYear[y] += Number(n.funding) || 0;
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  let fundingVelocity = null;
  if (years.length >= 2) {
    const latest = byYear[years[0]];
    const prev = byYear[years[1]];
    if (prev > 0) {
      const pct = ((latest - prev) / prev) * 100;
      fundingVelocity = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '% YoY';
    }
  }
  const metrics = {
    severity_gap: severityGap,
    structural_gap: structuralGap,
    funding_velocity: fundingVelocity,
    structural_gap_formatted: structuralGap >= 1e6 ? `${(structuralGap / 1e6).toFixed(1)}M` : structuralGap.toLocaleString(),
  };
  return { points, metrics };
}

// Safe fetch: avoid "Unexpected token '<'" when server returns HTML (e.g. API down or proxy 404)
async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      "API returned an error page instead of JSON. Check: (1) API server is running (npm run server), (2) .env has DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_WAREHOUSE_ID, (3) DATABRICKS_TOP_CRISES_TABLE is catalog.schema.table, (4) Use a Serverless SQL Warehouse and grant CAN USE + SELECT."
    );
  }
  if (!trimmed) return res.ok ? null : { error: res.statusText || 'Request failed' };
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid JSON from API. Ensure the backend is the Node API server, not an HTML page.");
  }
}

export default function DecisionIntelligence() {
  const [points, setPoints] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null); // 'api' | 'fallback'

  useEffect(() => {
    Promise.all([
      fetchJson('/api/mismatch').then((data) => (data && !data.error ? data : { points: [] })).catch(() => ({ points: [] })),
      fetchJson('/api/decision-metrics').then((data) => (data && !data.error ? data : null)).catch(() => null),
    ])
      .then(([mismatchRes, metricsRes]) => {
        const apiPoints = (mismatchRes && mismatchRes.points) || [];
        const apiMetrics = metricsRes && !metricsRes.error ? metricsRes : null;
        const hasApiData = apiPoints.length > 0 || (apiMetrics && (apiMetrics.severity_gap != null || apiMetrics.structural_gap_formatted != null));
        if (hasApiData) {
          setPoints(apiPoints);
          setMetrics(apiMetrics);
          setDataSource('api');
          setError(null);
        } else {
          const { points: fallbackPoints, metrics: fallbackMetrics } = buildFromRows(staticCrises);
          setPoints(fallbackPoints);
          setMetrics(fallbackMetrics);
          setDataSource('fallback');
          setError(null);
        }
      })
      .catch((e) => {
        const { points: fallbackPoints, metrics: fallbackMetrics } = buildFromRows(staticCrises);
        setPoints(fallbackPoints);
        setMetrics(fallbackMetrics);
        setDataSource('fallback');
        setError(fallbackPoints.length > 0 ? null : e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  // Build top N underfunded from rows (same as backend); then download as CSV or Markdown (works without API)
  const buildAlertLines = (rows, top = 3) => {
    const norm = (r) => {
      if (!r || typeof r !== 'object') return {};
      const o = {};
      for (const k of Object.keys(r)) o[k.toLowerCase()] = r[k];
      return o;
    };
    const withCoverage = rows.filter((r) => norm(r).coverage_ratio != null);
    const sorted = [...withCoverage].sort((a, b) => (Number(norm(a).coverage_ratio) || 1) - (Number(norm(b).coverage_ratio) || 1));
    return sorted.slice(0, top).map((r) => {
      const n = norm(r);
      const gap = Math.max(0, Number(n.requirements) - Number(n.funding));
      const pct = Math.round((Number(n.coverage_ratio) || 0) * 100);
      return { country: n.country ?? n.country_iso3, year: n.year, people_in_need: Number(n.people_in_need) || 0, funding_gap: gap, coverage_pct: pct };
    });
  };

  const downloadAlert = (format) => {
    const top = 3;
    const lines = buildAlertLines(staticCrises, top);
    if (lines.length === 0) return;
    if (format === 'csv') {
      const header = 'country,year,people_in_need,funding_gap,coverage_pct\n';
      const body = lines.map((l) => `${l.country},${l.year},${l.people_in_need},${l.funding_gap},${l.coverage_pct}`).join('\n');
      const blob = new Blob([header + body], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'crisis-alert.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const md = `# Crisis Alert — Top ${top} Underfunded Emergencies\n\n| Country | Year | People in need | Funding gap | Coverage % |\n|--------|------|----------------|-------------|------------|\n${lines.map((l) => `| ${l.country} | ${l.year} | ${l.people_in_need.toLocaleString()} | $${(l.funding_gap / 1e6).toFixed(1)}M | ${l.coverage_pct}% |`).join('\n')}\n\n*Generated for low-bandwidth environments. File size kept minimal.*\n`;
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'crisis-alert.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const redPoints = points.filter((p) => p.is_red);
  const scatterData = points.map((p) => ({
    ...p,
    x: p.severity,
    y: p.funding_pct,
    z: Math.min(50, Math.log10((p.people_in_need || 0) + 1) * 15),
  }));

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-slate-500">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#003d7a]" />
        <span className="ml-2">Loading decision intelligence…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">Red flag: High severity, low funding</h3>
        <p className="mt-1 text-xs text-slate-500">
          Countries in the top-right quadrant (Severity ≥ 4 and Funding &lt; 25%) are priority for attention.
        </p>
      </div>

      {dataSource === 'fallback' && points.length > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Showing data from backup source. Connect Databricks (.env + <code>npm run server</code>) for live data.
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Decision data unavailable</p>
              <p className="mt-1 text-amber-700">{error}</p>
              <p className="mt-3 text-xs text-amber-600">
                <strong>Databricks checklist:</strong> Use <code>catalog.schema.table</code> for DATABRICKS_TOP_CRISES_TABLE; use a Serverless SQL Warehouse; grant CAN USE on warehouse and SELECT on tables; ensure columns coverage_ratio, people_in_need, people_targeted exist.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3 Mismatch Metrics (Mary's dashboard requirements) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Severity gap</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{metrics?.severity_gap ?? '—'}</p>
          <p className="text-xs text-slate-500">1 / funding % (higher = more neglect)</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Structural gap</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{metrics?.structural_gap_formatted ?? '—'}</p>
          <p className="text-xs text-slate-500">People in need − people targeted</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Funding velocity</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{metrics?.funding_velocity ?? 'N/A'}</p>
          <p className="text-xs text-slate-500">Current vs same month last year</p>
        </div>
      </div>

      {/* Scatter: Severity (X) vs Funding % (Y), red quadrant highlighted */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Severity vs funding coverage</h4>
        {scatterData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No data for scatter plot.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <XAxis type="number" dataKey="severity" name="Severity" domain={[0, 5]} />
              <YAxis type="number" dataKey="funding_pct" name="Funding %" domain={[0, 100]} />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <ReferenceLine x={4} stroke="#94a3b8" strokeDasharray="4 2" />
              <ReferenceLine y={25} stroke="#94a3b8" strokeDasharray="4 2" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => (name === 'Funding %' ? `${value}%` : value)}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded border border-slate-200 bg-white p-2 text-xs shadow">
                      <p className="font-medium">{payload[0].payload.country}</p>
                      <p>Severity: {payload[0].payload.severity}</p>
                      <p>Funding: {payload[0].payload.funding_pct}%</p>
                      {payload[0].payload.is_red && (
                        <p className="mt-1 font-medium text-red-600">Red flag: high severity, low funding</p>
                      )}
                    </div>
                  ) : null
                }
              />
              <Scatter name="Crises" data={scatterData}>
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={entry.is_red ? '#dc2626' : '#0d9488'} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
        {redPoints.length > 0 && (
          <p className="mt-2 text-xs text-red-600">
            <strong>{redPoints.length}</strong> red-flag countr{redPoints.length === 1 ? 'y' : 'ies'}:{' '}
            {redPoints.map((p) => p.country).join(', ')}
          </p>
        )}
      </div>

      {/* Crisis Alert export (low-bandwidth: CSV / Markdown) */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Download className="h-4 w-4" />
          Crisis Alert export
        </h4>
        <p className="mb-3 text-xs text-slate-500">
          Small files for low-bandwidth: CSV or Markdown. Top 3 underfunded emergencies.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadAlert('csv')}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => downloadAlert('markdown')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Download Markdown
          </button>
        </div>
      </div>
    </div>
  );
}
