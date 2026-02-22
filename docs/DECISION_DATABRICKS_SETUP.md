# Decision Page: Databricks Setup & Diagnostic

When the Decision tab shows **"Unexpected token '<'"** or **"No data for scatter plot"**, the frontend is either hitting an HTML error page instead of the API, or the API cannot reach Databricks. Follow this path.

---

## 1. The JSON Error (HTML instead of API)

**Symptom:** `Unexpected token '<', " <!DOCTYPE "... is not valid JSON`

**Cause:** The app requested `/api/mismatch` or `/api/decision-metrics` but received an HTML page (e.g. 404, 502, or Vite’s index.html when the API server isn’t running).

**Fix:**

1. **API server**  
   From `DSLFrontend` run:  
   `npm run server`  
   It should listen on port 3001. The Vite dev server proxies `/api` to `http://localhost:3001`.

2. **Table name (catalog.schema.table)**  
   In `DSLFrontend/.env` set:
   ```env
   DATABRICKS_TOP_CRISES_TABLE=crisis.data_def.gold_crisis_impact
   ```
   (Replace with your catalog.schema.table.) The backend uses this for mismatch, decision-metrics, and crisis-alert.

3. **Warehouse**  
   Use a **Serverless SQL Warehouse**. A "Pro" warehouse may be sleeping and cause timeouts, which can return HTML error pages.

4. **Permissions**  
   The token (PAT) or Service Principal must have:
   - **CAN USE** on the SQL Warehouse
   - **SELECT** on the Unity Catalog table(s) used by the app

---

## 2. No Data for Scatter Plot

**Symptom:** Scatter plot shows "No data for scatter plot."

**Causes:**

- The API is returning empty `points` (e.g. table empty, or query filters out all rows).
- In **Genie**, scatter requires numeric measures; the website scatter uses the **Node API** (`/api/mismatch`), not Genie. So "No data" here usually means the Node API got no rows from Databricks (wrong table, no data, or SQL error caught and returning empty).

**Fix:**

- Ensure the table has rows with `coverage_ratio IS NOT NULL` and `people_in_need > 0` (the mismatch query uses these).
- In Databricks, if you use **Genie** for other views: in **Configure → SQL Expressions → Measures**, define **Severity** and **Funding** (or equivalent) as numeric (e.g. DOUBLE/INT) so Genie can generate charts; this does not fix the Decision tab scatter by itself but keeps Genie consistent.

---

## 3. Mary’s Mismatch Logic (for Genie + website)

The **Decision** tab computes red flags and metrics in the **Node API** using the same table. To align Genie with the same logic:

### A. Red-flag / Mismatch index

**In Genie (Configure → SQL Expressions → Measures):**

- **Mismatch index (high = priority):**
  ```sql
  (inform_severity_score / NULLIF(funding_coverage_percentage, 0)) * 100
  ```
  (Use your actual severity and coverage column names; e.g. `coverage_ratio * 100` for funding %.)

**Instruction for Genie:**  
*A 'Red Flag' crisis is any country with Severity Score > 4 and Funding Coverage < 25%.*

### B. Structural gap

**Measure:**

```sql
people_in_need - people_targeted
```

**Instruction:**  
*When asked for "Structural Gap", use the difference between People in Need and People Targeted to show the coverage deficit.*

### C. Crisis Alert export (low-bandwidth)

The website already provides **Download CSV** and **Download Markdown** (top 3 underfunded). The backend builds these from the same table; no Genie required. For Genie, you can add a benchmark question: *"What are the top 3 overlooked crises?"* so the logic is tested when you update the space.

---

## 4. Checklist summary

| Item | Check |
|------|--------|
| API server | `npm run server` in DSLFrontend, port 3001 |
| .env | DATABRICKS_PAT, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_WAREHOUSE_ID, DATABRICKS_TOP_CRISES_TABLE |
| Table | `catalog.schema.table`, e.g. `crisis.data_def.gold_crisis_impact` |
| Warehouse | Prefer Serverless; token has CAN USE |
| Table permission | SELECT on the table for the token |
| Columns | Table has coverage_ratio, people_in_need, people_targeted (and country, year, etc.) |
| Genie (optional) | Measures for Severity and Funding %; instructions for Red Flag and Structural Gap |

---

## 5. Trusted assets (optional)

If the scatter or Genie charts still fail after the above:

- In Databricks SQL, create a **view** or **dashboard** that pre-calculates severity, funding %, structural gap, and mismatch flag.
- Point the app (and optionally the Genie space) at that view so the backend and Genie both use the same “pre-digested” logic.
