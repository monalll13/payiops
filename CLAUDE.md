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
  `ProductDashboard.jsx` (**product-family** dashboard: KPIs, best-sellers, monthly trend
  of top groups, product table + drawer with member-SKU breakdown — menu tab `Products`),
  `Upload.jsx` (import orders), `ClaimView.jsx` (claims), `SalesView.jsx` +
  `PackingView.jsx` (**local-first / localStorage — not yet Sheets-backed**),
  `LinksHub.jsx`, `DevHub.jsx`.
- `src/components/KpiCard.jsx` — reusable KPI card (title, value, subtitle, icon, trend, isPositive).
- `api/`: `dashboard.js` (Executive daily view), `monthly.js` (monthly by store),
  `products.js` (product-family aggregation for the product dashboard),
  `claims.js` (`?view=summary|monthly|sku|by-product|imports-list|import[DELETE]`),
  `claims-import.js` (POST parsed xlsx), `import-orders.js` (`?view=log` + POST: map →
  alias-match → dedup → route to `raw_orders_YYYY_MM` → log), plus `summary`, `sheet`,
  `append`, `overwrite`, `_lib/sheets.js`.
- `api/_lib/productGroup.js` — **the ONE reusable product-family grouping util** (TODO#2).
  `deriveGroup(displayName, masterSku, overrideMap)` → `{ key, label }`: strips size **and color**
  tokens that stand alone (space-separated) from display_name — sizes (M/L/XL, ไซส์/เบอร์/ขนาด X,
  trailing `(...)`) and colors (ดำ/ขาว/ฟ้า/… + English). Honors a manual `product_group` override
  column in `product_aliases` if present. Used by BOTH `products.js` and `claims.js?view=by-product`.
  Verified on real data: PY006 "2in1 M" + PY007 "2in1 L" → "ถุงเท้าเจล 2in1"; PY015–018
  "แผ่นรองเท้า M/L ดำ/ฟ้า" → one "แผ่นรองเท้า" (4 SKUs), while "แผ่นรองเท้า Heavy" stays separate.
  **Limitation:** colors glued to a word without a space (e.g. "สลิปเปอร์ฟ้า" vs "สลิปเปอร์ขาว")
  are NOT auto-stripped — use a `product_group` override for those.

## Status & how to deploy

Local git initialized and committed (user `monalll13`). **NOT yet pushed to GitHub, NOT
yet deployed to Vercel** — both need the owner's auth. To deploy: push to a GitHub repo,
import on Vercel, set 4 env vars (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
`SHEET_ID`, `API_TOKEN`). See `README.md`. Real service-account key backup: `MONA\hide\sales-dashboard-497407-*.json`.

## Security

`.env` / `backend/.env` are gitignored and contain a real Google **private key** — never
commit secrets, always verify before `git add`. The Sheet is currently link-public
readable (owner should turn that off — the service account already has access).

**API auth — per-user login (added 2026-07-06):** every `api/*.js` handler starts with
`if (!requireAuth(req, res)) return` (`api/_lib/auth.js`). Auth = HMAC-signed tokens
(no session store): users live in a `users` sheet tab (scrypt-hashed passwords), issued
by `api/auth.js` (`?action=status` / POST `login` / `setup` [first-run creates admin] /
`create-user` [admin only]). `api/auth.js` is deliberately NOT behind requireAuth.
**No `AUTH_SECRET` env set = auth disabled** (local-dev default; local `.env`
deliberately has none). On Vercel the owner MUST set `AUTH_SECRET`, otherwise
`/api/overwrite`, `/api/append` etc. let anyone wipe the Sheet. Frontend: `src/main.jsx`
wraps `window.fetch` (attaches localStorage `payi-api-token`, clears+reloads on 401) and
gates the app behind `src/pages/Login.jsx` when `status.enabled`. Logout = user chip
top-right. New endpoints must keep the `requireAuth` guard as the first handler line.

## TODO / roadmap (agreed with owner)

1. **Push to GitHub + deploy to Vercel** (needs owner auth).
2. ✅ **DONE — Product-family grouping** — built `api/_lib/productGroup.js` (auto-strip
   size tokens + optional `product_group` override in `product_aliases`). Reused by
   `products.js` and `claims.js?view=by-product`. Real data verified: 156 SKUs → 142 groups,
   auto-strips size + color (PY006/PY007 "2in1 M/L" merged; PY015–018 "แผ่นรองเท้า M/L ดำ/ฟ้า"
   → one group). Next step here = let owner add `product_group` overrides in the sheet for cases
   auto-strip can't catch (colors glued to the word, or totally different names for the same product).
3. **Claims redesign — cartoon/visual**, because the actual user (a manager) dislikes
   numbers/tables and distrusts data. Agreed direction: one auto-mood mascot per product
   (happy/neutral/sad face + traffic-light color by claim severity), plain-language speech,
   ONE number per card, and a **"ดูหลักฐาน"** button that drills into the real claim records
   (trust comes from being able to verify). Group by product-family (see #2), not per-SKU.
   Mockups were shown and approved in the originating chat.
   **Mobile manager mode — spec locked 2026-07-03. WORKING PROTOTYPE exists:**
   `src/pages/ManagerClaimsPrototype.jsx`, dummy data only, viewable at `/?manager`
   (wired in `src/main.jsx` — a URL switch, does NOT touch the desktop app). Decisions:
   - **Responsive, one app:** desktop = existing control-room (primary); mobile screen =
     this manager view (auto by width). If bundling ever makes the web heavy, acceptable to
     make the mobile view a separate externally-linked page instead (the `/?manager` entry
     already supports that).
   - **Claims-focused, NOT sales** — manager's job is claims. Home = claim summary
     (count + damage value) + "สินค้าที่ต้องดูแล" list sorted by **claim RATE %**
     (claims ÷ units sold), red/amber/green. Rate matters, not raw count (18 claims on
     70k units = green; 9 on 536 = red). Sales lives on a lower bottom-nav tab.
   - **Theme = TREASURE white/blue** (owner is a fan): light blue page, white cards,
     blue `#2F6FE0` accents, a diamond/4-point-star logo (TREASURE lightstick Ver.2 style,
     original SVG). All colors centralized in the `C` object at top of the prototype file.
   - **Mascot = "รุรุ / RuRu"** (original chibi, name blends Haruto + Ruka) as the claims
     reporter at the top; its expression = overall claim health. **Always speaks with ครับ.**
   - **NO claim photos** (decided — keeps it light). Button renamed **"ดูรายละเอียด"**
     (not "ดูหลักฐาน"); it expands text detail: common reasons + breakdown by claim type
     (เสีย/พัง, ส่งไม่ครบ, ส่งผิด).
   - ✅ **Wired to real data (2026-07-04):** new endpoint `api/manager-claims.js` joins
     claims (per group) with raw_orders units (per group) via the shared `deriveGroup`, so
     claim rate = claims ÷ units. RuRu mood + speech now auto from `alertCount`. Verified on
     real data: 486 claims / 61 groups. Also returns global claim-type totals
     (damaged/incomplete/wrong) + `monthly` counts → mobile view shows a "แยกตามประเภทเคลม"
     breakdown and a monthly-trend mini-bar, mirroring the desktop `ClaimView` KPIs
     (matches exactly: 141 / 132 / 208 = 29% / 27% / 43%).
   - **CRITICAL small-sample guard:** rate% on tiny volume is misleading (1 claim / 3 units =
     33% but meaningless). Endpoint requires `MIN_UNITS = 100` before a group can be red/amber;
     below that → level `low`, pushed to the bottom and shown only as a "+N รายการข้อมูลน้อย"
     footnote. This cut false alarms from 29 → 8 red. Thresholds live at the top of
     `manager-claims.js`: `RED = 1.0`, `AMBER = 0.2`, `MIN_UNITS = 100`.
   - Still open: **owner must confirm the 3 thresholds** (currently 8 red / 24 amber — feels
     reasonable but unconfirmed); period selector (all-time now); make "ดูรายละเอียด" drill to
     the actual claim records (date/note) later; wire the other bottom-nav tabs (สินค้า/ยอดขาย).
4. **Dashboard IA** — split into "Dashboard ยอดขาย" (sales, likely the new home page,
   replacing Executive as landing) and "Dashboard สินค้า" (product performance: best sellers,
   trends, per-product using #2 grouping). ✅ **"Dashboard สินค้า" DONE** = `ProductDashboard.jsx`
   / `Products` tab (best-sellers, top-8 monthly trend, product table + member-SKU drawer,
   business/platform filters). **Still pending:** the sales-side split + making it the landing page.
5. **Ads + TikTok channel data** — the owner's existing Google-Sheet dashboard shows Ad
   spend per store and TikTok GMV split by channel (Affiliate / Live / VDO). That data is
   **NOT in mona-ops-db** — ask the owner where it lives (separate sheet? manual entry?
   TikTok/Shopee ads export?) before building those charts.
6. ✅ **API auth DONE (2026-07-06) — per-user login** — see Security section
   (`api/_lib/auth.js` + `api/auth.js` + `src/pages/Login.jsx`; users in `users` sheet;
   enable by setting env `AUTH_SECRET` on Vercel at deploy; first open = create admin).
   Still pending: move Sales/Packing from localStorage to Sheets.

## Gotchas

- The preview screenshot tool often times out on chart-heavy (Recharts) pages — that's a
  tooling limitation, not an app bug. Verify via DOM/`preview_eval` + `preview_logs`.
- First `/api/dashboard` / `/api/monthly` / `/api/products` call reads all raw_orders
  (~5–12s); `vercel.json` sets `maxDuration: 60`.
- `vite.config.js` honors `process.env.PORT` (strictPort) so the preview harness can bind the
  dev server to its assigned port. Without a PORT env, dev picks 5173 as before.
