# CLAUDE.md — PAYI Ops

Context for AI assistants working on this project. Read this first.

## What this is

**PAYI Ops** — workflow/analytics/ops hub for a Thai e-commerce business selling on
Shopee / TikTok Shop / Lazada. Owner speaks **Thai** (reply in Thai). Hard constraint:
**everything must be free-tier** (Vercel Hobby + GitHub + Google Sheets as the database —
no paid services, ever).

Rebuilt from scratch after the owner's old PC was wiped (2026-07-03); has since grown
well beyond the original sales-dashboard scope into HR/leave, workforce scheduling,
demand planning, marketing tracking, and a LINE bot.

## Stack & architecture

- **Frontend**: Vite + React 19 + Recharts + lucide-react. Plain CSS via `src/theme.css`
  (PAYI theme, CSS variables like `--payi-mint`, `--payi-surface`, `--payi-text-strong`).
- **`src/App.jsx`** is a **tab-based shell** (no router). Active tab in `localStorage`
  key `payi-active-tab`. Sidebar menu = `menuGroups` array; render is a big ternary on
  `activeTab`. To add a page: add a menu item + a ternary branch + the component.
- **Backend**: Vercel **serverless functions** in `api/*.js`, reading Google Sheets via a
  service account (`api/_lib/sheets.js`). Frontend calls **flat** `/api/<name>` endpoints
  (query params for sub-routing, e.g. `/api/claims?view=monthly`). No nested paths.
- **⚠️ Vercel Hobby caps 12 serverless functions — we are AT the cap (12/12 files in
  `api/`).** Any new feature (e.g. inventory/stock) MUST piggyback an existing file via
  a new query param + a new `api/_lib/*.js` impl — do NOT add a new `api/*.js` file
  without first retiring one. `sheet-tools.js` (`op=`) and `marketing.js` (`kind=`) are
  the established multiplexing pattern to copy.
- **File uploads parse xlsx CLIENT-SIDE** (via the `xlsx` dep) and POST JSON — never
  multipart. Deliberate so imports work on serverless.
- **Dev**: `npm run dev` runs Vite AND serves `/api/*` locally (middleware in
  `vite.config.js`). Requires root `.env`. `npm run build` to check compile.
- **Role-based access** (`shared/roles.js`): roles are `dev` / `boss` / `staff`
  (`admin` is a legacy alias, normalized to `dev`). `STAFF_TABS` whitelist gates what a
  `staff` login can see in the sidebar; `boss` sees everything except `Import Orders`,
  `Dev Hub`, `Settings`. Server-side guards mirror this: `requireAuth` (any logged-in
  user), `requireDev` (dev only — used by `import-orders.js`), `requireManager`
  (dev+boss — used by `manager-claims.js`, marketing endpoints).

## Data (Google Sheets: "mona-ops-db", SHEET_ID in .env)

**Sales/product tabs**: `raw_orders_2026_MM` (~190k order rows), `claims`,
`product_aliases`, `import_log`, `users`. Businesses: **Payi**, **Payi Outlet**,
**กรอบรูป**. Platforms: **Shopee**, **TikTok Shop**, **Lazada**.

`raw_orders` columns (A–R): order_key, order_id, order_item_id, date, platform, business,
sku_platform, product_name, variation_name, master_sku, display_name, qty, revenue,
order_status, imported_at, source_file, import_id, alias_key.
`claims` columns: date, business, product_name, free_item, claim_value, is_damaged,
is_incomplete, is_wrong_item, note, master_sku, display_name, imported_at, import_id,
**id, source_file** (appended later — never insert mid-schema, older rows are
column-position dependent; `id` backfilled lazily on first load for pre-existing rows).
`product_aliases`: master_sku, display_name, business, platform, alias_product_name,
alias_variation, alias_key, created_at (+ optional `product_group` override column).
`users`: scrypt-hashed passwords, `role` column (dev/boss/staff/admin-legacy).

