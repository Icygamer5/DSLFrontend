/**
 * Renders a chart from Genie API response. Uses data_array and chart type (bar, pie, line).
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

const COLORS = ['#003d7a', '#0d9488', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899'];

function normalizeRowKeys(row) {
  if (!row || typeof row !== 'object') return row;
  const r = {};
  for (const k of Object.keys(row)) r[k.toLowerCase()] = row[k];
  return r;
}

// Collect data_array from Genie response (backend may put it on result or in attachments/query-result)
function extractDataArray(result) {
  if (!result) return [];
  if (Array.isArray(result.data_array) && result.data_array.length > 0) return result.data_array;
  const attachments = result.attachments || [];
  const first = attachments[0];
  if (first && Array.isArray(first.data_array) && first.data_array.length > 0) return first.data_array;
  if (first && Array.isArray(first.data)) return first.data;
  const stmt = result.statement_response || result;
  const resResult = stmt.result || {};
  const dataArray = resResult.data_array || [];
  if (dataArray.length === 0) return [];
  const manifest = stmt.manifest || {};
  const schema = manifest.schema || {};
  const columns = schema.columns || [];
  const names = columns.map((c) => (typeof c === 'object' && c && c.name != null ? c.name : c)).filter(Boolean);
  if (names.length) return dataArray.map((row) => { const o = {}; names.forEach((n, i) => { o[n] = row[i]; }); return o; });
  return dataArray;
}

function getDataAndType(result) {
  if (!result) return { data: [], chartType: 'bar', responseKeys: [] };
  const responseKeys = Object.keys(result);
  let data = extractDataArray(result);
  const attachments = result.attachments || [];
  const first = attachments[0] || result;
  let chartType = (first.chart_type ?? first.chartType ?? result.chart_type ?? result.chartType ?? 'bar').toLowerCase();
  if (Array.isArray(data) && data.length > 0 && typeof data[0] !== 'object') {
    data = data.map((v, i) => ({ name: `Item ${i + 1}`, value: Number(v) }));
  }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    const row0 = normalizeRowKeys(data[0]);
    const countryKey = row0.country != null ? 'country' : row0.country_name != null ? 'country_name' : null;
    const fundingGapKey = row0.funding_gap != null ? 'funding_gap' : null;
    const peopleKey = row0.total_people_in_need != null ? 'total_people_in_need' : row0.people_in_need != null ? 'people_in_need' : row0.total_pin != null ? 'total_pin' : null;
    if (countryKey && (fundingGapKey || peopleKey)) {
      const valueKey = fundingGapKey || peopleKey;
      data = data.map((row) => {
        const r = normalizeRowKeys(row);
        return {
          name: String(r[countryKey] ?? r.country ?? r.country_name ?? 'Unknown'),
          value: Number(r[valueKey] ?? 0) || 0,
        };
      });
    } else {
      const keys = Object.keys(data[0]);
      if (keys.length >= 2 && !data[0].name && !data[0].value) {
        data = data.map((row) => ({ name: String(row[keys[0]]), value: Number(row[keys[1]]) ?? 0 }));
      }
    }
  }
  return { data, chartType, responseKeys };
}

export default function GenieChart({ result }) {
  const { data, chartType, responseKeys } = getDataAndType(result);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500 text-sm">
        <p>No chart data in Genie response. Try &quot;Funding gap by country&quot; or &quot;Top 5 by people in need&quot;.</p>
        <p className="mt-2 text-xs text-slate-400">
          If the benchmark is 100%, check: (1) Publish the Genie space, (2) Define measures in Configure → SQL Expressions → Measures, (3) Unity Catalog SELECT on the table.
        </p>
        {result && responseKeys.length > 0 && (
          <p className="mt-2 text-xs font-mono text-slate-500">Response keys: {responseKeys.join(', ')}</p>
        )}
      </div>
    );
  }

  const chartData = data.map((d, i) => ({
    ...d,
    name: d.name ?? d.label ?? `Item ${i + 1}`,
    value: Number(d.value ?? d.val ?? 0) || 0,
    fill: COLORS[i % COLORS.length],
  }));

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name, value }) => `${name}: ${value}`}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#003d7a" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Bar: X-axis = labels (country), Y-axis = value (e.g. funding_gap or total_people_in_need)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v)} />
        <Tooltip formatter={(value) => [typeof value === 'number' && value >= 1e6 ? `$${(value / 1e6).toFixed(1)}M` : value, 'Value']} />
        <Bar dataKey="value" name="Funding gap" fill="#003d7a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
