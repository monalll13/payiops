// /api/marketing?kind=events|inputs — รวม 2 endpoint การตลาดเดิม
// (/api/marketing-events และ /api/marketing-inputs) เป็นฟังก์ชันเดียว
// เพราะ Vercel Hobby จำกัด 12 serverless functions ต่อโปรเจค
// ตัว implementation จริงอยู่ใน api/_lib/marketingEvents.js / marketingInputs.js
// (แต่ละตัวมี requireAuth ของตัวเองอยู่แล้ว)
import eventsHandler from './_lib/marketingEvents.js'
import inputsHandler from './_lib/marketingInputs.js'

export default async function handler(req, res) {
  if (String(req.query.kind || 'events') === 'inputs') return inputsHandler(req, res)
  return eventsHandler(req, res)
}
