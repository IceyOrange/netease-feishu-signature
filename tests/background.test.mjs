// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';

function storageArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      if (keys == null) return { ...data };
      if (typeof keys === 'string') return { [keys]: data[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, data[key]]));
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, data[key] ?? fallback]));
    },
    async set(values) { Object.assign(data, values); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
}

const local = storageArea();
const session = storageArea();
const alarms = new Map();
let onMessage;
let currentFeishu = { user_id: 'feishu-1', name: '示例一' };

globalThis.chrome = {
  storage: { local, session },
  alarms: {
    async clear(name) { return alarms.delete(name); },
    async get(name) { return alarms.get(name); },
    async create(name, info) { alarms.set(name, { name, ...info }); },
    onAlarm: { addListener() {} },
  },
  cookies: {
    async get() { return { value: 'test-session' }; },
    async getAll() {
      return [
        { name: 'MUSIC_U', value: 'test-music' },
        { name: '__csrf', value: 'test-csrf' },
      ];
    },
  },
  declarativeNetRequest: {
    async updateSessionRules() {},
  },
  tabs: { async create() { return { id: 1 }; } },
  runtime: {
    id: 'test-extension',
    getURL(path) { return `chrome-extension://test-extension/${path}`; },
    onMessage: { addListener(listener) { onMessage = listener; } },
    onStartup: { addListener() {} },
    onInstalled: { addListener() {} },
  },
};

globalThis.fetch = async (url, options = {}) => {
  if (url === 'https://login.feishu.cn/accounts/web/user') {
    return Response.json({ code: 0, data: { user: currentFeishu } });
  }
  if (url === 'https://internal-api-lark-api.feishu.cn/passport/users/details/' && options.method === 'PUT') {
    return Response.json({ code: 0 });
  }
  if (String(url).includes('/weapi/w/nuser/account/get')) {
    return Response.json({ code: 200, account: { id: 163 }, profile: { nickname: '网易云示例' } });
  }
  if (String(url).includes('/weapi/play-record/song/list')) {
    return Response.json({
      code: 200,
      data: { list: [{ playTime: 200, data: { name: '测试歌曲', ar: [{ name: '测试歌手' }] } }] },
    });
  }
  throw new Error(`未模拟的请求：${url}`);
};

await import('../chrome/background.mjs');

function send(action, fields = {}) {
  return new Promise((resolve, reject) => {
    const accepted = onMessage(
      { action, ...fields },
      { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
      response => response.ok ? resolve(response.result) : reject(new Error(response.message)),
    );
    if (!accepted) reject(new Error('后台没有接受测试消息'));
  });
}

test('绑定、定时、同步、改绑与解除绑定主链路', async () => {
  const checked = await send('check');
  assert.deepEqual(checked, { id: 'user_id:feishu-1', name: '示例一' });

  const bound = await send('bind', { account: checked });
  assert.equal(bound.status, 'bound');
  assert.equal(local.data.binding.accountId, checked.id);

  const scheduled = await send('schedule', { enabled: true, time: '09:30' });
  assert.equal(scheduled.autoSync, true);
  assert.ok(alarms.has('daily-hong-kong-sync'));

  const synced = await send('sync');
  assert.deepEqual(synced, { status: 'updated', signature: '🎵 测试歌曲 · 测试歌手' });
  assert.equal(local.data.binding.lastSyncedSignature, synced.signature);

  currentFeishu = { user_id: 'feishu-2', name: '示例二' };
  const nextAccount = await send('check');
  const rebound = await send('bind', { account: nextAccount, replace: true });
  assert.equal(rebound.status, 'rebound');
  assert.equal(rebound.autoSync, false);
  assert.equal(local.data.binding.accountId, 'user_id:feishu-2');
  assert.equal(local.data.autoSync, false);
  assert.equal(alarms.has('daily-hong-kong-sync'), false);

  const unbound = await send('unbind');
  assert.equal(unbound.status, 'unbound');
  assert.equal(local.data.binding, undefined);
  assert.equal(local.data.lastRun, undefined);
});
