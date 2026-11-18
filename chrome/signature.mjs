// SPDX-License-Identifier: GPL-3.0-only

function cleanPart(value) {
  return typeof value === 'string' ? value.replace(/[\s\u00a0]+/gu, ' ').trim() : '';
}

export function formatSignature(song) {
  const title = cleanPart(song?.title);
  const artist = cleanPart(song?.artist);
  if (!title || !artist) throw new Error('最近播放记录缺少可用的歌名或歌手。');
  return `🎵 ${title} · ${artist}`;
}
