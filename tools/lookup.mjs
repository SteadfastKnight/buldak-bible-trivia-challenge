// Quick CLI to look up a single verse (or range) in the cached VDCC text.
//
// Usage:
//   node tools/lookup.mjs <book> <chapter> [verseStart] [verseEnd]
//
// Examples:
//   node tools/lookup.mjs Geneza 1 1
//   node tools/lookup.mjs "1 Imparati" 6 9
//   node tools/lookup.mjs Iona 1 17
//   node tools/lookup.mjs Numeri 14 33 34

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RCCV_PATH = path.join(ROOT, '.bible/open-bibles/ron-rccv.usfx.xml');

if (!fs.existsSync(RCCV_PATH)) {
  console.error(`No Bible cache at ${RCCV_PATH}.`);
  console.error('Run: git clone --depth 1 https://github.com/seven1m/open-bibles .bible/open-bibles');
  process.exit(2);
}

const USFX_TO_ABBREV = {
  GEN: 'gn', EXO: 'ex', LEV: 'lv', NUM: 'nm', DEU: 'dt',
  JOS: 'js', JDG: 'jud', RUT: 'rt',
  '1SA': '1sm', '2SA': '2sm', '1KI': '1kgs', '2KI': '2kgs',
  '1CH': '1ch', '2CH': '2ch',
  EZR: 'ezr', NEH: 'ne', EST: 'et', JOB: 'job',
  PSA: 'ps', PRO: 'prv', ECC: 'ec', SNG: 'so',
  ISA: 'is', JER: 'jr', LAM: 'lm', EZK: 'ez', DAN: 'dn',
  HOS: 'ho', JOL: 'jl', AMO: 'am', OBA: 'ob', JON: 'jn',
  MIC: 'mi', NAM: 'na', HAB: 'hk', ZEP: 'zp', HAG: 'hg',
  ZEC: 'zc', MAL: 'ml',
  MAT: 'mt', MRK: 'mk', LUK: 'lk', JHN: 'jo', ACT: 'act',
  ROM: 'rm', '1CO': '1co', '2CO': '2co',
  GAL: 'gl', EPH: 'eph', PHP: 'ph', COL: 'cl',
  '1TH': '1ts', '2TH': '2ts', '1TI': '1tm', '2TI': '2tm',
  TIT: 'tt', PHM: 'phm', HEB: 'hb',
  JAS: 'jm', JAM: 'jm',
  '1PE': '1pe', '2PE': '2pe', '1JN': '1jo', '2JN': '2jo', '3JN': '3jo',
  JUD: 'jd', REV: 're',
};

const BOOKS = {
  'Geneza': 'gn', 'Genesa': 'gn', 'Exod': 'ex', 'Exodul': 'ex',
  'Levitic': 'lv', 'Leviticul': 'lv', 'Numeri': 'nm',
  'Deuteronom': 'dt', 'Iosua': 'js', 'Judecători': 'jud', 'Judecatori': 'jud',
  'Rut': 'rt', '1 Samuel': '1sm', '2 Samuel': '2sm',
  '1 Împărați': '1kgs', '2 Împărați': '2kgs',
  '1 Imparati': '1kgs', '2 Imparati': '2kgs',
  '1 Regi': '1kgs', '2 Regi': '2kgs',
  '1 Cronici': '1ch', '2 Cronici': '2ch',
  'Ezra': 'ezr', 'Neemia': 'ne', 'Estera': 'et', 'Iov': 'job',
  'Psalmi': 'ps', 'Proverbe': 'prv', 'Eclesiastul': 'ec',
  'Cântarea Cântărilor': 'so', 'Isaia': 'is', 'Ieremia': 'jr',
  'Plângeri': 'lm', 'Ezechiel': 'ez', 'Daniel': 'dn',
  'Osea': 'ho', 'Ioel': 'jl', 'Amos': 'am', 'Obadia': 'ob',
  'Iona': 'jn', 'Mica': 'mi', 'Naum': 'na', 'Habacuc': 'hk',
  'Țefania': 'zp', 'Tefania': 'zp', 'Hagai': 'hg', 'Zaharia': 'zc',
  'Maleahi': 'ml',
  'Matei': 'mt', 'Marcu': 'mk', 'Luca': 'lk', 'Ioan': 'jo',
  'Faptele Apostolilor': 'act', 'Fapte': 'act',
  'Romani': 'rm',
  '1 Corinteni': '1co', '2 Corinteni': '2co',
  'Galateni': 'gl', 'Efeseni': 'eph', 'Filipeni': 'ph', 'Coloseni': 'cl',
  '1 Tesaloniceni': '1ts', '2 Tesaloniceni': '2ts',
  '1 Timotei': '1tm', '2 Timotei': '2tm', 'Tit': 'tt', 'Filimon': 'phm',
  'Evrei': 'hb', 'Iacov': 'jm',
  '1 Petru': '1pe', '2 Petru': '2pe',
  '1 Ioan': '1jo', '2 Ioan': '2jo', '3 Ioan': '3jo',
  'Iuda': 'jd', 'Apocalipsa': 're',
};

