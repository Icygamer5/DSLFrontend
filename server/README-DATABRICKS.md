# Using Databricks data in the dashboard

## Does it work?

Yes. The app connects to your Databricks SQL Warehouse and runs queries.  
You need:

1. **API server running** so `/api/top_crises` is available (see below).
2. **A table in Databricks** with crisis data. The server looks for a table named in `.env` (default: `main.default.top_crises`).

## Fix "proxy error" / ECONNREFUSED

The error happens when the frontend calls `/api/top_crises` but nothing is listening on port 3001.

**Option A – One command (recommended)**  
From `DSLFrontend` run:

```bash
npm run dev:all
```

This starts both the Databricks API server and Vite. The dashboard will use live data when the table exists.

**Option B – Two terminals**  
- Terminal 1: `npm run server`  
- Terminal 2: `npm run dev`

## Point the app at your Databricks table

If you see `TABLE_OR_VIEW_NOT_FOUND` for `main.default.top_crises`, either:

1. **Create that table** in Databricks (e.g. in the `main` catalog, `default` schema) with columns like: `country_iso3`, `country`, `year`, `people_in_need`, `funding`, `requirements`, `coverage_ratio`, etc. (same shape as `src/data/top_crises.json`).

2. **Use an existing table** by setting in `.env`:
   ```env
   DATABRICKS_TOP_CRISES_TABLE=your_catalog.your_schema.your_table
   ```
   Then restart the server (`npm run server` or `npm run dev:all`).

If the table is missing or the query fails, the dashboard falls back to the static `top_crises.json` file so the app still works.
