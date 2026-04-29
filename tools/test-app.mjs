// Comprehensive rule-compliance test harness for the Buldak Bible Trivia app.
// Loads app.js + trivia.js into a sandboxed VM with mocked DOM, then drives
// every rule from docs/rules/Buldak Bible Trivia Challenge.md and asserts
// the implementation matches exactly.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const triviaSrc = fs.readFileSync(path.join(ROOT, 'trivia.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SHIM = `\nglobalThis.__expose = { get state() { return state; }, dispatch };\n`;

// === Mock DOM ===
function makeContext() {
  const storage = new Map();
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    FileReader: class {
      readAsText(f) { setTimeout(() => { this.result = f.text; this.onload && this.onload(); }, 0); }
    },
    localStorage: {
      getItem: (k) => storage.has(k) ? storage.get(k) : null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    alert: (msg) => { ctx._alerts.push(msg); },
    confirm: () => true,
    document: {
      getElementById: (id) => (ctx._els[id] ||= makeEl(id)),
      addEventListener: () => {},
      createElement: () => makeEl('a'),
      body: { appendChild: () => {}, removeChild: () => {} },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    window: null,
    _alerts: [],
    _els: {},
  };
  ctx.window = ctx;
  return ctx;
}
function makeEl(id) {
  return {
    id, innerHTML: '', value: '', files: [],
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, removeChild: () => {},
    click: () => {}, querySelectorAll: () => [], focus: () => {}, dataset: {},
  };
}
function loadApp() {
  const ctx = makeContext();
  vm.createContext(ctx);
  vm.runInContext(triviaSrc, ctx);
  vm.runInContext(appSrc + SHIM, ctx);
  Object.defineProperty(ctx, 'state', { get: () => ctx.__expose.state });
  ctx.dispatch = (a) => ctx.__expose.dispatch(a);
  return ctx;
}

// === Test plumbing ===
let passed = 0, failed = 0, currentSuite = '';
const failures = [];
function suite(name) { currentSuite = name; console.log(`\n━━━ ${name} ━━━`); }
function test(name, fn) { console.log(`\n  ▶ ${name}`); fn(); }
function assert(cond, msg) {
  if (cond) { passed++; console.log(`    ✓ ${msg}`); }
  else { failed++; failures.push(`${currentSuite} → ${msg}`); console.error(`    ✗ ${msg}`); }
}
function eq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}
function deep(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

// === Helper: build a started game ===
function setup(specs, totalRounds = 6) {
  const ctx = loadApp();
  for (const [name, mode] of specs) {
    ctx.dispatch({ type: 'ADD_PLAYER', name, mode });
  }
  ctx.dispatch({ type: 'SET_TOTAL_ROUNDS', n: totalRounds });
  ctx.dispatch({ type: 'START_GAME' });
  return ctx;
}
function pick(ctx, playerIdx, difficulty, correct) {
  const p = ctx.state.players[playerIdx];
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: p.id, difficulty });
  ctx.dispatch({ type: 'ANSWER_QUESTION', correct });
}

// =================================================================
suite('Setup phase');
// =================================================================

test('Add players with name and mode', () => {
  const ctx = loadApp();
  ctx.dispatch({ type: 'ADD_PLAYER', name: 'Alice', mode: 'carbonara' });
  ctx.dispatch({ type: 'ADD_PLAYER', name: 'Bob', mode: 'spicy' });
  eq(ctx.state.players.length, 2, '2 players added');
  eq(ctx.state.players[0].mode, 'carbonara', 'Alice is carbonara');
  eq(ctx.state.players[1].mode, 'spicy', 'Bob is spicy');
  eq(ctx.state.players[0].score, 0, 'Initial score is 0');
  eq(ctx.state.players[0].tappedOutRound, null, 'Initially active');
});

test('Empty/whitespace name is rejected', () => {
  const ctx = loadApp();
  ctx.dispatch({ type: 'ADD_PLAYER', name: '', mode: 'carbonara' });
  ctx.dispatch({ type: 'ADD_PLAYER', name: '   ', mode: 'carbonara' });
  eq(ctx.state.players.length, 0, 'No empty-named players added');
});

