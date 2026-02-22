import { useState, useEffect } from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import Map from './Map';
import GenieAsk from './GenieAsk';
import CountryDetailPanel from './CountryDetailPanel';
import DecisionIntelligence from './DecisionIntelligence';
import { Users, DollarSign, Wallet, MapPin, BarChart3, Target, Sparkles, X } from 'lucide-react';
import top_crises_static from '../data/top_crises.json';

const LAKEVIEW_EMBED_URL = 'https://dbc-20724627-a496.cloud.databricks.com/embed/dashboardsv3/01f10fd0a0b913319891b8f689a258d2?o=7474655950071744';
const YEARS = [2023, 2024, 2025];
const REGIONS = {
  'Afghanistan': 'Asia',
  'Syria': 'Middle East',
  'Yemen': 'Middle East',
  'South Sudan': 'Africa',
  'Venezuela': 'South America',
  'Honduras': 'Central America',
  'Guatemala': 'Central America',
  'El Salvador': 'Central America',
  'Mali': 'Africa',
  'Burundi': 'Africa',
  'Philippines': 'Asia',
  'Zambia': 'Africa',
  'Ethiopia': 'Africa',
  'Vietnam': 'Asia',
  'Zimbabwe': 'Africa',
  'Malawi': 'Africa',
  'Cameroon': 'Africa',
  'Chad': 'Africa',
  'Mozambique': 'Africa',
  'Haiti': 'Caribbean',
  'Bangladesh': 'Asia',
  'Grenada': 'Caribbean',
  'Niger': 'Africa',
  // Add more countries and their regions as needed
};

// Normalize row from API (Databricks/Genie may return different casing or names)
function normalizeTopCrisesRow(row) {
  if (!row || typeof row !== 'object') return row;
  const r = {};
  for (const k of Object.keys(row)) r[k.toLowerCase()] = row[k];
  return {
    ...row,
    country: r.country ?? r.country_name ?? r.name ?? row.country,
    year: r.year ?? row.year,
    coverage_ratio: r.coverage_ratio != null ? Number(r.coverage_ratio) : row.coverage_ratio,
    people_in_need: r.people_in_need ?? r.total_people_in_need ?? row.people_in_need ?? 0,
    people_targeted: r.people_targeted ?? row.people_targeted ?? 0,
    requirements: r.requirements ?? row.requirements ?? 0,
    funding: r.funding ?? row.funding ?? 0,
    funding_gap: r.funding_gap != null ? Math.abs(Number(r.funding_gap)) : row.funding_gap,
    plans: r.plans ?? row.plans,
  };
}

function buildCrisisLookup(data) {
  const result = {};

  data.forEach((d) => {
    const key = `${d.country}${d.year}`;

    result[key] = {
      people_in_need: d.people_in_need || 0,
      people_targeted: d.people_targeted || 0,
      requirements: d.requirements || 0,
      funding: d.funding || 0,
      plans: d.plans ? (typeof d.plans === 'string' ? JSON.parse(d.plans) : d.plans) : [],
    };
  });

  return result;
}

const queriedCrisisData = buildCrisisLookup(top_crises_static);

function getTop10Underfunded(data) {
  const result = {};

  YEARS.forEach((year) => {
    const yearData = data.filter((d) => Number(d.year) === year);
    const hasCoverage = yearData.some((d) => d.coverage_ratio != null);
    if (hasCoverage) {
      yearData.sort((a, b) => (a.coverage_ratio ?? 1) - (b.coverage_ratio ?? 1));
    } else {
      yearData.sort((a, b) => (b.funding_gap ?? 0) - (a.funding_gap ?? 0));
    }
    const top5 = yearData.slice(0, 5).map((d, i) => ({
      rank: i + 1,
      name: d.country || 'Unknown',
      region: REGIONS[d.country] || 'Unknown',
      fundingGap: d.coverage_ratio != null
        ? `${((1 - d.coverage_ratio) * 100).toFixed(0)}%`
        : (d.funding_gap != null ? `$${(d.funding_gap / 1e6).toFixed(0)}M` : '—'),
    }));
    result[year] = top5;
  });

  return result;
}

function getSummaryEachYear(data) {
  const result = {};
  YEARS.forEach((year) => {
    const yearData = data.filter((d) => Number(d.year) === year);
    const total_people_in_need = yearData.reduce((sum, d) => sum + (Number(d.people_in_need) || 0), 0);
    const total_funding = yearData.reduce((sum, d) => sum + (Number(d.funding) || 0), 0);
    const average_funding_per_person = total_people_in_need ? total_funding / total_people_in_need : 0;
    result[year] = { total_people_in_need, total_funding, average_funding_per_person };
  });
  return result;
}

