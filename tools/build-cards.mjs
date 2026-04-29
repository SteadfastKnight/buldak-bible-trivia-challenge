// Render docs/rules/cards.html → docs/rules/cards.pdf at A6 size.
//
// Strategy: launch Edge/Chrome headless with --remote-debugging-port,
// then call Page.printToPDF over CDP with explicit paperWidth/paperHeight.
// `--print-to-pdf` alone produces Letter regardless of CSS @page size;
// CDP is the only way to honor A6 from a Chromium browser.
//
// Requires: Microsoft Edge or Google Chrome installed. Node 22+ (built-in WebSocket).

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'docs/rules/cards.html');
const PDF  = path.join(ROOT, 'docs/rules/cards.pdf');

// A6 portrait: 105 × 148 mm in inches
const PAPER_W = 105 / 25.4;
const PAPER_H = 148 / 25.4;

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

async function findBrowser() {
  for (const p of BROWSERS) {
    try { await access(p); return p; } catch {}
  }
  throw new Error('No Edge or Chrome found. Install one and retry.');
}

async function waitForDebugger(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Browser debugger did not start.');
}

function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        if (m.error) reject(new Error(`${method}: ${m.error.message}`));
        else resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitForLoad(ws) {
  return new Promise(resolve => {
    const onMsg = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', onMsg);
        resolve();
      }
    };
    ws.addEventListener('message', onMsg);
  });
}

async function main() {
  const browser = await findBrowser();
  const port = 9222 + Math.floor(Math.random() * 1000);
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'cards-cdp-'));

  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let code = 0;
  try {
    await waitForDebugger(port);
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const tab = tabs.find(t => t.type === 'page') || tabs[0];

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));

    await send(ws, 1, 'Page.enable');
    const loaded = waitForLoad(ws);
    await send(ws, 2, 'Page.navigate', { url: `file:///${HTML.replace(/\\/g, '/')}` });
    await loaded;
    await new Promise(r => setTimeout(r, 300));

    const result = await send(ws, 3, 'Page.printToPDF', {
      paperWidth: PAPER_W,
      paperHeight: PAPER_H,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      printBackground: true,
    });

    await writeFile(PDF, Buffer.from(result.data, 'base64'));
    console.log(`Wrote ${PDF} (${PAPER_W.toFixed(2)}″ × ${PAPER_H.toFixed(2)}″ A6)`);
    ws.close();
  } catch (e) {
    code = 1;
    console.error(e.message);
  } finally {
    child.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    process.exit(code);
  }
}

main();