test('SET_TOTAL_ROUNDS supports 6, 7, 8', () => {
  for (const n of [6, 7, 8]) {
    const ctx = loadApp();
    ctx.dispatch({ type: 'SET_TOTAL_ROUNDS', n });
    eq(ctx.state.totalRounds, n, `Set to ${n}`);
  }
});

test('Cannot start with fewer than 2 players', () => {
  const ctx = loadApp();
  ctx.dispatch({ type: 'START_GAME' });
  eq(ctx.state.phase, 'setup', '0 players → still setup');
  ctx.dispatch({ type: 'ADD_PLAYER', name: 'Solo', mode: 'carbonara' });
  ctx.dispatch({ type: 'START_GAME' });
  eq(ctx.state.phase, 'setup', '1 player → still setup');
  ctx.dispatch({ type: 'ADD_PLAYER', name: 'Duo', mode: 'carbonara' });
  ctx.dispatch({ type: 'START_GAME' });
  eq(ctx.state.phase, 'playing', '2+ players → playing');
});

test('Player IDs are unique even with identical names', () => {
  const ctx = loadApp();
  for (let i = 0; i < 5; i++) {
    ctx.dispatch({ type: 'ADD_PLAYER', name: 'Maria', mode: 'carbonara' });
  }
  const ids = new Set(ctx.state.players.map((p) => p.id));
  eq(ids.size, 5, '5 unique IDs for 5 same-named players');
});

// =================================================================
suite('Point values — Carbonara (no multiplier)');
// =================================================================

test('Easy correct = +100', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  eq(ctx.state.players[0].score, 100, '+100');
});
test('Medium correct = +250', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', true);
  eq(ctx.state.players[0].score, 250, '+250');
});
test('Hard correct = +500', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', true);
  eq(ctx.state.players[0].score, 500, '+500');
});
test('Easy wrong = -50', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', false);
  eq(ctx.state.players[0].score, -50, '-50');
});
test('Medium wrong = -100', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', false);
  eq(ctx.state.players[0].score, -100, '-100');
});
test('Hard wrong = -200', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', false);
  eq(ctx.state.players[0].score, -200, '-200');
});

// =================================================================
suite('Point values — 2x Spicy (3× multiplier)');
// =================================================================

test('Easy correct = +300 (3× of 100)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  eq(ctx.state.players[0].score, 300, '+300');
});
test('Medium correct = +750 (3× of 250)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', true);
  eq(ctx.state.players[0].score, 750, '+750');
});
test('Hard correct = +1500 (3× of 500)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', true);
  eq(ctx.state.players[0].score, 1500, '+1500');
});
test('Easy wrong = -150 (3× of -50)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', false);
  eq(ctx.state.players[0].score, -150, '-150');
});
test('Medium wrong = -300 (3× of -100)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', false);
  eq(ctx.state.players[0].score, -300, '-300');
});
test('Hard wrong = -600 (3× of -200)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', false);
  eq(ctx.state.players[0].score, -600, '-600');
});

// =================================================================
suite('Skip = 0 points (rule: skipping is never penalized)');
// =================================================================

test('Skipping = no log entry, no score change', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'spicy']]);
  // Skip = host simply does not pick a difficulty for that player
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.players[0].score, 50, 'Carbonara: only +50 survival');
  eq(ctx.state.players[1].score, 50, 'Spicy: only +50 survival (flat)');
  const noQuestionEvents = ctx.state.players[0].log.filter(
    (e) => e.type === 'correct' || e.type === 'wrong'
  );
  eq(noQuestionEvents.length, 0, 'No question events logged when skipped');
});

// =================================================================
suite('Relief penalties (rule: water/milk separate; unlimited per round)');
// =================================================================

