import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessTab, canManageOperations, normalizeRole } from '../shared/roles.js'

test('legacy admin keeps full Dev access', () => {
  assert.equal(normalizeRole('admin'), 'dev')
  assert.equal(canAccessTab('admin', 'Settings'), true)
  assert.equal(canAccessTab('admin', 'Import Orders'), true)
})

test('Boss sees the app except Dev-only pages', () => {
  assert.equal(canAccessTab('boss', 'Executive'), true)
  assert.equal(canAccessTab('boss', 'Claims'), true)
  assert.equal(canAccessTab('boss', 'Import Orders'), false)
  assert.equal(canAccessTab('boss', 'Dev Hub'), false)
  assert.equal(canAccessTab('boss', 'Settings'), false)
  assert.equal(canManageOperations('boss'), true)
})

test('Staff sees only Tang operational pages', () => {
  for (const tab of ['Executive', 'Monthly', 'Products', 'ProductTrends', 'Planner Control', 'FeedProducts', 'Workforce OT', 'Claims']) {
    assert.equal(canAccessTab('staff', tab), true, tab)
  }
  for (const tab of ['Sales', 'MarketingRadar', 'HR', 'Import Orders', 'Dev Hub', 'Settings']) {
    assert.equal(canAccessTab('staff', tab), false, tab)
  }
  assert.equal(canManageOperations('staff'), false)
})
