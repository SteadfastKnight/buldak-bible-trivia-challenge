// One-shot tool: for every question in docs/trivia/*.md whose quote isn't a
// verbatim/substring match of VDCC, rewrite the quote to be strict VDCC text
// (modernized Unicode: ş→ș, ţ→ț).
//
// Strategy:
//   - No ellipsis in quote → replace whole quote with full VDCC verse text.
//   - Ellipsis present → split into segments, for each find the closest
//     matching span in VDCC by first/last word match, replace segment.
//
// Run: `node tools/fix-quotes.mjs` then re-run verify-verses.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RCCV_PATH = path.join(ROOT, '.bible/open-bibles/ron-rccv.usfx.xml');

// === Bible loading (subset of verify-verses.mjs) ===
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
  'Deuteronom': 'dt', 'Deuteronomul': 'dt', 'Iosua': 'js',
  'Judecători': 'jud', 'Judecatori': 'jud', 'Rut': 'rt',
  '1 Samuel': '1sm', '2 Samuel': '2sm',
  '1 Împărați': '1kgs', '2 Împărați': '2kgs',
  '1 Imparati': '1kgs', '2 Imparati': '2kgs',
  '1 Regi': '1kgs', '2 Regi': '2kgs',
  '1 Cronici': '1ch', '2 Cronici': '2ch',
  'Ezra': 'ezr', 'Neemia': 'ne', 'Estera': 'et', 'Iov': 'job',
  'Psalmi': 'ps', 'Psalmii': 'ps',
  'Proverbe': 'prv', 'Eclesiastul': 'ec',
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

function loadUsfx(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const result = {};
  const bookRe = /<book id="([^"]+)">([\s\S]*?)<\/book>/g;
  let m;
  while ((m = bookRe.exec(xml)) !== null) {
    const abbrev = USFX_TO_ABBREV[m[1]];
    if (!abbrev) continue;
    const bookXml = m[2];
    const chapters = [];
    const chChunks = bookXml.split(/<c id="(\d+)"\s*\/>/);
    for (let i = 1; i < chChunks.length; i += 2) {
      const chNum = parseInt(chChunks[i], 10);
      const chContent = chChunks[i + 1];
      const vChunks = chContent.split(/<v id="(\d+)"\s*\/>/);
      const verses = [];
      for (let j = 1; j < vChunks.length; j += 2) {
        const vNum = parseInt(vChunks[j], 10);
        let vText = vChunks[j + 1];
        vText = vText
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
    result[abbrev] = chapters;
  }
  return result;
}

const BIBLE = loadUsfx(RCCV_PATH);

function bookKey(rawBook) {
  if (BOOKS[rawBook]) return BOOKS[rawBook];
  const stripped = rawBook.replace(/î/g, 'â').replace(/Î/g, 'Â').normalize('NFD').replace(/\p{M}/gu, '');
  for (const [name, abbrev] of Object.entries(BOOKS)) {
    const ns = name.replace(/î/g, 'â').replace(/Î/g, 'Â').normalize('NFD').replace(/\p{M}/gu, '');
    if (ns === stripped) return abbrev;
  }
  return null;
}

function parseRef(refText) {
  if (!refText) return null;
  let r = refText.trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
  for (const re of [/^începe cu\s+/i, /^se încheie cu\s+/i, /^vezi (și )?\s*/i, /^cf\.?\s+/i]) {
    r = r.replace(re, '').trim();
  }
  r = r.replace(/[.;]+$/, '').trim();
  if (/,\s*capitol(ele|ul)\s/i.test(r)) return { skip: true };
  const parts = r.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const firstM = parts[0].match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/);
  if (!firstM) return null;
  const abbrev = bookKey(firstM[1].trim());
  if (!abbrev) return null;
  const segments = [{
    chapter: parseInt(firstM[2], 10),
    verseStart: parseInt(firstM[3], 10),
    verseEnd: firstM[4] ? parseInt(firstM[4], 10) : parseInt(firstM[3], 10),
  }];
  let lastChapter = segments[0].chapter;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    let mm;
    if ((mm = p.match(/^(\d+):(\d+)(?:[-–](\d+))?$/))) {
      lastChapter = parseInt(mm[1], 10);
      segments.push({
        chapter: lastChapter,
        verseStart: parseInt(mm[2], 10),
        verseEnd: mm[3] ? parseInt(mm[3], 10) : parseInt(mm[2], 10),
      });
    } else if ((mm = p.match(/^(\d+)(?:[-–](\d+))?$/))) {
      segments.push({
        chapter: lastChapter,
        verseStart: parseInt(mm[1], 10),
        verseEnd: mm[2] ? parseInt(mm[2], 10) : parseInt(mm[1], 10),
      });
    }
  }
  return { abbrev, segments };
}

function lookupSegments(abbrev, segments) {
  const chapters = BIBLE[abbrev];
  if (!chapters) return null;
  const parts = [];
  for (const seg of segments) {
    const chapter = chapters[seg.chapter - 1];
    if (!chapter) return null;
    for (let v = seg.verseStart; v <= seg.verseEnd && v <= chapter.length; v++) {
      parts.push(chapter[v - 1]);
    }
  }
  return parts.join(' ');
}