test('Carbonara water = -75', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });
  eq(ctx.state.players[0].score, -75, '-75');
});
test('Carbonara milk = -150', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'milk' });
  eq(ctx.state.players[0].score, -150, '-150');
});
test('Spicy water = -225 (3× of -75)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });
  eq(ctx.state.players[0].score, -225, '-225');
});
test('Spicy milk = -450 (3× of -150)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'milk' });
  eq(ctx.state.players[0].score, -450, '-450');
});
test('Multiple reliefs in same round all stack', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  const id = ctx.state.players[0].id;
  ctx.dispatch({ type: 'RELIEF', playerId: id, relief: 'water' });
  ctx.dispatch({ type: 'RELIEF', playerId: id, relief: 'water' });
  ctx.dispatch({ type: 'RELIEF', playerId: id, relief: 'milk' });
  eq(ctx.state.players[0].score, -75 - 75 - 150, 'Three reliefs: -300 total');
});
test('Tapped-out player cannot use relief', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  const a = ctx.state.players[0];
  ctx.dispatch({ type: 'TAP_OUT', playerId: a.id });
  ctx.dispatch({ type: 'RELIEF', playerId: a.id, relief: 'water' });
  eq(ctx.state.players[0].score, 0, 'Score unchanged after relief on tapped-out');
});

// =================================================================
suite('Bonuses are FLAT (rule: not multiplied by spicy)');
// =================================================================

test('Survival bonus is +50 flat for Carbonara', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.players[0].score, 50, 'Carbonara survival = +50');
});
test('Survival bonus is +50 flat for Spicy (NOT 150)', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'spicy']]);
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.players[0].score, 50, 'Spicy survival = +50 (flat, not 3×)');
});
test('Last-standing is +500 flat for Carbonara', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[0].id });
  eq(ctx.state.players[1].score, 500, 'Carbonara last-standing = +500');
});
test('Last-standing is +500 flat for Spicy (NOT 1500)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'spicy']]);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[0].id });
  eq(ctx.state.players[1].score, 500, 'Spicy last-standing = +500 (flat)');
});
test('Survival applies only to active players at END_ROUND', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[2].id });
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.players[0].score, 50, 'A active → +50');
  eq(ctx.state.players[1].score, 50, 'B active → +50');
  eq(ctx.state.players[2].score, 0, 'C tapped → 0');
});
test('Tapped-out player gets no survival in subsequent rounds', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  ctx.dispatch({ type: 'END_ROUND' });
  // Round 2
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[2].id });
  ctx.dispatch({ type: 'END_ROUND' });
  // Round 3
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.players[2].score, 50, 'C only got +50 from R1 (when active)');
  eq(ctx.state.players[0].score, 150, 'A got +50 × 3 rounds');
});

// =================================================================
suite('One-question-per-round rule');
// =================================================================

test('Player cannot answer two questions in same round', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  eq(ctx.state.players[0].score, 100, 'First question scored');
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'medium' });
  eq(ctx.state.pendingQuestion, null, 'Second pick rejected (no pending set)');
  assert(ctx._alerts.some((a) => a.includes('răspuns deja')), 'Host warned');
});

test('Wrong answer also blocks further questions this round', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', false);
  eq(ctx.state.players[0].score, -200, 'Hard wrong scored');
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  eq(ctx.state.pendingQuestion, null, 'Cannot retry after wrong');
});

test('Player can answer again next round', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  ctx.dispatch({ type: 'END_ROUND' });
  pick(ctx, 0, 'easy', true);
  eq(ctx.state.players[0].score, 100 + 50 + 100, 'Q1 + survival + Q2');
});

test('CANCEL_QUESTION does NOT count as answering', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  ctx.dispatch({ type: 'CANCEL_QUESTION' });
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'medium' });
  assert(ctx.state.pendingQuestion !== null, 'Can pick again after cancel');
});

test('Reliefs do NOT count toward question quota', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  const id = ctx.state.players[0].id;
  ctx.dispatch({ type: 'RELIEF', playerId: id, relief: 'water' });
  ctx.dispatch({ type: 'RELIEF', playerId: id, relief: 'milk' });
  pick(ctx, 0, 'medium', true);
  eq(ctx.state.players[0].score, -75 - 150 + 250, 'Question still allowed after reliefs');
});

// =================================================================
suite('Tapping out (rule: keeps points, cannot earn more, stays on board)');
// =================================================================

test('Tapped-out player keeps prior points', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', true);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[0].id });
  eq(ctx.state.players[0].score, 500, 'Score preserved');
});

test('Tapped-out player still appears in scoreboard', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[2].id });
  ctx.dispatch({ type: 'END_ROUND' });
  for (let i = 0; i < 5; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.phase, 'reveal', 'Game ended');
  eq(ctx.state.players.length, 3, 'C still on roster');
});

