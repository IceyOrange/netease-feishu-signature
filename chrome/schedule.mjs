// SPDX-License-Identifier: GPL-3.0-only

export const defaultSyncTime = '09:30';

export function normalizeSyncTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error('请选择有效的每日同步时间。');
  }
  return match[1] + ':' + match[2];
}

export function nextHongKongTime(value, now = Date.now()) {
  const today = hongKongTimeToday(value, now);
  const day = 86_400_000;
  return today > now ? today : today + day;
}

export function hongKongTimeToday(value, now = Date.now()) {
  const time = normalizeSyncTime(value);
  const [hour, minute] = time.split(':').map(Number);
  const day = 86_400_000;
  const hongKongOffset = 8 * 60 * 60 * 1000;
  const hongKongDayStart = Math.floor((now + hongKongOffset) / day) * day - hongKongOffset;
  return hongKongDayStart + (hour * 60 + minute) * 60_000;
}