// === Modernization ===
// VDCC source uses ş/ţ/Ş/Ţ (cedilla). Trivia uses ș/ț/Ș/Ț (comma below).
// VDCC also uses „...” for inner direct speech inside verses; our markdown
// wrapper is `*„...”*` so we must rewrite VDCC's inner quotes to «...»
// (French guillemets) to avoid collision with the markdown wrapper.
function modernize(s) {
  return s
    .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț')
    .replace(/„/g, '«').replace(/”/g, '»')
    .replace(/“/g, '«')
    .replace(/\s+/g, ' ')
    .trim();
}

// === Ellipsis-aware quote replacement ===
function normForMatch(s) {
  return s
    .replace(/î/g, 'â').replace(/Î/g, 'Â')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSpan(triviaSeg, vdccText) {
  const trWords = normForMatch(triviaSeg).split(' ').filter(Boolean);
  if (trWords.length === 0) return null;
  const vdccTokens = vdccText.split(/\s+/);
  const vdccN = vdccTokens.map(normForMatch);

  // Find best starting position: prefer the first trivia-word match that has the
  // most consecutive trivia words following it.
  let bestStart = -1, bestStartScore = 0;
  for (let i = 0; i < vdccN.length; i++) {
    if (vdccN[i] !== trWords[0]) continue;
    let score = 0;
    for (let j = 0; j < Math.min(5, trWords.length) && i + j < vdccN.length; j++) {
      if (vdccN[i + j] === trWords[j]) score++;
      else break;
    }
    if (score > bestStartScore) { bestStart = i; bestStartScore = score; }
  }
  if (bestStart < 0) return null;

  // Find the end: search for the last trivia word, starting from a position
  // that's at most a few tokens past where it would be in trWords.length.
  const lastWord = trWords[trWords.length - 1];
  const searchEnd = Math.min(vdccN.length, bestStart + trWords.length + 5);
  let bestEnd = -1;
  for (let i = searchEnd - 1; i >= bestStart; i--) {
    if (vdccN[i] === lastWord) { bestEnd = i; break; }
  }
  if (bestEnd < 0) {
    bestEnd = Math.min(bestStart + trWords.length - 1, vdccN.length - 1);
  }
  return vdccTokens.slice(bestStart, bestEnd + 1).join(' ');
}

function buildReplacement(oldQuote, vdccTextRaw) {
  const vdccText = modernize(vdccTextRaw);
  const ellipsisRe = /\s*(?:\.{3,}|…)\s*/g;
  if (!ellipsisRe.test(oldQuote)) {
    return vdccText;
  }
  const segments = oldQuote.split(/\s*(?:\.{3,}|…)\s*/);
  const fixed = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    // Skip empty or punctuation-only segments (e.g. lone closing quotes left
    // over by trailing ellipsis like "...»").
    if (!/[A-Za-zĂÂÎȘȚăâîșțĂĂĂ]/u.test(trimmed)) continue;
    const span = findSpan(trimmed, vdccText);
    if (span) fixed.push(span);
    else fixed.push(trimmed);
  }
  return fixed.join('... ');
}

// === Strict normalize for "is current quote already exact/substring" check ===
function strictNorm(s) {
  return s
    .replace(/Sîntem/g, 'Suntem').replace(/sîntem/g, 'suntem')
    .replace(/Sînt/g, 'Sunt').replace(/sînt/g, 'sunt')
    .replace(/î/g, 'â').replace(/Î/g, 'Â')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

// === Walk + fix ===
let totalFixed = 0;
for (const diff of ['easy', 'medium', 'hard']) {
  const file = path.join(ROOT, 'docs/trivia', `${diff}.md`);
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  let fixedInFile = 0;

  // Match each question block's reference line and update the quote portion only.
  const refLineRe = /(\*\*Referin[țt][ăa]:\*\*\s*)([^\n]+)/g;
  text = text.replace(refLineRe, (full, prefix, refLine) => {
    // Split on " — *„...”* " to find the quote
    const quoteMatch = refLine.match(/^(.+?)\s+—\s+\*„([\s\S]+?)["”]\*(.*)$/);
    if (!quoteMatch) return full;
    const refPart = quoteMatch[1].trim();
    const oldQuote = quoteMatch[2];
    const trailing = quoteMatch[3] || '';

    const ref = parseRef(refPart);
    if (!ref || ref.skip) return full;
    const vdccText = lookupSegments(ref.abbrev, ref.segments);
    if (!vdccText) return full;

    const modernVdcc = modernize(vdccText);
    const oldNorm = strictNorm(oldQuote);
    const vdccNorm = strictNorm(modernVdcc);
    if (oldNorm === vdccNorm || vdccNorm.includes(oldNorm)) {
      return full; // already verbatim or substring — leave alone
    }

    const newQuote = buildReplacement(oldQuote, vdccText);
    if (newQuote === oldQuote) return full;

    fixedInFile++;
    return `${prefix}${refPart} — *„${newQuote}”*${trailing}`;
  });

  if (fixedInFile > 0) {
    fs.writeFileSync(file, text, 'utf8');
    console.log(`${diff}.md: rewrote ${fixedInFile} quotes`);
    totalFixed += fixedInFile;
  } else {
    console.log(`${diff}.md: no changes`);
  }
}

console.log(`\nTotal quotes rewritten: ${totalFixed}`);
