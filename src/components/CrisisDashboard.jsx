import Map from './Map';
import { Users, DollarSign, Wallet } from 'lucide-react';

const TOP_CRISES = [
  { rank: 1, name: 'Burkina Faso', region: 'Sahel', fundingGap: '87%' },
  { rank: 2, name: 'Myanmar', region: 'Southeast Asia', fundingGap: '76%' },
  { rank: 3, name: 'Haiti', region: 'Caribbean', fundingGap: '72%' },
  { rank: 4, name: 'Venezuela', region: 'South America', fundingGap: '68%' },
  { rank: 5, name: 'Afghanistan', region: 'South Asia', fundingGap: '64%' },
];

const SUMMARY_CARDS = [
  { label: 'Total People in Need', value: '75,400,000', icon: Users },
  { label: 'Total Funding Received', value: '$2,350,000,000', icon: DollarSign },
  { label: 'Average Funding Per Person', value: '$31.20', icon: Wallet },
];

export default function CrisisDashboard({ data }) {
  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-800">
      {/* Header: textured blue with UN image, title, subtitle, and stat cards */}
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

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Top 5 Overlooked Crises
            </h2>
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-1">
              {TOP_CRISES.map((crisis) => (
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

        <main className="relative min-w-0 flex-1 flex flex-col">
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
