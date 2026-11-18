// SPDX-License-Identifier: GPL-3.0-only

const byId = id => document.getElementById(id);
const controls = Array.from(document.querySelectorAll('button, input'));
let checkedAccount;
let bound = false;
let bindingId;
let bindingReady = false;
let busy = false;

function status(message, isError = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('error', isError);
}

function accountStatus(id, name) {
  const element = byId(id);
  const connected = typeof name === 'string' && name.trim();
  element.textContent = connected ? name.trim() : '未登录';
  element.classList.toggle('connected', Boolean(connected));
  element.title = connected ? name.trim() : '';
}

function songStatus(signature, emptyText = '暂无最近播放') {
  const element = byId('song');
  element.textContent = signature ?? emptyText;
  element.classList.toggle('has-song', Boolean(signature));
}

function showResult(result) {
  const labels = {
    updated: '飞书已接受签名更新',
    unchanged: '与上次同步的签名相同',
    'no-song': '网易云没有最近播放记录',
    error: result.message,
  };
  const label = labels[result.status];
  if (label) status(label + (result.signature ? ' · ' + result.signature : '') + '。', result.status === 'error');
}

async function send(action, fields) {
  const response = await chrome.runtime.sendMessage({ action, ...fields });
  if (!response?.ok) throw new Error(response?.message || '扩展后台暂时无法连接。');
  return response.result;
}

function updateControls() {
  document.querySelector('main').setAttribute('aria-busy', String(busy));
  for (const control of controls) control.disabled = busy;
  for (const id of ['auto', 'syncTime', 'sync']) byId(id).disabled = busy || !bindingReady;
  byId('unbind').disabled = busy || !bound;
}

function showAccount(account) {
  checkedAccount = account;
  accountStatus('account', account.name);
  const matchesBinding = bound && account.id === bindingId;
  bindingReady = matchesBinding;
  if (matchesBinding) {
    byId('pairing').hidden = true;
    byId('check').textContent = '重新检查';
    status('当前登录：' + account.name + '。');
  } else {
    byId('current').textContent = bound
      ? '当前账号与已绑定账号不同；改绑后每日同步会关闭。'
      : '已核对当前 Chrome 登录账号';
    byId('bind').textContent = bound ? '改绑为此账号' : '绑定此账号';
    byId('pairing').hidden = false;
    status(bound ? '请确认是否改绑到当前账号。' : '确认这是你要同步的飞书账号。');
  }
  updateControls();
}

async function work(task) {
  if (busy) return;
  busy = true;
  updateControls();
  status('正在处理…');
  try {
    await task();
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    updateControls();
  }
}

byId('neteaseLogin').addEventListener('click', () => work(async () => {
  await send('neteaseLogin');
  status('请完成登录后重新打开插件，账号会自动检查。');
}));
byId('check').addEventListener('click', () => work(async () => {
  byId('pairing').hidden = true;
  showAccount(await send('check'));
}));
byId('bind').addEventListener('click', () => work(async () => {
  const result = await send('bind', { account: checkedAccount, replace: bound });
  bound = true;
  bindingId = result.accountId;
  bindingReady = true;
  accountStatus('account', result.name);
  byId('check').textContent = '重新检查';
  byId('bind').textContent = '绑定此账号';
  byId('pairing').hidden = true;
  if (!result.autoSync) byId('auto').checked = false;
  status(result.status === 'rebound' ? '已改绑；请重新开启每日同步。' : '已绑定，可点击立即同步。');
}));
byId('sync').addEventListener('click', () => work(async () => {
  const result = await send('sync');
  if (result.status === 'updated' || result.status === 'unchanged') {
    songStatus(result.signature);
  }
  showResult(result);
}));
byId('unbind').addEventListener('click', () => {
  byId('unbindConfirm').hidden = false;
  byId('unbind').setAttribute('aria-expanded', 'true');
  status('解除绑定不会修改飞书当前签名。');
  byId('cancelUnbind').focus();
});
byId('cancelUnbind').addEventListener('click', () => {
  byId('unbindConfirm').hidden = true;
  byId('unbind').setAttribute('aria-expanded', 'false');
  status('');
  byId('unbind').focus();
});
byId('confirmUnbind').addEventListener('click', () => work(async () => {
  await send('unbind');
  bound = false;
  bindingId = undefined;
  bindingReady = false;
  byId('auto').checked = false;
  byId('unbindConfirm').hidden = true;
  byId('unbind').setAttribute('aria-expanded', 'false');
  byId('check').textContent = '检查';
  if (checkedAccount) {
    accountStatus('account', checkedAccount.name);
    byId('current').textContent = '已核对当前 Chrome 登录账号';
    byId('bind').textContent = '绑定此账号';
    byId('pairing').hidden = false;
  } else {
    accountStatus('account');
    byId('pairing').hidden = true;
  }
  status('已解除绑定并关闭每日同步。');
}));
byId('auto').addEventListener('change', () => work(async () => {
  const enabled = byId('auto').checked;
  try {
    const time = byId('syncTime').value;
    await send('schedule', { enabled, time });
    status(enabled ? '已开启每日 ' + time + ' 同步。' : '已关闭每日同步。');
  } catch (error) {
    byId('auto').checked = !enabled;
    throw error;
  }
}));
byId('syncTime').addEventListener('change', () => work(async () => {
  const time = byId('syncTime').value;
  await send('schedule', { enabled: byId('auto').checked, time });
  status('每日同步时间已设为 ' + time + '。');
}));
work(async () => {
  const { binding, autoSync, syncTime, lastRun, neteaseAccount, checkedAccount: account, checkError } = await send('status');
  bound = Boolean(binding?.accountId);
  bindingId = binding?.accountId;
  bindingReady = bound;
  accountStatus('account', binding?.accountName);
  if (bound) byId('check').textContent = '重新检查';
  byId('auto').checked = autoSync;
  byId('syncTime').value = syncTime;
  status('');
  byId('song').textContent = '正在读取…';
  let neteaseReadError;
  try {
    const { account: currentNeteaseAccount, signature } = await send('preview');
    accountStatus('neteaseAccount', currentNeteaseAccount.name);
    byId('neteaseLogin').textContent = '更换账号';
    songStatus(signature);
  } catch (error) {
    accountStatus('neteaseAccount', neteaseAccount?.name);
    songStatus(null, neteaseAccount ? '暂时无法读取' : '登录后自动读取');
    if (neteaseAccount) neteaseReadError = '网易云状态暂时无法读取，请重新登录后再试。';
  }
  if (lastRun) showResult(lastRun);
  if (account) showAccount(account);
  if (neteaseReadError) status(neteaseReadError, true);
  if (checkError) status(checkError, true);
});
