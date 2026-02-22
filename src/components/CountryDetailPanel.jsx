/**
 * Drill-down panel: shows live Databricks data for the selected country (from map click).
 */
import { X } from 'lucide-react';

export default function CountryDetailPanel({ countryProps, liveData, onClose }) {
  if (!countryProps) return null;

  const iso = countryProps.country_iso3 || countryProps.ISO_A3 || countryProps.iso_code;
  const name = countryProps.country || countryProps.ADMIN || countryProps.NAME || countryProps.name || iso;
  const records = (liveData || []).filter(
    (d) => (d.country_iso3 && d.country_iso3 === iso) || (d.country && (d.country === name || d.country_iso3 === iso))
  );
  const latest = records.length ? records.reduce((a, b) => (a.year > b.year ? a : b)) : null;

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
        {!latest && (
          <p className="text-slate-500">No live records for this country in the API data. Map uses merged GeoJSON.</p>
        )}
        {latest && (
          <dl className="space-y-2">
            <div>
              <dt className="text-slate-500">Year</dt>
              <dd className="font-medium">{latest.year}</dd>
            </div>
            <div>
              <dt className="text-slate-500">People in need</dt>
              <dd className="font-medium">{(latest.people_in_need || 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">People targeted</dt>
              <dd className="font-medium">{(latest.people_targeted || 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Requirements</dt>
              <dd className="font-medium">${(latest.requirements || 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Funding</dt>
              <dd className="font-medium">${(latest.funding || 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Funding gap</dt>
              <dd className="font-medium text-red-700">${(latest.funding_gap || 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Coverage</dt>
              <dd className="font-medium">{((latest.coverage_ratio ?? 0) * 100).toFixed(1)}%</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