function bookKey(name) {
  if (BOOKS[name]) return BOOKS[name];
  const stripped = name.replace(/î/g, 'â').normalize('NFD').replace(/\p{M}/gu, '');
  for (const [k, v] of Object.entries(BOOKS)) {
    const ks = k.replace(/î/g, 'â').normalize('NFD').replace(/\p{M}/gu, '');
    if (ks.toLowerCase() === stripped.toLowerCase()) return v;
  }
  return null;
}

const xml = fs.readFileSync(RCCV_PATH, 'utf8').replace(/^﻿/, '');
const BIBLE = {};
const bookRe = /<book id="([^"]+)">([\s\S]*?)<\/book>/g;
let m;
while ((m = bookRe.exec(xml)) !== null) {
  const abbrev = USFX_TO_ABBREV[m[1]];
  if (!abbrev) continue;
  const chapters = [];
  const chChunks = m[2].split(/<c id="(\d+)"\s*\/>/);
  for (let i = 1; i < chChunks.length; i += 2) {
    const chNum = parseInt(chChunks[i], 10);
    const vChunks = chChunks[i + 1].split(/<v id="(\d+)"\s*\/>/);
    const verses = [];
    for (let j = 1; j < vChunks.length; j += 2) {
      const vNum = parseInt(vChunks[j], 10);
      const vText = vChunks[j + 1]
        .replace(/<f>[\s\S]*?<\/f>/g, '')
        .replace(/<x>[\s\S]*?<\/x>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      while (verses.length < vNum) verses.push('');
      verses[vNum - 1] = vText;
    }
    while (chapters.length < chNum) chapters.push([]);
    chapters[chNum - 1] = verses;
  }
  BIBLE[abbrev] = chapters;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node tools/lookup.mjs <book> <chapter> [verseStart] [verseEnd]');
  console.error('Example: node tools/lookup.mjs "1 Imparati" 6 9');
  process.exit(2);
}
const book = args[0];
const ch = parseInt(args[1], 10);
const vs = args[2] ? parseInt(args[2], 10) : null;
const ve = args[3] ? parseInt(args[3], 10) : vs;

const abbrev = bookKey(book);
if (!abbrev) { console.error(`Unknown book: "${book}"`); process.exit(1); }
const chapter = BIBLE[abbrev]?.[ch - 1];
if (!chapter) { console.error(`No chapter ${ch} in ${book}`); process.exit(1); }

if (vs === null) {
  // Whole chapter
  chapter.forEach((t, i) => console.log(`${ch}:${i + 1}  ${t}`));
} else {
  for (let v = vs; v <= ve && v <= chapter.length; v++) {
    console.log(`${ch}:${v}  ${chapter[v - 1] || '[empty]'}`);
  }
}
