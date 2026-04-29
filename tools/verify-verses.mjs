// Audit each question in docs/trivia/*.md against the Cornilescu Bible.
//
// Sources (preferred → fallback):
//   1. RCCV / VDCC (Romanian Corrected Cornilescu Version, 2013) — modern
//      orthography matching the trivia. From https://github.com/seven1m/open-bibles
//      file `ron-rccv.usfx.xml` (USFX format).
//   2. Original 1924 Cornilescu — from https://github.com/thiagobodruk/bible
//      file `json/ro_cornilescu.json` (older orthography with "î" medially,
//      "sînt", "ş", etc.). Used as fallback.
//
// Run:
//   1. Clone sources once (see README under "Verse audit")
//   2. `node tools/verify-verses.mjs`
//   3. Read docs/verse-audit.md (gitignored)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RCCV_PATH = path.join(ROOT, '.bible/open-bibles/ron-rccv.usfx.xml');
const CORN1924_PATH = path.join(ROOT, '.bible/thiagobodruk/json/ro_cornilescu.json');
const TRIVIA_DIR = path.join(ROOT, 'docs/trivia');
const OUT = path.join(ROOT, 'docs/verse-audit.md');

// === Romanian book names → thiagobodruk abbrev codes ===
const BOOKS = {
  'Geneza': 'gn', 'Genesa': 'gn',
  'Exod': 'ex', 'Exodul': 'ex',
  'Levitic': 'lv', 'Leviticul': 'lv',
  'Numeri': 'nm',
  'Deuteronom': 'dt', 'Deuteronomul': 'dt',
  'Iosua': 'js',
  'Judecători': 'jud', 'Judecatori': 'jud',
  'Rut': 'rt',
  '1 Samuel': '1sm', '2 Samuel': '2sm',
  '1 Împărați': '1kgs', '2 Împărați': '2kgs',
  '1 Imparati': '1kgs', '2 Imparati': '2kgs',
  '1 Regi': '1kgs', '2 Regi': '2kgs',
  '3 Împărați': '1kgs', '4 Împărați': '2kgs',
  '1 Cronici': '1ch', '2 Cronici': '2ch',
  '1 Paralipomena': '1ch', '2 Paralipomena': '2ch',
  'Ezra': 'ezr',
  'Neemia': 'ne',
  'Estera': 'et',
  'Iov': 'job',
  'Psalmi': 'ps', 'Psalmii': 'ps', 'Psalmul': 'ps',
  'Proverbe': 'prv', 'Pildele lui Solomon': 'prv',
  'Eclesiastul': 'ec', 'Eclesiastului': 'ec',
  'Cântarea Cântărilor': 'so', 'Cantarea Cantarilor': 'so',
  'Isaia': 'is',
  'Ieremia': 'jr',
  'Plângeri': 'lm', 'Plangeri': 'lm', 'Plângerile lui Ieremia': 'lm',
  'Ezechiel': 'ez',
  'Daniel': 'dn',
  'Osea': 'ho',
  'Ioel': 'jl',
  'Amos': 'am',
  'Obadia': 'ob',
  'Iona': 'jn',
  'Mica': 'mi',
  'Naum': 'na',
  'Habacuc': 'hk',
  'Țefania': 'zp', 'Tefania': 'zp', 'Sofonie': 'zp',
  'Hagai': 'hg', 'Hagheu': 'hg',
  'Zaharia': 'zc',
  'Maleahi': 'ml',
  'Matei': 'mt',
  'Marcu': 'mk',
  'Luca': 'lk',
  'Ioan': 'jo',
  'Faptele Apostolilor': 'act', 'Fapte': 'act', 'Faptele': 'act',
  'Romani': 'rm',
  '1 Corinteni': '1co', '2 Corinteni': '2co',
  'Galateni': 'gl',
  'Efeseni': 'eph',
  'Filipeni': 'ph',
  'Coloseni': 'cl',
  '1 Tesaloniceni': '1ts', '2 Tesaloniceni': '2ts',
  '1 Timotei': '1tm', '2 Timotei': '2tm',
  'Tit': 'tt',
  'Filimon': 'phm',
  'Evrei': 'hb',
  'Iacov': 'jm',
  '1 Petru': '1pe', '2 Petru': '2pe',
  '1 Ioan': '1jo', '2 Ioan': '2jo', '3 Ioan': '3jo',
  'Iuda': 'jd',
  'Apocalipsa': 're',
};