**HR/workforce tabs** (auto-created via `ensureSheet`, all managed through
`api/sheet-tools.js?op=hr|workforce`): `hr_leave`, `hr_leave_backups`, `hr_leave_quota`,
`hr_leave_edits`, `hr_office_people`, `hr_line_links`, `hr_line_sessions`,
`workforce_people`, `workforce_ot`, `workforce_ot_approvals`, `workforce_ot_limits`,
`workforce_ot_approval_history`, `workforce_schedule_snapshot`,
`workforce_schedule_overrides`, `workforce_events`.

**Planner tabs** (`api/sheet-tools.js?op=planner`): `planner_config` (per-SKU feed
settings), `planner_daily` (daily FG/feed history).

**Marketing tabs** (`api/marketing.js`): `marketing_events` (action log + sales
snapshot), `marketing_inputs` (manual monthly Ads spend / TikTok channel split — not
derivable from `raw_orders`).

Conventions: **exclude cancelled orders** (`order_status` contains "ยกเลิก"/"cancel");
aggregate server-side and set `Cache-Control` s-maxage / in-memory cache
(`cacheable()`, since per-user auth forces `no-store` on the HTTP layer) so we don't hit
Sheets rate limits.

## Files

### Frontend — `src/pages/` (wired to real Sheets backend unless noted)
- `MonthlyDashboard.jsx` (sales by store, MoM, platform donut, trend — tab `Dashboard สรุปยอดขาย`)
- `ProductDashboard.jsx` + `ProductTrends.jsx` (product-family dashboard + MoM trends — tab `Dashboard สินค้า`)
- `Upload.jsx` → used inside `Import Orders` tab (import orders, dev-only)
- `ClaimView.jsx` (claims, desktop) / `ManagerClaimsPrototype.jsx` (claims, mobile manager view — real data since 2026-07-04, see roadmap below)
- `MarketingRadar.jsx` (marketing action log + event tracking)
- `AdsChannels.jsx` (manual Ads spend / TikTok channel entry + monthly sales overlay)
- `PlannerControl.jsx` + `FeedProducts.jsx` (demand planning: ABC, FG tracking, recommended feed)
- `WorkforceOT.jsx` (manpower & OT scheduling)
- `HR.jsx` / `HRMobile.jsx` (leave requests/approvals, LINE-bot-integrated)
- `LinksHub.jsx`, `DevHub.jsx` (static link/doc hubs — real content, no backend)
- `Login.jsx`, `Settings.jsx` (auth screens, user management)
- **`ContentOSPrototype.jsx`** ("Content OS Prototype") — **UI-only prototype, no API
  calls, no backend.** Not usable yet.
- **`PackingView.jsx`** — dead/unused; Packing was removed from the sidebar permanently
  (commit `fee17e7`). Do not wire it up without checking with the owner first.

**Removed (2026-07-21, owner decision):**
- **`SalesView.jsx`** ("Off-Platform Sales") — was localStorage-first, never migrated to
  Sheets. Deleted along with its sidebar entry, lazy import, and the `activeTab ===
  'Sales'` render branch/data-fetch trigger.
- **`AI Assistant` / "PAYI Brain" tab** — was NOT real AI (`buildReply()` was a hardcoded
  if/else returning canned Thai text, no LLM call). Deleted whole (`AIAssistantView`
  function, menu item, icon mapping, ternary branch) rather than keep a fake-AI page.
  If a real AI assistant is wanted later, per-user/per-role personalization IS feasible —
  scope the system prompt + visible data by the caller's role (`dev`/`boss`/`staff` from
  `shared/roles.js`), same pattern already used to gate sidebar tabs. Not built.

