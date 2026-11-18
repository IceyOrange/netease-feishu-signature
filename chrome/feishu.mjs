// SPDX-License-Identifier: GPL-3.0-only

const detailsUrl = 'https://internal-api-lark-api.feishu.cn/passport/users/details/';
const accountUrl = 'https://login.feishu.cn/accounts/web/user';
const requestRule = 1;

function accountId(profile) {
  for (const key of ['user_id', 'userId', 'id', 'uid', 'open_id']) {
    const value = profile?.[key];
    if (typeof value === 'string' && value.trim() && value !== '0') return key + ':' + value;
    if (Number.isSafeInteger(value) && value > 0) return key + ':' + value;
  }
  return null;
}

export async function readFeishuAccount() {
  const response = await fetch(accountUrl, {
    headers: { 'x-api-version': '1.0.28', 'x-app-id': '1', 'x-device-info': 'platform=websdk' },
    credentials: 'include', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5500),
  }).catch(() => null);
  if (!response?.ok) throw new Error('无法核对飞书账号，请在此 Chrome 中登录飞书网页版。');

  const body = await response.json().catch(() => null);
  const code = body?.code ?? body?.BaseResp?.StatusCode;
  const profile = body?.user ?? body?.data?.user ?? body?.data ?? body;
  const id = accountId(profile);
  const names = [profile?.name, profile?.cn_name, profile?.en_name, profile?.nick_name]
    .filter(value => typeof value === 'string' && value.trim());
  if (!id || !names.length || (code != null && code !== '0' && code !== 0)) {
    throw new Error('飞书未返回可核对的账号身份。');
  }

  const name = names[0].trim().replace(/[\r\n\t]+/g, ' ').slice(0, 80);
  return { id, name };
}

async function sessionCookie() {
  const cookie = await chrome.cookies.get({ url: detailsUrl, name: 'session' });
  if (!cookie?.value || !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/.test(cookie.value)) {
    throw new Error('当前 Chrome 中没有可用的飞书登录 Cookie。');
  }
  return cookie.value;
}

export async function writeFeishu(signature) {
  const session = await sessionCookie();
  const rules = chrome.declarativeNetRequest;
  await rules.updateSessionRules({ removeRuleIds: [requestRule] });
  await rules.updateSessionRules({
    addRules: [{
      id: requestRule,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'cookie', operation: 'set', value: 'session=' + session }],
      },
      condition: {
        urlFilter: '|' + detailsUrl + '|', initiatorDomains: [chrome.runtime.id],
        requestMethods: ['put'], resourceTypes: ['xmlhttprequest'],
      },
    }],
  });

  try {
    const response = await fetch(detailsUrl, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ description: signature, descriptionType: 0 }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response) throw new Error('无法连接飞书签名接口。');
    const body = await response.json().catch(() => null);
    const code = body?.code ?? body?.BaseResp?.StatusCode;
    const accepted = response.ok && body && (code == null || code === 0 || code === '0');
    if (!accepted) {
      const codeText = /^-?\d{1,12}$/.test(String(code)) ? '，飞书代码 ' + code : '';
      throw new Error('飞书更新签名失败（HTTP ' + response.status + codeText + '）。');
    }
    return { status: 'submitted' };
  } finally {
    await rules.updateSessionRules({ removeRuleIds: [requestRule] });
  }
}