// === Normalization ===
// 1953 → 1993 spelling reform: "sînt"→"sunt" (word change), "î"→"â" medially
// (Cornilescu uses 1953 orthography). Strip diacritics + all punctuation
// including dashes, apostrophes, smart quotes — Cornilescu uses "s'a"
// where modern uses "s-a". Result is letters/digits/spaces only.
function normalize(s) {
  if (!s) return '';
  return s
    .replace(/Sîntem/g, 'Suntem').replace(/sîntem/g, 'suntem')
    .replace(/Sînteți/g, 'Sunteți').replace(/sînteți/g, 'sunteți')
    .replace(/Sîntu/g, 'Suntu').replace(/sîntu/g, 'suntu')
    .replace(/Sînt/g, 'Sunt').replace(/sînt/g, 'sunt')
    .replace(/î/g, 'â').replace(/Î/g, 'Â')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function bookKey(rawBook) {
  if (BOOKS[rawBook]) return BOOKS[rawBook];
  const stripped = rawBook.replace(/î/g, 'â').replace(/Î/g, 'Â').normalize('NFD').replace(/\p{M}/gu, '');
  for (const [name, abbrev] of Object.entries(BOOKS)) {
    const ns = name.replace(/î/g, 'â').replace(/Î/g, 'Â').normalize('NFD').replace(/\p{M}/gu, '');
    if (ns === stripped) return abbrev;
  }
  return null;
}

// === Bible loading ===
// USFX → internal abbrev mapping
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

function loadUsfx(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const result = {};
  const bookRe = /<book id="([^"]+)">([\s\S]*?)<\/book>/g;
  let m;
  while ((m = bookRe.exec(xml)) !== null) {
    const usfxId = m[1];
    const abbrev = USFX_TO_ABBREV[usfxId];
    if (!abbrev) continue;
    const bookXml = m[2];
    const chapters = [];
    // Split at chapter markers: chunks = [preamble, chNum, chContent, chNum, chContent, ...]
    const chChunks = bookXml.split(/<c id="(\d+)"\s*\/>/);
    for (let i = 1; i < chChunks.length; i += 2) {
      const chNum = parseInt(chChunks[i], 10);
      const chContent = chChunks[i + 1];
      // Within chapter, split at verse markers
      const vChunks = chContent.split(/<v id="(\d+)"\s*\/>/);
      const verses = [];
      for (let j = 1; j < vChunks.length; j += 2) {
        const vNum = parseInt(vChunks[j], 10);
        let vText = vChunks[j + 1];
        // Strip footnotes / cross-references / any remaining tags
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

function loadJson(filePath) {
  const bibleRaw = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''));
  const result = {};
  for (const book of bibleRaw) result[book.abbrev] = book.chapters;
  return result;
}

let BIBLE, SOURCE_LABEL, SOURCE_NOTE;
if (fs.existsSync(RCCV_PATH)) {
  BIBLE = loadUsfx(RCCV_PATH);
  SOURCE_LABEL = 'RCCV / VDCC (Romanian Corrected Cornilescu Version, 2013)';
  SOURCE_NOTE = 'Modern orthography (â, ș, ț, sunt). From [seven1m/open-bibles](https://github.com/seven1m/open-bibles) — `ron-rccv.usfx.xml`.';
} else if (fs.existsSync(CORN1924_PATH)) {
  BIBLE = loadJson(CORN1924_PATH);
  SOURCE_LABEL = '1924 Cornilescu (original)';
  SOURCE_NOTE = 'Older orthography (ş, ţ, î medially, sînt, s\'a). From [thiagobodruk/bible](https://github.com/thiagobodruk/bible) — `json/ro_cornilescu.json`.';
} else {
  console.error('No Bible source found. Clone seven1m/open-bibles into .bible/open-bibles/.');
  process.exit(2);
}
console.log(`Source: ${SOURCE_LABEL}`);

function lookupSegments(abbrev, segments) {
  const chapters = BIBLE[abbrev];
  if (!chapters) return { error: 'book-not-found' };
  const parts = [];
  for (const seg of segments) {
    if (seg.chapter < 1 || seg.chapter > chapters.length) {
      return { error: `chapter-${seg.chapter}-out-of-range (book has ${chapters.length})` };
    }
    const chapter = chapters[seg.chapter - 1];
    if (seg.verseStart < 1 || seg.verseStart > chapter.length) {
      return { error: `verse-${seg.verseStart}-out-of-range (ch ${seg.chapter} has ${chapter.length})` };
    }
    for (let v = seg.verseStart; v <= seg.verseEnd && v <= chapter.length; v++) {
      parts.push(chapter[v - 1]);
    }
  }
  return { text: parts.join(' ') };
}

// === Reference parsing ===
const REF_PREFIXES = [
  /^începe cu\s+/i,
  /^se încheie cu\s+/i,
  /^vezi (și )?\s*/i,
  /^cf\.?\s+/i,
];

function parseRef(refText) {
  if (!refText) return null;
  let r = refText.trim();
  r = r.replace(/\s*\([^)]*\)\s*$/, '').trim();
  for (const re of REF_PREFIXES) r = r.replace(re, '').trim();
  r = r.replace(/[.;]+$/, '').trim();

  // Multi-chapter span like "Exod, capitolele 7-12" → not a verse-level ref
  if (/,\s*capitol(ele|ul)\s/i.test(r)) {
    return { skip: true, reason: 'multi-chapter span' };
  }

  // Split into segments: first must be "Book ch:vs[-ve]", subsequent can be
  // "vs[-ve]" (same chapter), "ch:vs[-ve]" (different chapter), or another book.
  const parts = r.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const firstM = parts[0].match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/);
  if (!firstM) return { error: 'unparseable', raw: r };
  const bookName = firstM[1].trim();
  const abbrev = bookKey(bookName);
  if (!abbrev) return { error: 'unknown-book', bookName, raw: r };

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
  return { book: bookName, abbrev, segments };
}

