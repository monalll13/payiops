# CLAUDE.md — PAYI Ops

Context for AI assistants working on this project. Read this first.

## What this is

**PAYI Ops** — a workflow/analytics hub for a Thai e-commerce business selling on
Shopee / TikTok Shop / Lazada. Owner speaks **Thai** (reply in Thai). Hard constraint:
**everything must be free-tier** (Vercel Hobby + GitHub + Google Sheets as the database —
no paid services, ever).

The app was lost when the owner's old PC was wiped (2026-07-03) and rebuilt: the shell
(`App.jsx`, `theme.css`, `payi-logo.png`, `ClaimView.jsx`) was recovered from claude.ai
artifacts and kept in `recovered/`; everything else was rebuilt from scratch.

## Stack & architecture

- **Frontend**: Vite + React 19 + Recharts + lucide-react. Plain CSS via `src/theme.css`
  (PAYI theme, CSS variables like `--payi-mint`, `--payi-surface`, `--payi-text-strong`).
- **`src/App.jsx`** is a **tab-based shell** (no router). Active tab in `localStorage`
  key `payi-active-tab`. Sidebar menu = `menuGroups` array; render is a big ternary on
  `activeTab`. To add a page: add a menu item + a ternary branch + the component.
- **Backend**: Vercel **serverless functions** in `api/*.js`, reading Google Sheets via a
  service account (`api/_lib/sheets.js`). Frontend calls **flat** `/api/<name>` endpoints
  (query params for sub-routing, e.g. `/api/claims?view=monthly`). No nested paths — the
  local dev middleware and Vercel both map `/api/<name>` → `api/<name>.js`.
- **File uploads parse xlsx CLIENT-SIDE** (via the `xlsx` dep) and POST JSON — never
  multipart. This is deliberate so imports work on serverless.
- **Dev**: `npm run dev` runs Vite AND serves `/api/*` locally (middleware in
  `vite.config.js`). Requires root `.env`. `npm run build` to check compile.

## Data (Google Sheets: "mona-ops-db", SHEET_ID in .env)

Tabs: `raw_orders_2026_MM` (Jan–May filled, ~190k order rows total), `claims`,
`product_aliases`, `import_log`. Businesses: **Payi**, **Payi Outlet**, **กรอบรูป**.
Platforms: **Shopee**, **TikTok Shop**, **Lazada**. Total sales ~฿34.5M.

`raw_orders` columns (A–R): order_key, order_id, order_item_id, date, platform, business,
sku_platform, product_name, variation_name, master_sku, display_name, qty, revenue,
order_status, imported_at, source_file, import_id, alias_key.
`claims` columns: date, business, product_name, free_item, claim_value, is_damaged,
is_incomplete, is_wrong_item, note, master_sku, display_name, imported_at, import_id.
`product_aliases`: master_sku, display_name, business, platform, alias_product_name,
alias_variation, alias_key, created_at.

Conventions: **exclude cancelled orders** (`order_status` contains "ยกเลิก"/"cancel");
aggregate server-side and set `Cache-Control` s-maxage so we don't hit Sheets rate limits.

## Files

- `src/pages/`: `MonthlyDashboard.jsx` (sales by store, MoM, platform donut, trend),
  `Upload.jsx` (import orders), `ClaimView.jsx` (claims), `SalesView.jsx` +
  `PackingView.jsx` (**local-first / localStorage — not yet Sheets-backed**),
  `LinksHub.jsx`, `DevHub.jsx`.
- `src/components/KpiCard.jsx` — reusable KPI card (title, value, subtitle, icon, trend, isPositive).
- `api/`: `dashboard.js` (Executive daily view), `monthly.js` (monthly by store),
  `claims.js` (`?view=summary|monthly|sku|imports-list|import[DELETE]`),
  `claims-import.js` (POST parsed xlsx), `import-orders.js` (`?view=log` + POST: map →
  alias-match → dedup → route to `raw_orders_YYYY_MM` → log), plus `summary`, `sheet`,
  `append`, `overwrite`, `_lib/sheets.js`.

## Status & how to deploy

Local git initialized and committed (user `monalll13`). **NOT yet pushed to GitHub, NOT
yet deployed to Vercel** — both need the owner's auth. To deploy: push to a GitHub repo,
import on Vercel, set 3 env vars (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
`SHEET_ID`). See `README.md`. Real service-account key backup: `MONA\hide\sales-dashboard-497407-*.json`.

## Security

`.env` / `backend/.env` are gitignored and contain a real Google **private key** — never
commit secrets, always verify before `git add`. The Sheet is currently link-public
readable (owner should turn that off — the service account already has access). API
endpoints are currently open/no-auth.

## TODO / roadmap (agreed with owner)

1. **Push to GitHub + deploy to Vercel** (needs owner auth).
2. **Product-family grouping** — boss wants SKUs of the same product COMBINED (e.g. PY006 "2in1 M"
   + PY007 "2in1 L" → one product "ถุงเท้าเจล 2in1"). Build ONE reusable grouping util
   (strip size tokens like M/L/Size from display_name; allow a manual `product_group`
   override in `product_aliases` later). **Reused by BOTH** the claims-by-product view and
   the product dashboard — build it once.
3. **Claims redesign — cartoon/visual**, because the actual user (a manager) dislikes
   numbers/tables and distrusts data. Agreed direction: one auto-mood mascot per product
   (happy/neutral/sad face + traffic-light color by claim severity), plain-language speech,
   ONE number per card, and a **"ดูหลักฐาน"** button that drills into the real claim records
   (trust comes from being able to verify). Group by product-family (see #2), not per-SKU.
   Mockups were shown and approved in the originating chat.
4. **Dashboard IA** — split into "Dashboard ยอดขาย" (sales, likely the new home page,
   replacing Executive as landing) and "Dashboard สินค้า" (product performance: best sellers,
   trends, per-product using #2 grouping).
5. **Ads + TikTok channel data** — the owner's existing Google-Sheet dashboard shows Ad
   spend per store and TikTok GMV split by channel (Affiliate / Live / VDO). That data is
   **NOT in mona-ops-db** — ask the owner where it lives (separate sheet? manual entry?
   TikTok/Shopee ads export?) before building those charts.
6. Add auth to the open API; move Sales/Packing from localStorage to Sheets.

## Gotchas

- The preview screenshot tool often times out on chart-heavy (Recharts) pages — that's a
  tooling limitation, not an app bug. Verify via DOM/`preview_eval` + `preview_logs`.
- First `/api/dashboard` / `/api/monthly` call reads all raw_orders (~5–12s); `vercel.json`
  sets `maxDuration: 60`.