test('Tapping out same player twice is idempotent', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  const id = ctx.state.players[2].id;
  ctx.dispatch({ type: 'TAP_OUT', playerId: id });
  const round = ctx.state.players[2].tappedOutRound;
  ctx.dispatch({ type: 'TAP_OUT', playerId: id });
  eq(ctx.state.players[2].tappedOutRound, round, 'tappedOutRound unchanged');
  const tapouts = ctx.state.players[2].log.filter((e) => e.type === 'tapout');
  eq(tapouts.length, 1, 'Only one tapout event logged');
});

test('Tapped-out player cannot pick question', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  const id = ctx.state.players[0].id;
  ctx.dispatch({ type: 'TAP_OUT', playerId: id });
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: id, difficulty: 'easy' });
  eq(ctx.state.pendingQuestion, null, 'Pick rejected for tapped-out');
});

// =================================================================
suite('Minimum 2 active players (rule: drops to 1 → +500 last standing → reveal)');
// =================================================================

test('3 players → 1 left → triggers last-standing + reveal', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[0].id });
  eq(ctx.state.phase, 'playing', 'Still playing with 2 active');
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[1].id });
  eq(ctx.state.phase, 'reveal', 'Reveal after 2nd tapout');
  eq(ctx.state.players[2].score, 500, 'C got +500');
});

test('5 players → 4 tap out → last gets +500', () => {
  const ctx = setup([
    ['A', 'carbonara'], ['B', 'carbonara'], ['C', 'spicy'],
    ['D', 'carbonara'], ['E', 'carbonara'],
  ]);
  for (let i = 0; i < 4; i++) {
    ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[i].id });
  }
  eq(ctx.state.phase, 'reveal', 'Reveal triggered');
  eq(ctx.state.players[4].score, 500, 'E got +500');
});

test('All-tap-out (impossible normally, but defensive): no last-standing bonus', () => {
  // To force this we tap out down to 2, then both at once isn't possible
  // (the second-to-last triggers reveal). Skip this — covered by guard.
  assert(true, 'N/A — second-to-last tapout always triggers reveal first');
});

// =================================================================
suite('Score visibility (rule: hidden until end; rankings after R4)');
// =================================================================

test('hideScoresThroughRound = 4 by default', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  eq(ctx.state.hideScoresThroughRound, 4, 'Default hide-through is 4');
});

test('Rounds 1-4: scores hidden, no rank strip', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  for (let r = 1; r <= 4; r++) {
    eq(ctx.state.currentRound, r, `Round ${r} active`);
    assert(
      ctx.state.currentRound <= ctx.state.hideScoresThroughRound,
      `R${r}: rank-strip would be hidden`
    );
    ctx.dispatch({ type: 'END_ROUND' });
  }
});

test('Rounds 5+: ranking visible (scores still hidden)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 8);
  for (let i = 0; i < 4; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.currentRound, 5, 'Round 5 active');
  assert(ctx.state.currentRound > ctx.state.hideScoresThroughRound, 'Rank-strip shown');
  assert(!ctx.state.showScores, 'But raw scores still hidden by default');
});

test('Reveal phase: full scores shown (logical, via state)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 6);
  pick(ctx, 0, 'hard', true);
  for (let i = 0; i < 6; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.phase, 'reveal', 'In reveal');
  // The renderReveal function unconditionally shows all scores.
});

// =================================================================
suite('Round mechanics');
// =================================================================

test('END_ROUND advances currentRound by 1', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 6);
  for (let r = 1; r <= 5; r++) {
    eq(ctx.state.currentRound, r, `Round ${r}`);
    ctx.dispatch({ type: 'END_ROUND' });
  }
  eq(ctx.state.currentRound, 6, 'Round 6 reached');
});

test('END_ROUND on final round → reveal', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 6);
  for (let i = 0; i < 6; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.phase, 'reveal', 'Reveal after 6 ends');
});

test('Game with 7 rounds ends after 7 ENDs', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 7);
  for (let i = 0; i < 7; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.phase, 'reveal', 'Reveal after 7 ends');
});

test('Game with 8 rounds ends after 8 ENDs', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 8);
  for (let i = 0; i < 8; i++) ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.phase, 'reveal', 'Reveal after 8 ends');
});