// === Quote comparison ===
// Buckets:
//   exact       — identical after normalize
//   contains    — quote is substring of verse
//   near        — ≥85% word overlap (edition spelling differences only)
//   partial     — 60-85% (worth eyeballing — likely paraphrase or wrong verse pointer)
//   mismatch    — <60% (very likely a wrong reference)
function compare(quote, verseText) {
  const nq = normalize(quote);
  const nv = normalize(verseText);
  if (!nq) return { verdict: 'skip-quote' };
  if (nv === nq) return { verdict: 'exact', score: 1 };
  if (nv.includes(nq)) return { verdict: 'contains', score: 1 };
  if (nq.includes(nv)) return { verdict: 'contains', score: 1, note: 'quote-superset' };
  const qWords = nq.split(/\s+/).filter((w) => w.length >= 3);
  const vWordSet = new Set(nv.split(/\s+/));
  const matched = qWords.filter((w) => vWordSet.has(w)).length;
  const ratio = qWords.length ? matched / qWords.length : 0;
  if (ratio >= 0.85) return { verdict: 'near', score: ratio };
  if (ratio >= 0.6) return { verdict: 'partial', score: ratio };
  return { verdict: 'mismatch', score: ratio };
}

// === Trivia file parser (mirrors tools/parse-trivia.mjs) ===
function parseTriviaFile(file, difficulty) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const blocks = text.split(/\n(?=### \d+\. )/).filter((b) => /^### \d+\. /m.test(b));
  return blocks.map((block) => {
    const headerMatch = block.match(/^### (\d+)\.\s*(.+?)\s*$/m);
    const number = parseInt(headerMatch[1], 10);
    const question = headerMatch[2].trim();
    const ansMatch = block.match(/\*\*R[ăa]spuns:\*\*\s*([\s\S]+?)(?=\n\*\*|\n###|\n*$)/);
    const answer = ansMatch ? ansMatch[1].trim() : '';
    const refMatch = block.match(/\*\*Referin[țt][ăa]:\*\*\s*([\s\S]+?)(?=\n\*\*|\n###|\n*$)/);
    let reference = '';
    let quote = '';
    if (refMatch) {
      const refText = refMatch[1].trim();
      const dashSplit = refText.split(/\s+—\s+/);
      reference = dashSplit[0].trim();
      if (dashSplit.length > 1) {
        const rest = dashSplit.slice(1).join(' — ');
        const qm = rest.match(/\*„([\s\S]+?)["”]\*/);
        if (qm) quote = qm[1].trim();
        else reference = refText;
      }
    }
    return { id: `${difficulty}-${number}`, number, question, answer, reference, quote };
  });
}

// === Main ===
const results = { easy: [], medium: [], hard: [] };
for (const diff of ['easy', 'medium', 'hard']) {
  const file = path.join(TRIVIA_DIR, `${diff}.md`);
  const questions = parseTriviaFile(file, diff);
  for (const q of questions) {
    const r = { ...q };
    if (!q.reference) {
      r.verdict = q.quote ? 'broken-ref' : 'no-ref';
      r.error = 'no reference field';
    } else {
      const ref = parseRef(q.reference);
      if (!ref) {
        r.verdict = 'skip-ref';
      } else if (ref.skip) {
        r.verdict = 'skip-ref';
        r.skipReason = ref.reason;
      } else if (ref.error) {
        r.verdict = 'broken-ref';
        r.error = ref.error + (ref.bookName ? `: "${ref.bookName}"` : '');
        r.parsedRef = ref;
      } else {
        const lookup = lookupSegments(ref.abbrev, ref.segments);
        r.parsedRef = ref;
        if (lookup.error) {
          r.verdict = 'broken-ref';
          r.error = lookup.error;
        } else {
          r.verseText = lookup.text;
          if (!q.quote) {
            r.verdict = 'ref-only';
          } else {
            const cmp = compare(q.quote, lookup.text);
            r.verdict = cmp.verdict;
            r.score = cmp.score;
          }
        }
      }
    }
    results[diff].push(r);
  }
}

// === Report ===
const VERDICT_LABEL = {
  'exact': '✓ exact',
  'contains': '~ contains',
  'near': '~ near (≥85% — edition spelling)',
  'partial': '⚠ partial',
  'mismatch': '✗ mismatch',
  'broken-ref': '✗ broken-ref',
  'skip-ref': '⚪ skip-ref',
  'ref-only': '⚪ ref-only (no quote)',
  'no-ref': '⚪ no reference',
};
const ISSUE_VERDICTS = new Set(['partial', 'mismatch', 'broken-ref']);
const SHOW_NEAR = process.argv.includes('--show-near');
if (SHOW_NEAR) ISSUE_VERDICTS.add('near');

let report = '# Verse Audit Report\n\n';
report += `_Generated_: ${new Date().toISOString()}\n\n`;
report += `_Source_: **${SOURCE_LABEL}**. ${SOURCE_NOTE}\n\n`;
report += 'Verdicts:\n';
report += '- `✓ exact` — identical after normalize.\n';
report += '- `~ contains` — quote is a substring of the verse. Fine.\n';
report += '- `~ near` — ≥85% word overlap. Edition-spelling differences only. **Not flagged below.**\n';
report += '- `⚠ partial` — 60–85% overlap. Worth eyeballing.\n';
report += '- `✗ mismatch` — <60% overlap. Very likely the reference is wrong.\n';
report += '- `✗ broken-ref` — book unknown, chapter/verse out of range, or unparseable.\n';
report += '- `⚪ skip-ref` / `⚪ ref-only` / `⚪ no reference` — non-specific or missing.\n\n';

const grandTotals = {};
for (const diff of ['easy', 'medium', 'hard']) {
  const arr = results[diff];
  const counts = {};
  for (const r of arr) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) grandTotals[k] = (grandTotals[k] || 0) + v;

  const summary = Object.entries(counts)
    .map(([v, n]) => `${VERDICT_LABEL[v] || v} ${n}`)
    .join(' · ');
  report += `## ${diff} — ${arr.length} questions\n\n${summary}\n\n`;

  const issues = arr.filter((r) => ISSUE_VERDICTS.has(r.verdict));
  if (issues.length === 0) {
    report += '_No issues._\n\n';
    continue;
  }
  for (const r of issues) {
    report += `### ${r.id} — ${VERDICT_LABEL[r.verdict] || r.verdict}\n\n`;
    report += `- **Reference (file):** \`${r.reference || '(none)'}\`\n`;
    if (r.parsedRef && !r.parsedRef.error && r.parsedRef.segments) {
      const segStr = r.parsedRef.segments
        .map((s) => `${s.chapter}:${s.verseStart}${s.verseEnd !== s.verseStart ? '-' + s.verseEnd : ''}`)
        .join(', ');
      report += `- **Parsed as:** ${r.parsedRef.book} ${segStr} (${r.parsedRef.abbrev})\n`;
    }
    if (r.error) report += `- **Error:** ${r.error}\n`;
    report += `- **Question:** ${r.question}\n`;
    report += `- **Answer (file):** ${r.answer}\n`;
    if (r.quote) report += `- **Quote (file):** „${r.quote}"\n`;
    if (r.verseText) report += `- **Verse (Cornilescu):** „${r.verseText}"\n`;
    if (typeof r.score === 'number') report += `- **Word-overlap score:** ${(r.score * 100).toFixed(0)}%\n`;
    report += '\n';
  }
}

report += '\n---\n\n## Grand totals\n\n';
for (const [k, v] of Object.entries(grandTotals)) {
  report += `- ${VERDICT_LABEL[k] || k}: **${v}**\n`;
}

fs.writeFileSync(OUT, report, 'utf8');

const issuesCount = (grandTotals.partial || 0) + (grandTotals.mismatch || 0) + (grandTotals['broken-ref'] || 0);
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
console.log('Totals:', grandTotals);
console.log(`Issues to review: ${issuesCount}`);
process.exit(issuesCount > 0 ? 1 : 0);
