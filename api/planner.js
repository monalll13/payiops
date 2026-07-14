// GET/POST /api/planner — เก็บ Planner ใน Google Sheet เดิมของ mona-ops
import { requireAuth } from './_lib/auth.js'
import { ensureSheet, getSheet, overwriteSheet } from './_lib/sheets.js'

const CONFIG_SHEET = 'planner_config'
const DAILY_SHEET = 'planner_daily'
const CONFIG_HEADERS = ['master_sku', 'enabled', 'reserve_days', 'safety_percent', 'updated_at', 'updated_by']
const DAILY_HEADERS = ['id', 'date', 'master_sku', 'fg', 'sales_average', 'demand_mode', 'recommended_feed', 'planned_feed', 'feeders', 'updated_at', 'updated_by']
const text = (value) => String(value ?? '').trim()
const number = (value) => Math.max(0, Number(value) || 0)
const truthy = (value) => value === true || value === 1 || ['1', 'true', 'yes'].includes(String(value).toLowerCase())

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    // ทำตามลำดับเพื่อลดโอกาสชนกันตอนสร้างแท็บครั้งแรก
    await ensureSheet(CONFIG_SHEET, CONFIG_HEADERS)
    await ensureSheet(DAILY_SHEET, DAILY_HEADERS)

    if (req.method === 'GET') {
      const date = text(req.query.date).slice(0, 10)
      const [config, allDaily] = await Promise.all([getSheet(CONFIG_SHEET), getSheet(DAILY_SHEET)])
      const daily = date ? allDaily.filter((row) => row.date === date) : allDaily
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ success: true, config, daily })
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
    const body = req.body || {}
    if (body.action !== 'save-all') return res.status(400).json({ success: false, error: 'Unknown planner action' })

    const now = new Date().toISOString()
    const updatedBy = req.user?.name || text(body.updated_by) || 'Planner'
    const config = (Array.isArray(body.config) ? body.config : []).filter((row) => /^PY/i.test(text(row.master_sku))).map((row) => ({
      master_sku: text(row.master_sku).toUpperCase(),
      enabled: truthy(row.enabled) ? '1' : '0',
      reserve_days: number(row.reserve_days),
      safety_percent: number(row.safety_percent),
      updated_at: now,
      updated_by: updatedBy,
    }))
    const daily = (Array.isArray(body.daily) ? body.daily : []).filter((row) => row.date && /^PY/i.test(text(row.master_sku))).map((row) => ({
      id: `${text(row.date).slice(0, 10)}|${text(row.master_sku).toUpperCase()}`,
      date: text(row.date).slice(0, 10),
      master_sku: text(row.master_sku).toUpperCase(),
      fg: number(row.fg),
      sales_average: number(row.sales_average),
      demand_mode: ['normal', 'surge', 'promo'].includes(row.demand_mode) ? row.demand_mode : 'normal',
      recommended_feed: number(row.recommended_feed),
      planned_feed: number(row.planned_feed),
      feeders: [...new Set(Array.isArray(row.feeders) ? row.feeders.map(text).filter(Boolean) : [])].join(' · '),
      updated_at: now,
      updated_by: updatedBy,
    }))

    const saveDate = text(body.date).slice(0, 10)
    const currentDaily = await getSheet(DAILY_SHEET)
    const incomingKeys = new Set(daily.map((row) => row.id))
    const keptDaily = currentDaily.filter((row) => row.date !== saveDate && !incomingKeys.has(row.id))
    await overwriteSheet(CONFIG_SHEET, CONFIG_HEADERS, config.map((row) => CONFIG_HEADERS.map((header) => row[header] ?? '')))
    await overwriteSheet(DAILY_SHEET, DAILY_HEADERS, [...keptDaily, ...daily].map((row) => DAILY_HEADERS.map((header) => row[header] ?? '')))
    return res.status(200).json({ success: true, configSaved: config.length, dailySaved: daily.length, updatedAt: now, updatedBy })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
