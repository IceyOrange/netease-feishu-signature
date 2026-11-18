// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromeDir = join(root, 'chrome');
const manifest = JSON.parse(readFileSync(join(chromeDir, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, 'manifest_version 必须为 3');
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'version 必须使用三段式版本号');
assert(packageJson.version === manifest.version, 'package.json 与 manifest.json 版本不一致');
assert(packageJson.license === 'GPL-3.0-only', 'package.json 许可证必须为 GPL-3.0-only');
assert(manifest.minimum_chrome_version === '120', '最低 Chrome 版本应保持为 120');
assert(!manifest.host_permissions.includes('<all_urls>'), '不得请求 <all_urls>');
assert(readFileSync(join(root, 'LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE'), '缺少 GPL-3.0 正文');
assert(existsSync(join(root, 'NOTICE')), '缺少 NOTICE');
assert(existsSync(join(root, 'TRADEMARKS.md')), '缺少商标声明');

for (const [size, relativePath] of Object.entries(manifest.icons)) {
  const file = join(chromeDir, relativePath);
  assert(existsSync(file), `缺少图标：${relativePath}`);
  const png = readFileSync(file);
  assert(png.subarray(1, 4).toString() === 'PNG', `${relativePath} 不是 PNG`);
  assert(png.readUInt32BE(16) === Number(size), `${relativePath} 宽度不正确`);
  assert(png.readUInt32BE(20) === Number(size), `${relativePath} 高度不正确`);
}

for (const name of readdirSync(chromeDir).filter(name => name.endsWith('.mjs'))) {
  execFileSync(process.execPath, ['--check', join(chromeDir, name)], { stdio: 'pipe' });
}

const html = readFileSync(join(chromeDir, 'popup.html'), 'utf8');
for (const id of ['neteaseLogin', 'check', 'bind', 'syncTime', 'auto', 'sync', 'unbind', 'status']) {
  assert(html.includes(`id="${id}"`), `popup.html 缺少 #${id}`);
}

console.log(`验证通过：Chrome 扩展 ${manifest.version}`);