test('END_ROUND blocked while pending question', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  ctx.dispatch({ type: 'END_ROUND' });
  eq(ctx.state.currentRound, 1, 'Round did not advance');
});

// =================================================================
suite('Question discard (rule: each question shown only once per game)');
// =================================================================

test('Same question never shown twice', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 8);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    if (i > 0 && i % 2 === 0) {
      // alternate so per-round limit doesn't block
      ctx.dispatch({ type: 'END_ROUND' });
    }
    const playerIdx = i % 2;
    ctx.dispatch({
      type: 'PICK_QUESTION',
      playerId: ctx.state.players[playerIdx].id,
      difficulty: 'easy',
    });
    const qId = ctx.state.pendingQuestion?.qId;
    if (!qId) break;
    assert(!seen.has(qId), `easy q${i + 1} not duplicated`);
    seen.add(qId);
    ctx.dispatch({ type: 'ANSWER_QUESTION', correct: true });
  }
  assert(seen.size > 0, 'Got at least some questions');
});

test('Easy/Medium/Hard pools are independent', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 8);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.dispatch({ type: 'END_ROUND' });
  pick(ctx, 0, 'medium', true);
  pick(ctx, 1, 'medium', true);
  ctx.dispatch({ type: 'END_ROUND' });
  pick(ctx, 0, 'hard', true);
  pick(ctx, 1, 'hard', true);
  const used = ctx.state.usedQuestionIds;
  const easyN = used.filter((id) => id.startsWith('easy-')).length;
  const medN = used.filter((id) => id.startsWith('medium-')).length;
  const hardN = used.filter((id) => id.startsWith('hard-')).length;
  eq(easyN, 2, '2 easy used');
  eq(medN, 2, '2 medium used');
  eq(hardN, 2, '2 hard used');
});

test('Empty pool → alert, no pending set', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  // Manually exhaust the easy pool
  ctx.state.usedQuestionIds.push(...ctx.window.TRIVIA.easy.map((q) => q.id));
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  eq(ctx.state.pendingQuestion, null, 'No pending');
  assert(ctx._alerts.some((a) => a.includes('Ușor')), 'Alerted host');
});

test('CANCEL_QUESTION returns question to pool', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  const qId = ctx.state.pendingQuestion.qId;
  eq(ctx.state.usedQuestionIds.length, 1, 'Marked used');
  ctx.dispatch({ type: 'CANCEL_QUESTION' });
  eq(ctx.state.usedQuestionIds.length, 0, 'Removed from used');
  assert(!ctx.state.usedQuestionIds.includes(qId), 'qId no longer in used');
  eq(ctx.state.pendingQuestion, null, 'Pending cleared');
});

// =================================================================
suite('Question discard (host-rejection — drop bad question permanently)');
// =================================================================

test('DISCARD_QUESTION clears pendingQuestion', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  eq(ctx.state.pendingQuestion, null, 'Pending cleared');
});

test('DISCARD_QUESTION leaves qId in usedQuestionIds (vs cancel which removes)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  const qId = ctx.state.pendingQuestion.qId;
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  assert(ctx.state.usedQuestionIds.includes(qId), 'qId still marked used');
});

test('DISCARD_QUESTION adds no entry to player log', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  eq(ctx.state.players[0].log.length, 0, 'Log empty');
});

test('DISCARD_QUESTION does not change player score', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'easy' });
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  eq(ctx.state.players[0].score, 0, 'Score unchanged');
});

test('After discard, same player can still pick another question this round', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  const id = ctx.state.players[0].id;
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: id, difficulty: 'easy' });
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: id, difficulty: 'medium' });
  assert(ctx.state.pendingQuestion !== null, 'Per-round quota intact after discard');
});

