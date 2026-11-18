// SPDX-License-Identifier: GPL-3.0-only

import { readFeishuAccount, writeFeishu } from './feishu.mjs';
import { openNeteaseLogin, readRecentSong } from './netease.mjs';
import { formatSignature } from './signature.mjs';
import {
  defaultSyncTime, hongKongTimeToday, nextHongKongTime, normalizeSyncTime,
} from './schedule.mjs';

const alarmName = 'daily-hong-kong-sync';
const legacyAlarmName = 'daily-10-hong-kong';
const store = chrome.storage.local;
let active;

async function ensureAlarm() {
  await chrome.alarms.clear(legacyAlarmName);
  const { autoSync, binding, syncTime = defaultSyncTime } =
    await store.get(['autoSync', 'binding', 'syncTime']);
  if (!autoSync || !binding) {
    await chrome.alarms.clear(alarmName);
  } else if (!await chrome.alarms.get(alarmName)) {
    await chrome.alarms.create(alarmName, { when: nextHongKongTime(syncTime) });
  }
}

async function catchUpAfterBrowserStart() {
  await ensureAlarm();
  const { autoSync, binding, syncTime = defaultSyncTime, lastRun } =
    await store.get(['autoSync', 'binding', 'syncTime', 'lastRun']);
  if (!autoSync || !binding) return;
  const now = Date.now();
  const scheduledToday = hongKongTimeToday(syncTime, now);
  if (now < scheduledToday || Number(lastRun?.at ?? 0) >= scheduledToday) return;
  if (active) await active.catch(() => {});
  await run('sync').catch(() => {});
}

async function readSongSnapshot() {
  const { account, song } = await readRecentSong();
  await store.set({ neteaseAccount: account });
  return { account, signature: song === null ? null : formatSignature(song) };
}

async function readSong() {
  return (await readSongSnapshot()).signature;
}

function requireAccount(profile, binding) {
  if (profile.id !== binding.accountId) throw new Error('当前飞书账号与已绑定账号不同。');
}

async function bind(account, replace = false) {
  const existing = (await store.get('binding')).binding;
  if (existing && !replace) throw new Error('扩展已绑定一个飞书账号，请先核对后再改绑。');
  const profile = await readFeishuAccount();
  if (profile.id !== account?.id || profile.name !== account?.name) {
    throw new Error('飞书账号已变化，请重新检查后再绑定。');
  }
  const sameAccount = existing?.accountId === profile.id;
  if (existing && !sameAccount) {
    await store.set({ autoSync: false });
    await chrome.alarms.clear(alarmName);
  }
  await store.set({ binding: {
    accountId: profile.id,
    accountName: profile.name,
    lastSyncedSignature: sameAccount ? existing.lastSyncedSignature ?? null : null,
  } });
  return {
    status: existing && !sameAccount ? 'rebound' : 'bound',
    name: profile.name,
    accountId: profile.id,
    autoSync: existing && !sameAccount ? false : Boolean((await store.get('autoSync')).autoSync),
  };
}

async function unbind() {
  await store.remove(['binding', 'autoSync', 'lastRun']);
  await chrome.alarms.clear(alarmName);
  return { status: 'unbound' };
}

async function sync(binding) {
  if (!binding) throw new Error('请先检查并绑定你的飞书账号。');
  const target = await readSong();
  if (target === null) return { status: 'no-song' };
  const profile = await readFeishuAccount();
  requireAccount(profile, binding);
  if (!binding.pending && target === binding.lastSyncedSignature) {
    return { status: 'unchanged', signature: target };
  }
  await store.set({ binding: { ...binding, pending: { target } } });
  await writeFeishu(target);
  const { pending, ...state } = binding;
  await store.set({ binding: { ...state, lastSyncedSignature: target } });
  return { status: 'updated', signature: target };
}

async function handle(action, message = {}) {
  const { binding, autoSync, syncTime = defaultSyncTime, lastRun, neteaseAccount } =
    await store.get(['binding', 'autoSync', 'syncTime', 'lastRun', 'neteaseAccount']);
  switch (action) {
    case 'status':
      return { name: binding?.accountName,
        binding: binding ? { accountId: binding.accountId, accountName: binding.accountName } : null,
        autoSync: Boolean(autoSync), syncTime, lastRun, neteaseAccount,
        ...(await chrome.storage.session.get(['checkedAccount', 'checkError'])) };
    case 'check': {
      await chrome.storage.session.set({ checkedAccount: null, checkError: null });
      try {
        const account = await readFeishuAccount();
        await chrome.storage.session.set({ checkedAccount: account });
        return account;
      } catch (error) {
        await chrome.storage.session.set({ checkError: error.message });
        throw error;
      }
    }
    case 'bind':
      return bind(message.account, message.replace === true);
    case 'unbind':
      return unbind();
    case 'preview':
      return readSongSnapshot();
    case 'neteaseLogin':
      await openNeteaseLogin();
      return { opened: true };
    case 'schedule':
      if (!binding || typeof message.enabled !== 'boolean') throw new Error('请先绑定你的飞书账号。');
      {
        const time = normalizeSyncTime(message.time);
        await store.set({ autoSync: message.enabled, syncTime: time });
        await chrome.alarms.clear(alarmName);
      }
      await ensureAlarm();
      return { autoSync: message.enabled, syncTime: normalizeSyncTime(message.time) };
    case 'sync':
      try {
        const result = await sync(binding);
        await store.set({ lastRun: { ...result, at: Date.now() } });
        return result;
      } catch (error) {
        await store.set({ lastRun: { status: 'error', message: error.message, at: Date.now() } });
        throw error;
      }
    default:
      throw new Error('无法识别该操作。');
  }
}

function run(action, message) {
  if (active) return Promise.reject(new Error('扩展正在处理一个请求，请稍后再试。'));
  active = handle(action, message).finally(() => { active = undefined; });
  return active;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  run(message?.action, message).then(
    result => reply({ ok: true, result }),
    error => reply({ ok: false, message: error.message }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== alarmName) return;
  const { autoSync, syncTime = defaultSyncTime } = await store.get(['autoSync', 'syncTime']);
  if (!autoSync) return;
  await chrome.alarms.create(alarmName, { when: nextHongKongTime(syncTime) });
  // A late alarm may arrive after sleep. Avoid a second run racing a manual operation.
  if (active) await active.catch(() => {});
  if ((await store.get('autoSync')).autoSync) await run('sync').catch(() => {});
});
chrome.runtime.onStartup.addListener(() => catchUpAfterBrowserStart().catch(console.error));
chrome.runtime.onInstalled.addListener(() => catchUpAfterBrowserStart().catch(console.error));
ensureAlarm().catch(console.error);