- **`Inventory.jsx`** + **`StockMovement.jsx`** (2026-07-21) — real stock tracking, Sheets-
  backed via `sheet-tools.js?op=inventory` (`_lib/inventory.js`). **Tracks at real SKU
  level (`sku`), NOT `deriveGroup` product-family** — M/L/color variants are physically
  separate stock, unlike the sales-analytics grouping used by Products/Claims/Dashboard.
  Modeled on the owner's existing manual Excel workflow (`Safety UP177` sheet = current
  balance + safety-stock/reorder status; monthly `เบิกของ<เดือน>`/`ของเข้า<เดือน>` sheets =
  day-by-day in/out log) but collapsed into one live system: `inventory_items` holds
  `opening_balance` per SKU, `stock_movements` is an append-only event log (type
  in/out/adjust, signed qty), and current balance = `opening_balance + Σmovements`,
  computed fresh on every request — never stored, so it can't drift the way the Excel's
  cross-sheet formula chain could. No auto-deduction from `raw_orders` yet (owner
  decision, 2026-07-21) — every movement is entered manually, matching current behavior.
  Packaging/consumables (the Excel's `Something` sheet — stickers, boxes) intentionally
  out of scope, phase 2. **Still open:** seed `inventory_items.opening_balance` from the
  owner's 96-row `Safety UP177` sheet — those rows only have product *names*, need
  matching to `master_sku` via `product_aliases` (same alias-matching pattern as claims
  import) before the real starting balances can be loaded; not done yet.

**`SOPs` menu item still has NO implementation** — falls through to the generic
"กำลังจัดเตรียมโครงสร้างคลังข้อมูล" placeholder in `App.jsx`. Real sidebar entry, zero
backing code. Lower priority (see TODO #9).

### Backend — `api/` (12/12 files, at the Vercel Hobby cap)
- `dashboard.js` — Executive daily view (`requireAuth`)
- `monthly.js` — monthly sales by store (`requireAuth`)
- `products.js` / `product-trends.js` — product-family aggregation + MoM trends (`requireAuth`)
- `claims.js` (`?view=summary|monthly|sku|by-product|imports-list|import[DELETE]`) (`requireAuth`)
- `claims-import.js` — POST parsed xlsx into `claims` (`requireAuth`)
- `import-orders.js` (`?view=log` + POST map→alias-match→dedup→route to `raw_orders_YYYY_MM` + log; DELETE by import batch) (`requireDev` — dev-only, this is the destructive one)
- `manager-claims.js` — mobile manager claim-rate view (`requireManager`)
- `planner-sales.js` — ABC classification + 90-day sales average, 6h in-memory cache (`requireAuth`)
- `marketing.js` (`?kind=events|inputs` — multiplexes `_lib/marketingEvents.js` / `_lib/marketingInputs.js`, each with its own `requireManager`)
- `sheet-tools.js` (`?op=summary|sheet|append|overwrite|workforce|planner|hr|inventory|line-webhook`) — the biggest file; HR, workforce/OT, planner CRUD, generic sheet tools, and the LINE webhook all live here to stay under the function cap. `line-webhook` op is unauthenticated (verified via LINE signature instead, see `_lib/line.js`). `op=inventory` (added 2026-07-21) delegates to `_lib/inventory.js` — not in the staff op-whitelist (`summary`/`workforce`/`planner`), so Inventory/Stock Movement are dev+boss only for now, same as it's currently absent from `STAFF_TABS`
- `auth.js` — login/setup/create-user/list-users/delete-user (deliberately NOT behind `requireAuth` — it IS the auth entrypoint)
- `_lib/`: `sheets.js` (Sheets client), `auth.js` (HMAC token issuing + guards), `productGroup.js` (see below), `inventory.js` (stock items + movements, see Files section above), `claimMapping.js` + `claimImport.js` + `claimsSchema.js` (claims import support), `marketingEvents.js` + `marketingInputs.js` (marketing impls), `dates.js` (date normalization), `line.js` (LINE Messaging API), `leaveCoverage.js` + `scheduleOverrides.js` (HR/workforce logic)
- `shared/roles.js` — role constants + tab access rules, imported by both frontend (`App.jsx`) and backend (`sheet-tools.js`)

`api/_lib/productGroup.js` — **the ONE reusable product-family grouping util.**
`deriveGroup(displayName, masterSku, overrideMap)` → `{ key, label }`: strips size **and
color** tokens that stand alone (space-separated) from display_name — sizes (M/L/XL,
ไซส์/เบอร์/ขนาด X, trailing `(...)`) and colors (ดำ/ขาว/ฟ้า/… + English). Honors a manual
`product_group` override column in `product_aliases` if present. Used by `products.js`,
`product-trends.js`, `claims.js?view=by-product`, `dashboard.js`, and
`manager-claims.js`. Verified on real data: PY006 "2in1 M" + PY007 "2in1 L" → "ถุงเท้าเจล
2in1"; PY015–018 "แผ่นรองเท้า M/L ดำ/ฟ้า" → one "แผ่นรองเท้า" (4 SKUs), while "แผ่นรองเท้า
Heavy" stays separate. **Limitation:** colors glued to a word without a space (e.g.
"สลิปเปอร์ฟ้า" vs "สลิปเปอร์ขาว") are NOT auto-stripped — use a `product_group` override.

## Status & how to deploy

Local git initialized and committed (user `monalll13`). Deploy status (push to GitHub /
Vercel, env vars) — verify current state with the owner, this drifts. See `README.md`.
Real service-account key backup: `MONA\hide\sales-dashboard-497407-*.json`.

## Security

`.env` / `backend/.env` are gitignored and contain a real Google **private key** — never
commit secrets, always verify before `git add`. The Sheet is currently link-public
readable (owner should turn that off — the service account already has access).

**API auth — per-user login:** every `api/*.js` handler starts with
`if (!requireAuth(req, res)) return` (or `requireDev`/`requireManager` for
role-restricted ones) — `api/_lib/auth.js`. Auth = HMAC-signed tokens (no session
store); users live in the `users` sheet tab (scrypt-hashed passwords), issued by
`api/auth.js` (`?action=status` / POST `login` / `setup` [first-run creates admin] /
`create-user` [admin/dev only]). `api/auth.js` is deliberately NOT behind `requireAuth`.
**No `AUTH_SECRET` env set = auth disabled** (local-dev default; local `.env`
deliberately has none). On Vercel the owner MUST set `AUTH_SECRET`, otherwise
write/delete endpoints let anyone touch the Sheet. Frontend: `src/main.jsx` wraps
`window.fetch` (attaches localStorage `payi-api-token`, clears+reloads on 401) and gates
the app behind `src/pages/Login.jsx` when `status.enabled`. Logout = user chip
top-right. New endpoints must keep an auth guard as the first handler line, and must
piggyback an existing `api/*.js` file (see function-cap note above) rather than adding
a new one.

## TODO / roadmap (agreed with owner)

1. Push to GitHub + deploy to Vercel (needs owner auth) — verify current status.
2. ✅ **DONE — Product-family grouping** (`api/_lib/productGroup.js`), reused across
   products/trends/claims/dashboard/manager-claims. Open item: owner can add
   `product_group` overrides in `product_aliases` for cases auto-strip can't catch
   (colors glued to the word, or totally different names for the same product).
3. ✅ **DONE — Claims mobile manager view** (`ManagerClaimsPrototype.jsx` +
   `api/manager-claims.js`, real data, claim rate = claims ÷ units via shared
   `deriveGroup`, RuRu mascot mood auto from alert count, small-sample guard
   `MIN_UNITS = 100`). Thresholds (`RED = 1.0`, `AMBER = 0.2`) still owner-unconfirmed.
   Open: period selector (currently all-time), drill-down to actual claim records.
4. ✅ **DONE — Dashboard IA split** — `Dashboard สรุปยอดขาย` (Executive/Monthly) and
   `Dashboard สินค้า` (Products/ProductTrends) are both live, separate top-level menu
   items.
5. **Ads + TikTok channel data** — ✅ has a home now (`AdsChannels.jsx` +
   `marketing_inputs` sheet, manual entry). Verify with owner whether manual entry is
   still acceptable long-term or should pull from a platform export.
6. ✅ **REMOVED (2026-07-21)** — Off-Platform Sales (`SalesView.jsx`) was
   localStorage-only and never migrated to Sheets. Owner decided to delete the page
   entirely rather than migrate it (page, menu item, fetch-trigger condition all
   removed). If off-platform sales tracking is wanted again later, build it fresh
   Sheets-backed from the start rather than reviving the old localStorage version.
7. ✅ **DONE (2026-07-21) — Inventory / Stock Movement**, first version.
   `Inventory.jsx` + `StockMovement.jsx` + `sheet-tools.js?op=inventory` (`_lib/inventory.js`,
   `inventory_items` + `stock_movements` sheets) — see Files section for full detail.
   **Correction from the original plan:** stock is keyed by real **SKU** (`sku` field),
   NOT `api/_lib/productGroup.js`'s `deriveGroup` family grouping — M/L/color variants
   are physically separate stock counts, unlike the sales-analytics rollup Products/Claims
   use. `deriveGroup` was the wrong tool here; don't reuse it for inventory quantities.
   Modeled on the owner's real Excel workflow (`Safety UP177` + monthly `เบิกของ`/`ของเข้า`
   sheets) — see Files section for the mapping. No auto-deduction from sales (owner
   decision). ✅ **Seeded with real opening balances (2026-07-21)** — 70 `inventory_items`
   rows, matched from the owner's `Safety UP177` list to `master_sku` via `product_aliases`
   (owner confirmed the ambiguous ones by hand — including one correction: เฝือกโป้ง is
   **PY050** ผ้ารัดหัวแม่เท้าเอียง, not PY033; PY033 is พยุงเท้า/Night Splint only). Notes
   for future edits:
   - Some items combine multiple color variants into one SKU's `opening_balance` because
     `master_sku` doesn't split by color: **PY066** (ถุงเท้าดับกลิ่น ดำ/ขาว/ฟ้า, sum),
     **PY073** (กันรองเท้ากัด/หลวม ดำ/เนื้อ, sum), **PY051** (a whole Sky/Ocean size×color
     line, sum). If the owner ever wants per-color stock visibility, these need splitting
     into their own SKUs first (same limitation `deriveGroup` already has for colors glued
     without a space).
   - **PY076** (แผ่นเจลฝ่า) and **ZZ004/ZZ005/ZZ006** (ไม้ดัดเท้า / สมุนไพรแช่เท้า /
     ถุงมือรองรีดผ้า) exist **only in `inventory_items`, NOT in `product_aliases`** — they
     won't show up on Products/Claims/Dashboard since those key off `product_aliases`.
     Add them there too if the owner ever needs sales-side reporting on these.
   - Decor/gift items from the pasted stock list (ถุงทอง, นกยูงเรซิ่น, เรือสำเภาทองเรซิ่น,
     ปลามังกรเรซิ่น, ม้าทองเรซิ่น, ต้นไทร, เรซิ่นกระทิง) were **deliberately excluded** —
     owner confirmed they belong to the กรอบรูป shop, out of scope here.
   - `safety_stock` is `0` for all 69 seeded items (no reorder-point data was provided) —
     owner should set real thresholds per item via the Inventory page's edit action.