export default function CrisisDashboard({ data }) {
  const [selectedYear, setSelectedYear] = useState(2025);
  const [topCrisesData, setTopCrisesData] = useState(top_crises_static);

  useEffect(() => {
    fetch('/api/top_crises')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows.map(normalizeTopCrisesRow) : [];
        const hasValidData =
          list.length > 0 &&
          list.some(
            (r) =>
              (Number(r.people_in_need) || 0) > 0 ||
              (Number(r.funding) || 0) > 0 ||
              (Number(r.requirements) || 0) > 0
          );
        if (hasValidData) setTopCrisesData(list);
      })
      .catch(() => {});
  }, []);

  const topCrises = getTop10Underfunded(topCrisesData);
  const currentCrises = topCrises[selectedYear] || [];
  const yearSummary = getSummaryEachYear(topCrisesData)[selectedYear];

  const animPeople = useAnimatedNumber(yearSummary?.total_people_in_need ?? 0, 1200);
  const animFunding = useAnimatedNumber(yearSummary?.total_funding ?? 0, 1400);
  const animAvg = useAnimatedNumber(yearSummary?.average_funding_per_person ?? 0, 1000);

  const SUMMARY_CARDS = [
    { label: 'Total People in Need (Global)', value: Math.round(animPeople).toLocaleString(), icon: Users },
    { label: 'Total Funding Received (Global)', value: `$${Math.round(animFunding).toLocaleString()}`, icon: DollarSign },
    { label: 'Average Funding Per Person (Global)', value: `$${animAvg.toFixed(2)}`, icon: Wallet },
  ];

  const [selectedCrisis, setSelectedCrisis] = useState(null);
  const [selectedMapCountry, setSelectedMapCountry] = useState(null);
  const [mapProjection, setMapProjection] = useState('globe'); // 'globe' = 3D, 'mercator' = 2D
  const [mainView, setMainView] = useState('map'); // 'map' | 'charts' | 'decision'
  const [geniePopupOpen, setGeniePopupOpen] = useState(false);
  const [genieInitialPrompt, setGenieInitialPrompt] = useState('');
  const GENIE_CRISIS_ALERT_PROMPT = 'Generate a Crisis Alert summary for the top 3 underfunded emergencies.';

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="dashboard-header-bg shrink-0 rounded-b-xl px-6 py-3 shadow-lg">
        <div className="flex items-center gap-5">
          <img
            src="/un-logo.png"
            alt="United Nations"
            className="h-12 w-12 shrink-0 object-contain drop-shadow-md md:h-14"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
              Crisis Funding Dashboard
            </h1>
            <p className="mt-0.5 text-sm font-medium text-white/90">
              Identifying the Most Underfunded Crises
            </p>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            {[2023, 2024, 2025].map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`rounded-md px-12 py-4 text-xl font-medium transition ${
                  selectedYear === year
                    ? 'bg-[#003d7a] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {year}
            </button>
          ))}
        </div>
        </div>

        {/* Summary Cards — numbers count up on load / year change */}
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SUMMARY_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="flex items-start gap-4 rounded-xl border border-slate-200/60 bg-white/95 p-3 shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0d3a6e] text-white">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1 border-t border-slate-100 pt-3">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-800 tabular-nums">{card.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      {/* Sidebar + Main */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-m font-semibold uppercase tracking-wider text-slate-500">
              Top 10 Underfunded Places
            </h2>

            {/* Year selector */}
            <div className="mt-2 flex gap-2">
              {[2023, 2024, 2025].map((year) => (
                <button
                  key={year}
                  onClick={() => {
                    setSelectedYear(year);
                    setSelectedCrisis(null);
                  }}
                  className={`rounded-md px-4 py-2 text-s font-medium transition ${
                    selectedYear === year
                      ? 'bg-[#003d7a] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            {!selectedCrisis ? (
              <ul className="space-y-1">
                {currentCrises.map((crisis) => (
                  <li key={crisis.rank}>
                    <button
                      onClick={() => setSelectedCrisis(crisis)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 transition-colors hover:bg-slate-100/80">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003d7a] text-xs font-medium text-white">
                          {crisis.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-l font-medium text-slate-800">
                            {crisis.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {crisis.region} · Gap {crisis.fundingGap}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedCrisis(null)}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  ← Back
                </button>

                <h3 className="text-lg font-bold text-slate-800">
                  {selectedCrisis.name} ({selectedYear})
                </h3>

                <div className="space-y-2 text-medium text-slate-700">
                  <p><strong>People in Need:</strong> {(queriedCrisisData[selectedCrisis.name + selectedYear]?.people_in_need || 'N/A').toLocaleString()}</p>
                  <p><strong>People Targeted:</strong> {(queriedCrisisData[selectedCrisis.name + selectedYear]?.people_targeted || 'N/A').toLocaleString()}</p>
                  <p><strong>Requirements:</strong> ${(queriedCrisisData[selectedCrisis.name + selectedYear]?.requirements || 'N/A').toLocaleString()}</p>
                  <p><strong>Funding:</strong> ${(queriedCrisisData[selectedCrisis.name + selectedYear]?.funding || 'N/A').toLocaleString()}</p>
                  <p><strong>Response Plans:</strong></p>
                  <ul className="list-disc list-inside">
                    {queriedCrisisData[selectedCrisis.name + selectedYear]?.plans?.map((plan, index) => (
                      <li key={index}>{plan}</li>
                    )) || <li>No plans available</li>}
                  </ul>
                </div>
              </div>
            )}
          </nav>
        </aside>

        {/* Main: Map or embedded Lakeview charts */}
        <main className="relative min-w-0 flex flex-col flex-1">
          <div className="shrink-0 rounded-b-lg bg-gradient-to-b from-slate-700/90 to-slate-800/95 px-4 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-white">
                {mainView === 'map' && 'Global Crisis Hotspots 2025 — click a country for details'}
                {mainView === 'charts' && 'Crisis dashboard charts'}
                {mainView === 'decision' && 'Decision Intelligence — mismatch & crisis alert'}
              </h3>
              <div className="flex rounded-md bg-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => setMainView('map')}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${mainView === 'map' ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setMainView('charts')}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${mainView === 'charts' ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Charts
                </button>
                <button
                  type="button"
                  onClick={() => setMainView('decision')}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${mainView === 'decision' ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`}
                >
                  <Target className="h-3.5 w-3.5" />
                  Decision
                </button>
              </div>
            </div>
          </div>
          {mainView === 'map' && (
            <>
              <div className="relative min-h-0 flex-1 bg-space-stars">
                <div className="absolute top-4 right-4 z-10 flex rounded-lg border border-white/20 bg-slate-900/80 p-1 shadow-lg backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setMapProjection('mercator')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mapProjection === 'mercator' ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`}
                    title="2D map"
                  >
                    2D
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapProjection('globe')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mapProjection === 'globe' ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`}
                    title="3D globe"
                  >
                    3D
                  </button>
                </div>
                <Map
                  data={data}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  projection={mapProjection}
                  onCountryClick={setSelectedMapCountry}
                  selectedCountry={selectedMapCountry}
                />
                <CountryDetailPanel
                  countryProps={selectedMapCountry}
                  liveData={topCrisesData}
                  onClose={() => setSelectedMapCountry(null)}
                />
              </div>
            </>
          )}
          {mainView === 'charts' && (
            <div className="relative min-h-0 flex-1 bg-slate-100">
              <iframe
                src={LAKEVIEW_EMBED_URL}
                title="Crisis funding dashboard charts"
                className="h-full w-full border-0"
                style={{ minHeight: 600 }}
              />
              {/* Ask Genie in upper right (we can't move the iframe's button) */}
              <button
                type="button"
                onClick={() => {
                  setGenieInitialPrompt('');
                  setGeniePopupOpen(true);
                }}
                className="absolute top-6 right-6 z-10 flex items-center gap-2 rounded-xl border-2 border-violet-400/60 bg-gradient-to-br from-indigo-200 via-pink-200 to-orange-300 px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg transition hover:scale-105 hover:shadow-xl"
              >
                <Sparkles className="h-5 w-5 text-pink-500" />
                Ask Genie
              </button>
            </div>
          )}
          {mainView === 'decision' && (
            <div className="relative min-h-0 flex-1 bg-slate-50">
              <DecisionIntelligence />
              {/* Ask Genie on Decision tab — pre-fill with Crisis Alert suggested question */}
              <button
                type="button"
                onClick={() => {
                  setGenieInitialPrompt(GENIE_CRISIS_ALERT_PROMPT);
                  setGeniePopupOpen(true);
                }}
                className="absolute top-6 right-6 z-10 flex items-center gap-2 rounded-xl border-2 border-violet-400/60 bg-gradient-to-br from-indigo-200 via-pink-200 to-orange-300 px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg transition hover:scale-105 hover:shadow-xl"
              >
                <Sparkles className="h-5 w-5 text-pink-500" />
                Ask Genie
              </button>
            </div>
          )}
          {/* Genie pop-up (Map / Charts / Decision) */}
          {geniePopupOpen && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
              <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-800">Ask Genie</span>
                  <button
                    type="button"
                    onClick={() => setGeniePopupOpen(false)}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto p-4">
                  <GenieAsk initialPrompt={genieInitialPrompt} />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}