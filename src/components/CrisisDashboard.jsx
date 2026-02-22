import { useState, useEffect } from 'react';
import Map from './Map';
import { Users, DollarSign, Wallet } from 'lucide-react';
import top_crises_static from '../data/top_crises.json';

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
  'Viet Nam': 'Asia',
  'Zimbabwe': 'Africa',
  'Malawi': 'Africa',
  // Add more countries and their regions as needed
};

function getTop5Underfunded(data) {
  const result = {};

  YEARS.forEach((year) => {
    // filter for the year
    const yearData = data.filter((d) => d.year === year);

    // sort ascending by coverage_ratio (lowest coverage first)
    yearData.sort((a, b) => a.coverage_ratio - b.coverage_ratio);

    // take top 5
    const top5 = yearData.slice(0, 5).map((d, i) => ({
      rank: i + 1,
      name: d.country,
      region: REGIONS[d.country] || 'Unknown',
      fundingGap: `${((1 - d.coverage_ratio) * 100).toFixed(0)}%`, // 100*(1-coverage_ratio)
    }));

    result[year] = top5;
  });

  return result;
}

// Summary cards
const SUMMARY_CARDS = [
  { label: 'Total People in Need', value: '75,400,000', icon: Users },
  { label: 'Total Funding Received', value: '$2,350,000,000', icon: DollarSign },
  { label: 'Average Funding Per Person', value: '$31.20', icon: Wallet },
];

export default function CrisisDashboard({ data }) {
  const [selectedYear, setSelectedYear] = useState(2023);
  const [topCrisesData, setTopCrisesData] = useState(top_crises_static);

  // Prefer Databricks API when the server is running; fallback to static JSON
  useEffect(() => {
    fetch('/api/top_crises')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((rows) => setTopCrisesData(Array.isArray(rows) ? rows : top_crises_static))
      .catch(() => { /* keep static data */ });
  }, []);

  const topCrises = getTop5Underfunded(topCrisesData);
  const currentCrises = topCrises[selectedYear] || [];

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="dashboard-header-bg shrink-0 rounded-b-2xl px-6 pb-5 pt-5 shadow-xl">
        <div className="flex items-center gap-5">
          <img
            src="/un-logo.png"
            alt="United Nations"
            className="h-16 w-16 shrink-0 object-contain drop-shadow-md md:h-20"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Crisis Funding Dashboard
            </h1>
            <p className="mt-0.5 text-sm font-medium text-white/90">
              Identifying the Most Underfunded Crises
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SUMMARY_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="flex items-start gap-4 rounded-xl border border-slate-200/60 bg-white/95 p-4 shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0d3a6e] text-white">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1 border-t border-slate-100 pt-3">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-800">{card.value}</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Top 5 Underfunded Locations
            </h2>

            {/* Year selector */}
            <div className="mt-2 flex gap-2">
              {[2023, 2024, 2025].map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
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
            <ul className="space-y-1">
              {currentCrises.map((crisis) => (
                <li key={crisis.rank}>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 transition-colors hover:bg-slate-100/80">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003d7a] text-xs font-medium text-white">
                      {crisis.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {crisis.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {crisis.region} · Gap {crisis.fundingGap}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Map */}
        <main className="relative min-w-0 flex flex-col flex-1">
          <div className="shrink-0 rounded-b-lg bg-gradient-to-b from-slate-700/90 to-slate-800/95 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-white">Global Crisis Hotspots</h3>
          </div>
          <div className="relative min-h-0 flex-1 bg-space-stars">
            <Map data={data} mapStyle="mapbox://styles/mapbox/dark-v11" projection="globe" />
          </div>
        </main>
      </div>
    </div>
  );
}