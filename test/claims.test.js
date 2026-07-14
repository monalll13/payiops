import test from 'node:test'
import assert from 'node:assert/strict'
import { isoDate } from '../api/_lib/dates.js'
import { normalizeGroupLabel } from '../api/_lib/productGroup.js'
import { buildClaimAliasLookup, resolveClaimAlias } from '../api/_lib/claimMapping.js'

test('normalizes claim dates', () => {
  assert.equal(isoDate('28/6/2026'), '2026-06-28')
  assert.equal(isoDate('2026-6-8'), '2026-06-08')
  assert.equal(isoDate('46000'), '2025-12-09')
})

test('groups glued sizes without damaging English names', () => {
  assert.equal(normalizeGroupLabel('ถุงเท้าเจล 2in1M'), 'ถุงเท้าเจล 2in1')
  assert.equal(normalizeGroupLabel('Cream'), 'Cream')
})

test('maps exact product and variation and rejects ambiguous product-only aliases', () => {
  const lookup = buildClaimAliasLookup([
    { alias_product_name: 'ถุงเท้า', alias_variation: 'M', master_sku: 'A', display_name: 'ถุงเท้า M' },
    { alias_product_name: 'ถุงเท้า', alias_variation: 'L', master_sku: 'B', display_name: 'ถุงเท้า L' },
  ])
  assert.equal(resolveClaimAlias(lookup, 'ถุงเท้า', 'M').master_sku, 'A')
  assert.equal(resolveClaimAlias(lookup, 'ถุงเท้า'), null)
})

test('auto maps small name differences but rejects close ambiguous choices', () => {
  const clear = buildClaimAliasLookup([{ alias_product_name: 'ถุงเท้าเจลซัพพอร์ตส้นเท้า', master_sku: 'PY1', display_name: 'ถุงเท้าเจลซัพพอร์ตส้นเท้า' }])
  assert.equal(resolveClaimAlias(clear, 'ถุงเท้าเจล ซัพพอร์ตส้นเท้า').master_sku, 'PY1')
  const ambiguous = buildClaimAliasLookup([
    { alias_product_name: 'รองเท้าสีดำ', master_sku: 'A', display_name: 'รองเท้าสีดำ' },
    { alias_product_name: 'รองเท้าสีขาว', master_sku: 'B', display_name: 'รองเท้าสีขาว' },
  ])
  assert.equal(resolveClaimAlias(ambiguous, 'รองเท้าสี'), null)
})

test('prefers SKU mapping before product-name matching', () => {
  const lookup = buildClaimAliasLookup([{ master_sku: 'PY006', sku_platform: 'SHOP-006-M', alias_product_name: 'ชื่อในร้าน', display_name: 'ถุงเท้าเจล M' }])
  const match = resolveClaimAlias(lookup, 'ชื่อที่ไม่เหมือนเลย', '', 'SHOP-006-M')
  assert.equal(match.master_sku, 'PY006')
  assert.equal(match.match_method, 'sku')
})

test('maps short claim labels to dashboard display names', () => {
  const lookup = buildClaimAliasLookup([
    { master_sku: 'PY006', display_name: 'ถุงเท้าเจล 2in1 M' },
    { master_sku: 'PY007', display_name: 'ถุงเท้าเจล 2in1 L' },
    { master_sku: 'PY001', display_name: 'ถุงเท้าเจลส้น M' },
  ])
  assert.equal(resolveClaimAlias(lookup, 'ถุงเท้าเจลซัพพอร์ตเท้า รุ่น 2in1M').master_sku, 'PY006')
  assert.equal(resolveClaimAlias(lookup, 'ถุงเท้าเจลซัพพอร์ตส้นเท้าM').master_sku, 'PY001')
})
