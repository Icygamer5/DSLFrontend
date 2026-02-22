/**
 * "What would you like to see?" input, loading state, and GenieChart reveal.
 */
import { useState, useEffect } from 'react';
import GenieChart from './GenieChart';
import { Sparkles } from 'lucide-react';

async function parseJsonResponse(res) {
  const text = await res.text();
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      'Server returned an HTML page instead of JSON. Is the API server running? Run "npm run server" in DSLFrontend and ensure the app uses the dev server (e.g. http://localhost:5173) so /api is proxied to port 3001.'
    );
  }
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid response from server. Ensure the API server is running (npm run server).');
  }
}

export default function GenieAsk({ initialPrompt = '' }) {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [genieConfigured, setGenieConfigured] = useState(null);

  useEffect(() => {
    fetch('/api/genie/status')
      .then((r) => r.json())
      .then((data) => setGenieConfigured(data.configured === true))
      .catch(() => setGenieConfigured(false));
  }, []);

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
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        setError(data?.error || res.statusText || 'Request failed');
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
      {genieConfigured === false && (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Genie is not configured. In <code className="rounded bg-amber-100 px-1">DSLFrontend/.env</code> set GENIE_SPACE_ID, DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, then restart the API server (<code className="rounded bg-amber-100 px-1">npm run server</code>).
        </p>
        )}
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
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Genie request failed</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs text-red-700">
            Check: (1) API server is running (<code>npm run server</code>), (2) .env has GENIE_SPACE_ID (from Genie space URL), DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, (3) Genie space is Published in Databricks, (4) Token has access to the space and CAN USE on a SQL warehouse.
          </p>
        </div>
      )}
      {result && !loading && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <GenieChart result={result} />
        </div>
      )}
    </div>
  );
}