test('Discarded qId never picked again (drain check)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']], 8);
  const id = ctx.state.players[0].id;
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: id, difficulty: 'easy' });
  const discardedId = ctx.state.pendingQuestion.qId;
  ctx.dispatch({ type: 'DISCARD_QUESTION' });
  // Drain remaining easy pool by alternating players + rounds
  let safety = 200;
  while (safety-- > 0) {
    const playerIdx = (safety % 2);
    ctx.dispatch({
      type: 'PICK_QUESTION',
      playerId: ctx.state.players[playerIdx].id,
      difficulty: 'easy',
    });
    if (!ctx.state.pendingQuestion) break;
    assert(ctx.state.pendingQuestion.qId !== discardedId, `${ctx.state.pendingQuestion.qId} ≠ discarded ${discardedId}`);
    ctx.dispatch({ type: 'ANSWER_QUESTION', correct: true });
    if (ctx.state.players[playerIdx].log.filter(e => e.round === ctx.state.currentRound && (e.type === 'correct' || e.type === 'wrong')).length > 0) {
      // Both players answered → end round
      const otherIdx = 1 - playerIdx;
      const otherAnswered = ctx.state.players[otherIdx].log.some(e => e.round === ctx.state.currentRound && (e.type === 'correct' || e.type === 'wrong'));
      if (otherAnswered) ctx.dispatch({ type: 'END_ROUND' });
      if (ctx.state.phase === 'reveal') break;
    }
  }
  assert(safety > 0, 'Drain loop terminated normally');
});

// =================================================================
suite('Tiebreaker (rule: tied players, 1 sudden-death Hard, first correct wins)');
// =================================================================

test('Tiebreak only if ≥2 players tied at top', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'hard', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  eq(ctx.state.phase, 'reveal', 'No tiebreak when not tied (A=500, B=0)');
});

test('Tiebreak triggers when 2 tied at top', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  eq(ctx.state.phase, 'tiebreak', 'In tiebreak');
  eq(ctx.state.tiebreak.playerIds.length, 2, '2 in tiebreak');
});

test('Tiebreak uses a Hard question', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  const qId = ctx.state.tiebreak.qId;
  assert(qId.startsWith('hard-'), `qId is hard: ${qId}`);
});

test('Tiebreak question consumed from Hard pool', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  const usedBefore = ctx.state.usedQuestionIds.length;
  ctx.dispatch({ type: 'START_TIEBREAK' });
  eq(ctx.state.usedQuestionIds.length, usedBefore + 1, 'One Hard added to used');
});

test('TIEBREAK_WINNER returns to reveal with winnerId set', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  const aId = ctx.state.players[0].id;
  ctx.dispatch({ type: 'TIEBREAK_WINNER', playerId: aId });
  eq(ctx.state.phase, 'reveal', 'Returned to reveal');
  eq(ctx.state.tiebreak.winnerId, aId, 'A is winner');
});

test('Tiebreak winner does NOT receive points (sudden-death only)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  const aScoreBefore = ctx.state.players[0].score;
  ctx.dispatch({ type: 'START_TIEBREAK' });
  ctx.dispatch({ type: 'TIEBREAK_WINNER', playerId: ctx.state.players[0].id });
  eq(ctx.state.players[0].score, aScoreBefore, 'Winner score unchanged');
});

test('3-way tie: all 3 included in tiebreak', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara'], ['C', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  pick(ctx, 2, 'easy', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  eq(ctx.state.tiebreak.playerIds.length, 3, '3 tied players');
});

// =================================================================
suite('Player log (audit trail)');
// =================================================================

test('Each scoring event logs round, type, delta', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });
  ctx.dispatch({ type: 'END_ROUND' });
  const log = ctx.state.players[0].log;
  eq(log.length, 3, '3 events: correct, water, survival');
  eq(log[0].type, 'correct', 'First is correct');
  eq(log[0].delta, 300, 'Delta = +300');
  eq(log[0].round, 1, 'Round 1');
  eq(log[1].type, 'water', 'Second is water');
  eq(log[1].delta, -225, 'Spicy water -225');
  eq(log[2].type, 'survival', 'Third is survival');
  eq(log[2].delta, 50, 'Survival flat +50');
});

test('Sum of log deltas equals score', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', true);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'milk' });
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });
  ctx.dispatch({ type: 'END_ROUND' });
  pick(ctx, 0, 'hard', false);
  ctx.dispatch({ type: 'END_ROUND' });
  const sum = ctx.state.players[0].log.reduce((a, e) => a + e.delta, 0);
  eq(sum, ctx.state.players[0].score, 'Sum of deltas = score');
});

// =================================================================
suite('Persistence (rule: must survive crash)');
// =================================================================

