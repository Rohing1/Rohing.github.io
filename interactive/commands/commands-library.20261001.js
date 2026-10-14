import { BUILTIN as CURATED } from 'catalog4bea.js?v=20261001';
import { ROWS, TLDR_COMMIT } from 'tldr-data.20261001.js';

export const CURATED_COUNT = CURATED.length;
export const COMMUNITY_COUNT = ROWS.length;

const community = ROWS.map(([id, path, command, title, safety, locale]) => {
  const cisco = path.includes('../../cisco-ios/index.html');
  return {
    id,
    platform: cisco ? 'Cisco IOS/IOS XE' : 'Linux',
    category: cisco ? '社区用法 · Cisco IOS' : path.includes('../../linux/index.html') ? '社区用法 · Linux 专属' : '社区用法 · 通用',
    command,
    title,
    safety,
    source: `https://github.com/tldr-pages/tldr/blob/${TLDR_COMMIT}/${path}`,
    note: '',
    origin: 'tldr',
    locale,
  };
});

export const BUILTIN = Object.freeze([...CURATED, ...community]);
