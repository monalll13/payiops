// สคีมาแท็บ "claims" — ใช้ร่วมกันทั้ง claims.js และ claims-import.js
// เพิ่ม id/source_file ต่อท้ายรายการเดิม (ห้ามแทรกกลาง — ข้อมูลเดิมยังอิงตำแหน่งคอลัมน์เดิมอยู่)
// id ใช้สำหรับแก้ไขแถวเดียวแบบเจาะจง (ดูรายละเอียด > แก้ไข) แถวเก่าที่ import ไว้ก่อนมี id จะถูก backfill ให้ตอนโหลดครั้งแรก
export const CLAIMS_HEADERS = [
  'date', 'business', 'product_name', 'free_item', 'claim_value',
  'is_damaged', 'is_incomplete', 'is_wrong_item', 'note',
  'master_sku', 'display_name', 'imported_at', 'import_id', 'source_file', 'id',
]
