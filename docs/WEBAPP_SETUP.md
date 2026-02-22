# Custom Web App Setup (Crisis Funding Dashboard)

Use this checklist when the app shows **"No compute attached"**, **"API error"**, or the Decision tab fails. The custom web app needs Databricks credentials in `.env`.

---

## Quick checklist

- [ ] **1.** Create a **Personal Access Token (PAT)** in Databricks.
- [ ] **2.** Get your **Databricks hostname** (workspace URL without `https://`).
- [ ] **3.** Get your **SQL Warehouse ID** (Serverless recommended).
- [ ] **4.** Create or update **`.env`** in `DSLFrontend/` with the variables below.
- [ ] **5.** Grant **CAN USE** on the SQL Warehouse to the token (or your user).
- [ ] **6.** Grant **SELECT** on the Unity Catalog table to the token (or your user).
- [ ] **7.** Run **`npm install`** in `DSLFrontend/`.
- [ ] **8.** Run **`npm run server`** (API on port **3001**).
- [ ] **9.** Run **`npm run dev`** (frontend on port **5173**); open **http://localhost:5173** (not 3000).

---

## 1. Create Personal Access Token (PAT)

1. In Databricks: **Settings** (gear) → **Developer** → **Access tokens**.
2. **Generate new token**; copy and store it securely.
3. Put it in `.env` as `DATABRICKS_PAT=dapi...`.

---

## 2. Get Databricks hostname

From your workspace URL, e.g.:

- URL: `https://dbc-20724627-a496.cloud.databricks.com`
- Hostname: `dbc-20724627-a496.cloud.databricks.com`

Set in `.env`:

```env
DATABRICKS_SERVER_HOSTNAME=dbc-20724627-a496.cloud.databricks.com
```

---

## 3. Get SQL Warehouse ID

1. Go to **SQL** → **Warehouses** in Databricks.
2. Use a **Serverless** warehouse (avoids "sleep" timeouts).
3. Open the warehouse → copy **HTTP Path** or **ID** (the hex string at the end of the path).

**Example (this project):** **Serverless Starter Warehouse** (ID: `dc48d30bfbf3859c`)

- HTTP path: `/sql/1.0/warehouses/dc48d30bfbf3859c`
- Warehouse ID: `dc48d30bfbf3859c`

In `.env`:

```env
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/dc48d30bfbf3859c
DATABRICKS_WAREHOUSE_ID=dc48d30bfbf3859c
```

---

## 4. Complete `.env` file template

Copy `DSLFrontend/.env.example` to `DSLFrontend/.env` and fill in your values:

```env
# Map (frontend)
VITE_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token

# Databricks (backend only — do NOT add VITE_ prefix)
DATABRICKS_PAT=dapiYourTokenHere
DATABRICKS_SERVER_HOSTNAME=dbc-20724627-a496.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/YOUR_WAREHOUSE_ID
DATABRICKS_WAREHOUSE_ID=YOUR_WAREHOUSE_ID
DATABRICKS_TOP_CRISES_TABLE=crisis.data_def.gold_crisis_impact

# Genie (from Genie space URL: .../genie/rooms/<id>)
GENIE_SPACE_ID=01f10fc204ca12d99e5339a776057d15
```

**Important:** Use `catalog.schema.table` for `DATABRICKS_TOP_CRISES_TABLE`. The backend uses this for Map data, Decision metrics, and Crisis Alert export.

---

## 5. Grant CAN USE on warehouse

The user or token that owns the PAT must have **CAN USE** on the SQL Warehouse:

- **SQL** → **Warehouses** → your warehouse → **Permissions** → add **CAN USE** for your user (or the principal that owns the token).

---

## 6. Grant SELECT on the table

The same principal needs **SELECT** on the Unity Catalog table (e.g. `crisis.data_def.gold_crisis_impact`):

- **Data** → find the table → **Permissions** → add **SELECT** for your user / service principal.

---

## 7–9. Install, run server, run frontend

From the **DSLFrontend** directory:

```bash
npm install
npm run server
```

In another terminal:

```bash
npm run dev
```

- **API server:** http://localhost:**3001** (serves `/api/top_crises`, `/api/mismatch`, `/api/decision-metrics`, `/api/genie/ask`, etc.)
- **Web app:** http://localhost:**5173** (Vite proxies `/api` to 3001)

Open the **web app** at **http://localhost:5173** (not 3000). To use port 3000 for the API, set `PORT=3000` in `.env` before `npm run server`.

**One-command option:** `npm run dev:all` runs both the server and the frontend.

---

## If you still see "No compute attached" or API errors

- Confirm the **warehouse is running** (Serverless starts on demand).
- Confirm **DATABRICKS_WAREHOUSE_ID** matches the warehouse (e.g. the ID in the HTTP path).
- Confirm the **PAT** is valid and has **CAN USE** on the warehouse and **SELECT** on the table.
- Check the terminal where `npm run server` is running for the exact error message.

For Decision tab issues (e.g. "Unexpected token '<'" or no data), see [DECISION_DATABRICKS_SETUP.md](./DECISION_DATABRICKS_SETUP.md).
