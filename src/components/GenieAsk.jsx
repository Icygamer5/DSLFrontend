/**
 * "What would you like to see?" input, loading state, and GenieChart reveal.
 */
import { useState } from 'react';
import GenieChart from './GenieChart';
import { Sparkles } from 'lucide-react';

export default function GenieAsk() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleAsk = async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/genie/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || res.statusText);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-slate-700">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-semibold">Genie</h3>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Ask for funding_gap by country or total_people_in_need (Genie uses your configured measures).
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="e.g. Funding gap by country for United Nations Crisis Funding Dashboard"
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#003d7a] focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={loading}
          className="rounded-md bg-[#003d7a] px-4 py-2 text-sm font-medium text-white hover:bg-[#002a57] disabled:opacity-50"
        >
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>
      {loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#003d7a]" />
          Genie is analyzing data…
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}. Ensure GENIE_SPACE_ID is set in the server .env and the API server is running.
        </p>
      )}
      {result && !loading && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <GenieChart result={result} />
        </div>
      )}
    </div>
  );
}
