// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSignature } from '../chrome/signature.mjs';

test('生成标准听歌签名', () => {
  assert.equal(
    formatSignature({ title: 'Summer Of Love', artist: '王菲' }),
    '🎵 Summer Of Love · 王菲',
  );
});

test('清理换行、制表符和多余空格', () => {
  assert.equal(
    formatSignature({ title: '  一首\n歌 ', artist: '甲\t/\u00a0乙' }),
    '🎵 一首 歌 · 甲 / 乙',
  );
});

test('拒绝缺少歌名或歌手的记录', () => {
  assert.throws(() => formatSignature({ title: '', artist: '歌手' }), /缺少可用/);
  assert.throws(() => formatSignature({ title: '歌名' }), /缺少可用/);
});
