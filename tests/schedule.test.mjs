// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hongKongTimeToday, nextHongKongTime, normalizeSyncTime,
} from '../chrome/schedule.mjs';

test('规范化有效时间', () => {
  assert.equal(normalizeSyncTime('09:30'), '09:30');
  assert.equal(normalizeSyncTime('23:59'), '23:59');
});

test('拒绝无效时间', () => {
  for (const value of ['', '9:30', '24:00', '10:60', null]) {
    assert.throws(() => normalizeSyncTime(value), /有效的每日同步时间/);
  }
});

test('按香港时间计算当天和下一次同步', () => {
  const before = Date.parse('2026-11-18T00:00:00Z');
  const after = Date.parse('2026-11-18T02:00:00Z');
  const scheduled = Date.parse('2026-11-18T01:30:00Z');
  assert.equal(hongKongTimeToday('09:30', before), scheduled);
  assert.equal(nextHongKongTime('09:30', before), scheduled);
  assert.equal(nextHongKongTime('09:30', after), Date.parse('2026-11-19T01:30:00Z'));
});