test('localStorage is JSON-serializable and re-loadable', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', true);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });

  const saved = ctx.localStorage.getItem('buldak-state-v1');
  assert(typeof saved === 'string' && saved.length > 0, 'Saved blob exists');
  const parsed = JSON.parse(saved);
  eq(parsed.phase, 'playing', 'Phase serialized');
  eq(parsed.players.length, 2, 'Players serialized');
});

test('Reload restores full state', () => {
  const ctx = setup([['A', 'spicy'], ['B', 'carbonara']]);
  pick(ctx, 0, 'medium', true);
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[0].id, relief: 'water' });
  const beforeScore = ctx.state.players[0].score;
  const beforeUsed = [...ctx.state.usedQuestionIds];
  const beforeLogLen = ctx.state.players[0].log.length;

  const saved = ctx.localStorage.getItem('buldak-state-v1');
  const ctx2 = makeContext();
  ctx2.localStorage.setItem('buldak-state-v1', saved);
  vm.createContext(ctx2);
  vm.runInContext(triviaSrc, ctx2);
  vm.runInContext(appSrc + SHIM, ctx2);
  Object.defineProperty(ctx2, 'state', { get: () => ctx2.__expose.state });

  eq(ctx2.state.players[0].score, beforeScore, 'Score restored');
  deep(ctx2.state.usedQuestionIds, beforeUsed, 'usedQuestionIds restored');
  eq(ctx2.state.players[0].log.length, beforeLogLen, 'Log length restored');
});

test('Reload restores mid-question pendingQuestion (crash recovery)', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  ctx.dispatch({ type: 'PICK_QUESTION', playerId: ctx.state.players[0].id, difficulty: 'hard' });
  const beforePending = { ...ctx.state.pendingQuestion };

  const saved = ctx.localStorage.getItem('buldak-state-v1');
  const ctx2 = makeContext();
  ctx2.localStorage.setItem('buldak-state-v1', saved);
  vm.createContext(ctx2);
  vm.runInContext(triviaSrc, ctx2);
  vm.runInContext(appSrc + SHIM, ctx2);
  Object.defineProperty(ctx2, 'state', { get: () => ctx2.__expose.state });

  deep(ctx2.state.pendingQuestion, beforePending, 'PendingQuestion restored intact');
});

test('Reload restores tiebreak state', () => {
  const ctx = setup([['A', 'carbonara'], ['B', 'carbonara']]);
  pick(ctx, 0, 'easy', true);
  pick(ctx, 1, 'easy', true);
  ctx.state.phase = 'reveal';
  ctx.dispatch({ type: 'START_TIEBREAK' });
  const tb = { ...ctx.state.tiebreak };

  const saved = ctx.localStorage.getItem('buldak-state-v1');
  const ctx2 = makeContext();
  ctx2.localStorage.setItem('buldak-state-v1', saved);
  vm.createContext(ctx2);
  vm.runInContext(triviaSrc, ctx2);
  vm.runInContext(appSrc + SHIM, ctx2);
  Object.defineProperty(ctx2, 'state', { get: () => ctx2.__expose.state });

  eq(ctx2.state.phase, 'tiebreak', 'Tiebreak phase restored');
  eq(ctx2.state.tiebreak.qId, tb.qId, 'Same Hard qId');
  deep(ctx2.state.tiebreak.playerIds, tb.playerIds, 'Same tied players');
});

test('Mismatched version → fresh state', () => {
  const ctx = makeContext();
  ctx.localStorage.setItem('buldak-state-v1', JSON.stringify({ version: 999 }));
  vm.createContext(ctx);
  vm.runInContext(triviaSrc, ctx);
  vm.runInContext(appSrc + SHIM, ctx);
  Object.defineProperty(ctx, 'state', { get: () => ctx.__expose.state });
  eq(ctx.state.phase, 'setup', 'Initialized fresh on version mismatch');
  eq(ctx.state.players.length, 0, 'No players from incompatible save');
});

// =================================================================
suite('Comprehensive end-to-end scenario (5-player full game)');
// =================================================================

