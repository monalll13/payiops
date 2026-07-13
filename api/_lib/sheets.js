// Google Sheets helpers — ใช้โดย serverless functions ใน api/
// ต้องตั้ง env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID
import { google } from 'googleapis'

let client

function getClient() {
  if (!client) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim().replace(/^["']|["']$/g, ''),
        // Vercel เก็บ private key เป็น string บรรทัดเดียว ต้องแปลง \n กลับเป็น newline
        // + กัน paste ผิด: ตัดเครื่องหมายคำพูดที่เผลอก๊อปติดมาจาก .env
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    })
    client = google.sheets({ version: 'v4', auth })
  }
  return client
}

export async function downloadDriveFile(fileId) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim().replace(/^["']|["']$/g, ''),
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  return Buffer.from(res.data)
}

const sheetId = () => process.env.SHEET_ID

// metadata ของ spreadsheet (รายชื่อ tab ฯลฯ)
export async function getMeta() {
  const res = await getClient().spreadsheets.get({ spreadsheetId: sheetId() })
  return res.data
}

// อ่านหลาย range ใน API call เดียว
export async function batchGetValues(ranges) {
  const res = await getClient().spreadsheets.values.batchGet({
    spreadsheetId: sheetId(),
    ranges,
  })
  return res.data.valueRanges
}

// อ่านข้อมูลทั้ง sheet → array ของ object (header เป็น key)
export async function getSheet(sheetName) {
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A:Z`,
  })
  const [headers, ...rows] = res.data.values || []
  if (!headers) return []
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )
}

export async function getExternalSheet(spreadsheetId, range = 'A:Z') {
  const res = await getClient().spreadsheets.values.get({ spreadsheetId, range })
  return res.data.values || []
}

// เขียนต่อท้าย (append)
export async function appendRows(sheetName, rows) {
  await getClient().spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })
}

// เขียนทับทั้ง sheet (สำหรับ product_master)
export async function ensureSheet(sheetName, headers) {
  const meta = await getMeta()
  const exists = meta.sheets.some((s) => s.properties.title === sheetName)
  if (!exists) {
    await getClient().spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    })
  }

  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A1:Z1`,
  })
  const current = res.data.values?.[0] || []
  const missingHeader = headers.some((h, i) => current[i] !== h)
  if (!current.length || missingHeader) {
    await getClient().spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    })
  }
}

export async function overwriteSheet(sheetName, headers, rows) {
  await getClient().spreadsheets.values.clear({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A:Z`,
  })
  await getClient().spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  })
}
