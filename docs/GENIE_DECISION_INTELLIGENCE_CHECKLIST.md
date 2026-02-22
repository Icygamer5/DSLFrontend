# Genie Space: Decision Intelligence Checklist (Mary's UN Requirements)

Use this when configuring your Databricks Genie space so judges and Mary see the full "Decision Intelligence" layer.

**If the Decision tab shows "Unexpected token '<'" or no data:** see [DECISION_DATABRICKS_SETUP.md](./DECISION_DATABRICKS_SETUP.md) for the full diagnostic path (API server, table name, warehouse, permissions).

---

## 1. Table descriptions (Unity Catalog)

In Unity Catalog, add **table and column descriptions** so Genie understands human meaning:

- **Table**: `crisis.data_def.gold_crisis_impact` (or your gold table)
- **Suggested description**: "Humanitarian crisis funding: INFORM-style severity, HRP funding coverage, people in need, people targeted, requirements, funding. Use for mismatch analysis (high severity vs low funding)."
- **Columns**: Describe `coverage_ratio` as "HRP funding coverage (0–1)". If you add INFORM_Score, describe it as "INFORM Severity Score (0–5)."

---

## 2. SQL expressions (Configure → SQL Expressions → Measures)

Add calculated measures so Genie can answer Mary's "Top 3" and red-flag logic:

| Measure / logic | Purpose |
|-----------------|--------|
| **Mismatch index** | `CASE WHEN (INFORM_Score >= 4 OR severity_proxy >= 4) AND (coverage_ratio * 100 < 25) THEN 1 ELSE 0 END` — or use `(1 - coverage_ratio) * 5` as severity proxy if no INFORM. |
| **Severity gap** | `1 / NULLIF(coverage_ratio, 0)` (higher = more neglect). |
| **Structural gap** | `people_in_need - people_targeted`. |
| **Funding velocity** | If you have monthly funding: `current_month_funding - same_month_last_year_funding`. |

---

## 3. Benchmarking toggle (Genie instructions)

In **Genie Space → Instructions**, add:

- **When the user asks to "benchmark by crisis type" or "compare across regions"**, group by `crisis_category` (e.g. Flood, Drought) across all countries, not just one country.
- **Within-country vs cross-regional**: If the user says "within country", filter to one country and show time or plan comparison; if they say "cross-regional" or "by crisis type", group by crisis type or region across countries.

---

## 4. Suggested question (Genie Space)

Add a **Suggested question** in your Genie space:

- **"Generate a Crisis Alert summary for the top 3 underfunded emergencies."**

This matches what Mary asked for and works with the Crisis Alert export (CSV/Markdown) on the dashboard.

---

## 5. Crisis Alert export (already in this app)

The **Decision** tab on the Crisis Funding Dashboard provides:

- **Download CSV** and **Download Markdown** for the top 3 underfunded emergencies (low-bandwidth friendly).
- The same suggested question is shown so users can paste it into **Ask Genie** for an instant summary.

---

## 6. Optional: "Forgotten Crisis" / media mentions

If you join a **media mentions** dataset (e.g. GDELT) with funding data:

- Add a measure like **media_mentions** or **forgotten_crisis_score** (e.g. high need, low funding, low mentions).
- Describe the column in Unity Catalog so Genie can suggest "most forgotten" crises.
