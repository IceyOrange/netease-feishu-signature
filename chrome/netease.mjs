// SPDX-License-Identifier: GPL-3.0-only

const musicOrigin = 'https://music.163.com';
const cookieRule = 2;
const nonce = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';
const publicExponent = 0x10001n;
const modulus = BigInt('0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7');
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const encoder = new TextEncoder();

function base64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function aes(text, key) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'AES-CBC' }, false, ['encrypt'],
  );
  return base64(await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: encoder.encode(iv) }, cryptoKey, encoder.encode(text),
  ));
}

function pow(base, exponent, divisor) {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) result = result * base % divisor;
    base = base * base % divisor;
    exponent >>= 1n;
  }
  return result;
}

function rsa(secret) {
  const hex = Array.from(secret).reverse()
    .map(character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return pow(BigInt('0x' + hex), publicExponent, modulus).toString(16).padStart(256, '0');
}

function randomSecret() {
  const random = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(random, value => alphabet[value % alphabet.length]).join('');
}

async function encrypted(data) {
  const secret = randomSecret();
  const first = await aes(JSON.stringify(data), nonce);
  return { params: await aes(first, secret), encSecKey: rsa(secret) };
}

async function musicCookies() {
  const [domainCookies, urlCookies] = await Promise.all([
    chrome.cookies.getAll({ domain: 'music.163.com' }),
    chrome.cookies.getAll({ url: musicOrigin + '/' }),
  ]);
  const values = new Map();
  for (const cookie of [...domainCookies, ...urlCookies]) {
    if (/^[!#$%&'*+.^_`|~\w-]+$/.test(cookie.name) &&
        /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(cookie.value)) {
      values.set(cookie.name, cookie.value);
    }
  }
  return {
    header: Array.from(values, ([name, value]) => name + '=' + value).join('; '),
    csrf: values.get('__csrf') ?? '',
  };
}

function apiError(label, result) {
  const code = result?.code ?? '未知';
  const detail = [result?.message, result?.msg]
    .find(value => typeof value === 'string' && value.trim())?.trim().slice(0, 80);
  return new Error(
    label + '失败（网易云代码 ' + code + (detail ? '：' + detail : '') + '）。',
  );
}

async function request(path, data, label) {
  const { header, csrf } = await musicCookies();
  const body = await encrypted({ ...data, csrf_token: csrf });
  const rules = chrome.declarativeNetRequest;
  await rules.updateSessionRules({ removeRuleIds: [cookieRule] });
  if (header) {
    await rules.updateSessionRules({
      addRules: [{
        id: cookieRule,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'cookie', operation: 'set', value: header }],
        },
        condition: {
          urlFilter: '||music.163.com/', initiatorDomains: [chrome.runtime.id],
          requestMethods: ['post'], resourceTypes: ['xmlhttprequest'],
        },
      }],
    });
  }
  try {
    let response;
    try {
      response = await fetch(musicOrigin + path + '?csrf_token=' + encodeURIComponent(csrf), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams(body),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? '请求超时' : '网络请求失败';
      throw new Error(label + '失败（' + reason + '）。');
    }
    if (!response.ok) throw new Error(label + '失败（HTTP ' + response.status + '）。');
    const result = await response.json().catch(() => null);
    if (!result || Number(result.code) === 301 || Number(result.code) === -460) {
      throw new Error('扩展未能识别网易云网页登录态，请在 music.163.com 页面确认已显示你的昵称后重试。');
    }
    if (Number(result.code) !== 200) throw apiError(label, result);
    return result;
  } finally {
    await rules.updateSessionRules({ removeRuleIds: [cookieRule] });
  }
}

export async function readNeteaseAccount() {
  const result = await request('/weapi/w/nuser/account/get', {}, '网易云账号读取');
  const id = result.account?.id ?? result.profile?.userId;
  const name = result.profile?.nickname;
  if (!id || typeof name !== 'string' || !name.trim()) {
    throw new Error('网易云音乐未返回可识别的账号。');
  }
  return { id: String(id), name: name.trim() };
}

export async function readRecentSong() {
  const account = await readNeteaseAccount();
  const result = await request('/weapi/play-record/song/list', { limit: 10 }, '网易云最近播放读取');
  const records = result.data?.list;
  if (!Array.isArray(records) || !records.length) return { account, song: null };
  const latest = records.reduce((current, item) =>
    Number(item?.playTime ?? 0) > Number(current?.playTime ?? 0) ? item : current, records[0]);
  const song = latest?.data ?? latest?.song ?? latest?.resource;
  const title = typeof song?.name === 'string' ? song.name.trim() : '';
  const artists = song?.ar ?? song?.artists;
  const artist = Array.isArray(artists)
    ? artists.map(item => typeof item?.name === 'string' ? item.name.trim() : '').filter(Boolean).join(' / ')
    : '';
  if (!title || !artist) throw new Error('网易云最近播放记录缺少歌名或歌手。');
  return { account, song: { title, artist } };
}

export function openNeteaseLogin() {
  return chrome.tabs.create({ url: musicOrigin + '/#/', active: true });
}
