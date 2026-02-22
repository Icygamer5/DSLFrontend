/**
 * Drill-down panel: shows live Databricks data for the selected country (from map click).
 * Uses API record when available; falls back to merged GeoJSON (countryProps) so we don't show 0 when static data has values.
 */
import { X } from 'lucide-react';

function normalize(r) {
  if (!r || typeof r !== 'object') return {};
  const out = {};
  for (const k of Object.keys(r)) out[k.toLowerCase()] = r[k];
  return out;
}

// Prefer API value; if API has 0/null/empty, use map-click props (merged GeoJSON often has full crisis data)
function getVal(apiRow, props, ...keys) {
  const row = normalize(apiRow);
  const p = normalize(props);
  for (const k of keys) {
    const fromApi = row[k];
    const fromProps = p[k];
    const num = Number(fromApi);
    if (fromApi != null && fromApi !== '' && !Number.isNaN(num) && num !== 0) return fromApi;
    if (fromProps != null && fromProps !== '') return fromProps;
    if (fromApi != null && fromApi !== '') return fromApi;
  }
  return null;
}

export default function CountryDetailPanel({ countryProps, liveData, onClose }) {
  if (!countryProps) return null;

  const iso = countryProps.country_iso3 || countryProps.ISO_A3 || countryProps.iso_code;
  const name = countryProps.country || countryProps.ADMIN || countryProps.NAME || countryProps.name || iso;
  const records = (liveData || []).filter(
    (d) => (d.country_iso3 && d.country_iso3 === iso) || (d.country && (d.country === name || d.country_iso3 === iso))
  );
  const latest = records.length ? records.reduce((a, b) => (Number(a.year) > Number(b.year) ? a : b)) : null;

  // Use API row when present, fall back to map-click props (merged GeoJSON has full crisis record)
  const year = latest ? getVal(latest, countryProps, 'year') : getVal(null, countryProps, 'year');
  const peopleInNeed = getVal(latest, countryProps, 'people_in_need', 'total_people_in_need');
  const peopleTargeted = getVal(latest, countryProps, 'people_targeted');
  const requirements = getVal(latest, countryProps, 'requirements');
  const funding = getVal(latest, countryProps, 'funding');
  const fundingGap = getVal(latest, countryProps, 'funding_gap');
  const coverageRatio = getVal(latest, countryProps, 'coverage_ratio');

  const hasAnyData = [year, peopleInNeed, peopleTargeted, requirements, funding, fundingGap, coverageRatio].some(
    (v) => v != null && v !== '' && Number(v) !== 0
  );

  const fmtNum = (v) => (v != null && v !== '' ? Number(v).toLocaleString() : '—');
  const fmtMoney = (v) => (v != null && v !== '' ? `$${Number(v).toLocaleString()}` : '—');
  const fmtPct = (v) => (v != null && v !== '' ? `${(Number(v) * 100).toFixed(1)}%` : '—');

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Country: {name}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {!hasAnyData && (
          <p className="text-slate-500">No crisis data for this country. Map uses merged GeoJSON for colors.</p>
        )}
        {hasAnyData && (
          <dl className="space-y-2">
            <div>
              <dt className="text-slate-500">Year</dt>
              <dd className="font-medium">{year ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">People in need</dt>
              <dd className="font-medium">{fmtNum(peopleInNeed)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">People targeted</dt>
              <dd className="font-medium">{fmtNum(peopleTargeted)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Requirements</dt>
              <dd className="font-medium">{fmtMoney(requirements)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Funding</dt>
              <dd className="font-medium">{fmtMoney(funding)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Funding gap</dt>
              <dd className="font-medium text-red-700">{fmtMoney(fundingGap)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Coverage</dt>
              <dd className="font-medium">{fmtPct(coverageRatio)}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