8. ✅ **REMOVED (2026-07-21)** — "PAYI Brain" AI Assistant tab was fake (canned
   if/else replies, no LLM call). Owner decided to delete rather than keep a
   fake-AI page (`AIAssistantView` function, menu item, icon mapping, ternary branch
   all removed from `App.jsx`). **If revisited:** per-user/per-role AI IS feasible —
   scope the system prompt and visible data by the caller's role (`dev`/`boss`/`staff`,
   `shared/roles.js`), mirroring how sidebar tab visibility is already gated. Would need
   a real LLM API call (mind Vercel Hobby timeout + cost) — not built, no page exists
   to extend.
9. `SOPs` menu tab still has no implementation (same generic placeholder Inventory/Stock
   Movement used to hit) — lower priority, but flag if the owner asks about it.

## Gotchas

- The preview screenshot tool often times out on chart-heavy (Recharts) pages — that's a
  tooling limitation, not an app bug. Verify via DOM/`preview_eval` + `preview_logs`.
- First `/api/dashboard` / `/api/monthly` / `/api/products` call reads all raw_orders
  (~5–12s); `vercel.json` sets `maxDuration: 60`.
- `vite.config.js` honors `process.env.PORT` (strictPort) so the preview harness can bind the
  dev server to its assigned port. Without a PORT env, dev picks 5173 as before.
- `api/` is at the 12-function Hobby cap — check this section's "12/12" note before ever
  proposing a new `api/*.js` file.