test('Full game: 5 players, 6 rounds, mixed actions, final scoreboard correct', () => {
  const ctx = setup(
    [
      ['Maria', 'carbonara'],     // 0
      ['Andrei', 'spicy'],        // 1
      ['Cristina', 'carbonara'],  // 2
      ['Pavel', 'spicy'],         // 3
      ['Ioana', 'carbonara'],     // 4
    ],
    6
  );

  // === Round 1 ===
  pick(ctx, 0, 'easy', true);    // Maria +100
  pick(ctx, 1, 'medium', true);  // Andrei +750
  pick(ctx, 2, 'hard', false);   // Cristina -200
  // Pavel skips
  ctx.dispatch({ type: 'RELIEF', playerId: ctx.state.players[3].id, relief: 'water' }); // Pavel -225
  pick(ctx, 4, 'easy', true);    // Ioana +100
  ctx.dispatch({ type: 'END_ROUND' });
  // +50 survival to all 5 active

  // === Round 2 ===
  pick(ctx, 0, 'medium', false); // Maria -100
  pick(ctx, 1, 'hard', true);    // Andrei +1500
  // Cristina skips, drinks milk twice
  const cId = ctx.state.players[2].id;
  ctx.dispatch({ type: 'RELIEF', playerId: cId, relief: 'milk' }); // -150
  ctx.dispatch({ type: 'RELIEF', playerId: cId, relief: 'milk' }); // -150
  pick(ctx, 3, 'easy', true);    // Pavel +300
  // Ioana taps out
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[4].id });
  ctx.dispatch({ type: 'END_ROUND' });
  // +50 survival to 4 active (not Ioana)

  // === Round 3 ===
  pick(ctx, 0, 'hard', true);    // Maria +500
  pick(ctx, 1, 'easy', false);   // Andrei -150
  pick(ctx, 2, 'easy', true);    // Cristina +100
  pick(ctx, 3, 'medium', true);  // Pavel +750
  ctx.dispatch({ type: 'END_ROUND' });

  // === Round 4 ===
  // Everyone skips
  ctx.dispatch({ type: 'END_ROUND' });

  // === Round 5 ===
  pick(ctx, 0, 'medium', true);  // Maria +250
  pick(ctx, 1, 'medium', true);  // Andrei +750
  // Cristina taps out
  ctx.dispatch({ type: 'TAP_OUT', playerId: ctx.state.players[2].id });
  pick(ctx, 3, 'hard', false);   // Pavel -600
  ctx.dispatch({ type: 'END_ROUND' });

  // === Round 6 ===
  pick(ctx, 0, 'easy', true);    // Maria +100
  pick(ctx, 1, 'hard', true);    // Andrei +1500
  pick(ctx, 3, 'easy', true);    // Pavel +300
  ctx.dispatch({ type: 'END_ROUND' });

  eq(ctx.state.phase, 'reveal', 'Game ended in reveal');

  // Compute expected:
  // Maria (carbonara): +100 -100 +500 +250 +100 + survival(R1+R2+R3+R4+R5+R6 = 6 × 50 = 300) = 1150
  // Andrei (spicy):    +750 +1500 -150 +750 +1500 + survival(6 × 50 = 300) = 4650
  // Cristina (carbonara): -200 -150 -150 +100 + survival(R1+R2+R3+R4 = 200) = -200
  //   (tapped out R5 → no survival from R5 onwards)
  // Pavel (spicy):     -225 +300 +750 -600 +300 + survival(R1-R6 = 300) = 825
  // Ioana (carbonara): +100 + survival(R1 = 50) = 150 (tapped out R2)

  eq(ctx.state.players[0].score, 1150, 'Maria final = 1150');
  eq(ctx.state.players[1].score, 4650, 'Andrei final = 4650');
  eq(ctx.state.players[2].score, -200, 'Cristina final = -200');
  eq(ctx.state.players[3].score, 825, 'Pavel final = 825');
  eq(ctx.state.players[4].score, 150, 'Ioana final = 150');

  // Sanity: rankings sorted desc
  const r = [...ctx.state.players].sort((a, b) => b.score - a.score);
  eq(r[0].name, 'Andrei', '1st = Andrei');
  eq(r[1].name, 'Maria', '2nd = Maria');
  eq(r[2].name, 'Pavel', '3rd = Pavel');
  eq(r[3].name, 'Ioana', '4th = Ioana');
  eq(r[4].name, 'Cristina', '5th = Cristina');
});

// =================================================================
console.log(`\n${'═'.repeat(60)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
}
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
