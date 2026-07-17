// LINE Messaging API helper — push (แจ้งเตือนคำขอลาใหม่) + reply (ยืนยันหลังกดปุ่ม) + ตรวจลายเซ็น webhook
// ต้องตั้ง env LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET (ทั้งใน .env และบน Vercel)
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signatureHeader) return false
  try {
    const expect = createHmac('sha256', secret).update(rawBody || '').digest()
    const got = Buffer.from(String(signatureHeader), 'base64')
    return expect.length === got.length && timingSafeEqual(expect, got)
  } catch { return false }
}

async function callLineApi(path, body) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า' }
  try {
    const res = await fetch(`https://api.line.me${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, error: `LINE API ${res.status}: ${await res.text().catch(() => '')}` }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

export const pushMessage = (to, messages) => callLineApi('/v2/bot/message/push', { to, messages })
export const replyMessage = (replyToken, messages) => callLineApi('/v2/bot/message/reply', { replyToken, messages })
