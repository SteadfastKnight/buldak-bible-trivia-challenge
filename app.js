'use strict';

// === Constants ===
const STORAGE_KEY = 'buldak-state-v1';

const POINTS = {
  easy: 100,
  medium: 250,
  hard: 500,
  easy_wrong: -50,
  medium_wrong: -100,
  hard_wrong: -200,
  water: -75,
  milk: -150,
  survival: 50,
  last_standing: 500,
};

const DIFF_LABEL = { easy: 'Ușor', medium: 'Mediu', hard: 'Greu' };
const DIFF_SHORT = { easy: 'U', medium: 'M', hard: 'G' };

// === State ===
function initState() {
  return {
    version: 1,
    gameId: 'g' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    phase: 'setup',
    currentRound: 0,
    totalRounds: 6,
    hideScoresThroughRound: 4,
    showScores: false,
    players: [],
    usedQuestionIds: [],
    pendingQuestion: null,
    tiebreak: null,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.version !== 1) return null;
    return s;
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Persist failed:', e);
  }
}

let state = loadState() || initState();

// === Helpers ===
const makeId = () => 'p' + Math.random().toString(36).slice(2, 8);
const multiplier = (p) => (p.mode === 'spicy' ? 3 : 1);
const isActive = (p) => p.tappedOutRound === null;
const findPlayer = (id) => state.players.find((p) => p.id === id);
const hasAnsweredThisRound = (p, round) =>
  p.log.some((e) => e.round === round && (e.type === 'correct' || e.type === 'wrong'));

function findQuestion(qId) {
  for (const diff of ['easy', 'medium', 'hard']) {
    const q = window.TRIVIA[diff].find((x) => x.id === qId);
    if (q) return { ...q, difficulty: diff };
  }
  return null;
}

function pickRandomQuestion(difficulty, usedIds) {
  const used = new Set(usedIds);
  const pool = window.TRIVIA[difficulty].filter((q) => !used.has(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function remainingByDifficulty() {
  const used = new Set(state.usedQuestionIds);
  return {
    easy: window.TRIVIA.easy.filter((q) => !used.has(q.id)).length,
    medium: window.TRIVIA.medium.filter((q) => !used.has(q.id)).length,
    hard: window.TRIVIA.hard.filter((q) => !used.has(q.id)).length,
  };
}

function pts(player, base) {
  const v = base * multiplier(player);
  return v >= 0 ? `+${v}` : `${v}`;
}

function rankings() {
  return [...state.players]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, mode: p.mode }))
    .sort((a, b) => b.score - a.score);
}

function topTied() {
  const r = rankings();
  if (r.length === 0) return [];
  const top = r[0].score;
  return r.filter((p) => p.score === top).map((p) => p.id);
}

// === Reducers ===
function reduce(s, a) {
  switch (a.type) {
    case 'ADD_PLAYER': {
      const name = a.name.trim();
      if (!name) return s;
      s.players.push({
        id: makeId(),
        name,
        mode: a.mode || 'carbonara',
        score: 0,
        tappedOutRound: null,
        log: [],
      });
      return s;
    }
    case 'REMOVE_PLAYER': {
      s.players = s.players.filter((p) => p.id !== a.id);
      return s;
    }
    case 'SET_PLAYER_MODE': {
      const p = s.players.find((x) => x.id === a.id);
      if (p) p.mode = a.mode;
      return s;
    }
    case 'RENAME_PLAYER': {
      const p = s.players.find((x) => x.id === a.id);
      if (p) p.name = a.name.trim() || p.name;
      return s;
    }
    case 'SET_TOTAL_ROUNDS': {
      s.totalRounds = a.n;
      return s;
    }
    case 'START_GAME': {
      if (s.players.length < 2) return s;
      s.phase = 'playing';
      s.currentRound = 1;
      return s;
    }
    case 'PICK_QUESTION': {
      if (s.pendingQuestion) return s;
      const p = s.players.find((x) => x.id === a.playerId);
      if (!p || !isActive(p)) return s;
      if (hasAnsweredThisRound(p, s.currentRound)) {
        alert(`${p.name} a răspuns deja la o întrebare în această rundă.`);
        return s;
      }
      const q = pickRandomQuestion(a.difficulty, s.usedQuestionIds);
      if (!q) {
        alert(`Nu mai sunt întrebări ${DIFF_LABEL[a.difficulty]}.`);
        return s;
      }
      s.pendingQuestion = {
        playerId: a.playerId,
        difficulty: a.difficulty,
        qId: q.id,
      };
      s.usedQuestionIds.push(q.id);
      return s;
    }
    case 'CANCEL_QUESTION': {
      if (!s.pendingQuestion) return s;
      const qId = s.pendingQuestion.qId;
      s.usedQuestionIds = s.usedQuestionIds.filter((x) => x !== qId);
      s.pendingQuestion = null;
      return s;
    }
    case 'ANSWER_QUESTION': {
      if (!s.pendingQuestion) return s;
      const { playerId, difficulty, qId } = s.pendingQuestion;
      const p = s.players.find((x) => x.id === playerId);
      if (!p) {
        s.pendingQuestion = null;
        return s;
      }
      const base = a.correct ? POINTS[difficulty] : POINTS[`${difficulty}_wrong`];
      const delta = base * multiplier(p);
      p.score += delta;
      p.log.push({
        round: s.currentRound,
        type: a.correct ? 'correct' : 'wrong',
        difficulty,
        qId,
        delta,
      });
      s.pendingQuestion = null;
      return s;
    }
    case 'RELIEF': {
      const p = s.players.find((x) => x.id === a.playerId);
      if (!p || !isActive(p)) return s;
      const base = POINTS[a.relief];
      const delta = base * multiplier(p);
      p.score += delta;
      p.log.push({
        round: s.currentRound,
        type: a.relief,
        delta,
      });
      return s;
    }
    case 'TAP_OUT': {
      const p = s.players.find((x) => x.id === a.playerId);
      if (!p || !isActive(p)) return s;
      p.tappedOutRound = s.currentRound;
      p.log.push({ round: s.currentRound, type: 'tapout', delta: 0 });
      const active = s.players.filter(isActive);
      if (active.length === 1) {
        const last = active[0];
        last.score += POINTS.last_standing;
        last.log.push({
          round: s.currentRound,
          type: 'last_standing',
          delta: POINTS.last_standing,
        });
        s.phase = 'reveal';
      } else if (active.length === 0) {
        s.phase = 'reveal';
      }
      return s;
    }
    case 'END_ROUND': {
      if (s.pendingQuestion) {
        alert('Rezolvă întâi întrebarea curentă.');
        return s;
      }
      for (const p of s.players) {
        if (isActive(p)) {
          p.score += POINTS.survival;
          p.log.push({
            round: s.currentRound,
            type: 'survival',
            delta: POINTS.survival,
          });
        }
      }
      if (s.currentRound >= s.totalRounds) {
        s.phase = 'reveal';
      } else {
        s.currentRound += 1;
      }
      return s;
    }
    case 'TOGGLE_SCORES': {
      s.showScores = !s.showScores;
      return s;
    }
    case 'START_TIEBREAK': {
      const ids = topTied();
      if (ids.length < 2) return s;
      const q = pickRandomQuestion('hard', s.usedQuestionIds);
      if (!q) {
        alert('Nu mai sunt întrebări Greu pentru departajare.');
        return s;
      }
      s.usedQuestionIds.push(q.id);
      s.tiebreak = { playerIds: ids, qId: q.id, winnerId: null };
      s.phase = 'tiebreak';
      return s;
    }
    case 'TIEBREAK_WINNER': {
      if (!s.tiebreak) return s;
      s.tiebreak.winnerId = a.playerId;
      s.phase = 'reveal';
      return s;
    }
    case 'RESET': {
      state = initState();
      return state;
    }
    case 'IMPORT_STATE': {
      state = a.state;
      return state;
    }
    default:
      return s;
  }
}

function dispatch(action) {
  state = reduce(state, action);
  persist();
  render();
}

// === Render ===
function escape(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function playerBadge(p) {
  return p.mode === 'spicy' ? '🔥' : '🍝';
}

function renderSetup(s) {
  const playerRows = s.players
    .map(
      (p) => `
    <li class="player-row" data-id="${p.id}">
      <span class="badge">${playerBadge(p)}</span>
      <input class="name-input" type="text" value="${escape(p.name)}"
             data-action="rename" data-id="${p.id}" />
      <div class="mode-toggle">
        <button data-action="set-mode" data-id="${p.id}" data-mode="carbonara"
                class="${p.mode === 'carbonara' ? 'active' : ''}">🍝</button>
        <button data-action="set-mode" data-id="${p.id}" data-mode="spicy"
                class="${p.mode === 'spicy' ? 'active' : ''}">🔥</button>
      </div>
      <button class="ghost-x" data-action="remove-player" data-id="${p.id}" title="Șterge">✕</button>
    </li>`
    )
    .join('');

  const roundOpts = [6, 7, 8]
    .map(
      (n) =>
        `<button data-action="set-rounds" data-n="${n}"
                 class="${s.totalRounds === n ? 'active' : ''}">${n}</button>`
    )
    .join('');

  return `
    <div class="screen setup">
      <header class="brand">
        <h1>🔥📖 Buldak Bible Trivia</h1>
      </header>

      <section>
        <h2>Jucători (${s.players.length})</h2>
        <ul class="player-list">${playerRows}</ul>
        <form id="add-player-form" class="add-player">
          <input type="text" id="new-player-name" placeholder="Nume jucător"
                 autocomplete="off" />
          <button type="submit" class="primary">Adaugă</button>
        </form>
      </section>

      <section>
        <h2>Runde</h2>
        <div class="rounds-toggle">${roundOpts}</div>
      </section>

      <section class="start-section">
        <button class="primary big" data-action="start-game"
                ${s.players.length < 2 ? 'disabled' : ''}>
          Începe jocul →
        </button>
        ${s.players.length < 2 ? '<p class="hint">Adaugă cel puțin 2 jucători.</p>' : ''}
      </section>

      ${renderFooter(s)}
    </div>
  `;
}

function renderPlayerCard(p, s) {
  const showScore = s.showScores;
  const ranks = rankings();
  const rank = ranks.findIndex((r) => r.id === p.id) + 1;
  const showRank = s.currentRound > s.hideScoresThroughRound;
  const answered = isActive(p) && hasAnsweredThisRound(p, s.currentRound);
  const dis = answered ? 'disabled' : '';

  return `
    <div class="player-card ${isActive(p) ? '' : 'tapped-out'}" data-id="${p.id}">
      <div class="player-header">
        <span class="badge">${playerBadge(p)}</span>
        <span class="name">${escape(p.name)}</span>
        ${answered ? '<span class="tag tag-done">✓ A răspuns</span>' : ''}
        ${showScore ? `<span class="score">${p.score}</span>` : ''}
        ${!showScore && showRank ? `<span class="rank">#${rank}</span>` : ''}
        ${!isActive(p) ? `<span class="tag">Abandonat (R${p.tappedOutRound})</span>` : ''}
      </div>
      ${
        isActive(p)
          ? `
        <div class="actions">
          <div class="row diff-row">
            <button data-action="pick" data-id="${p.id}" data-difficulty="easy"
                    class="diff diff-easy" ${dis}>Ușor ${pts(p, POINTS.easy)}</button>
            <button data-action="pick" data-id="${p.id}" data-difficulty="medium"
                    class="diff diff-medium" ${dis}>Mediu ${pts(p, POINTS.medium)}</button>
            <button data-action="pick" data-id="${p.id}" data-difficulty="hard"
                    class="diff diff-hard" ${dis}>Greu ${pts(p, POINTS.hard)}</button>
          </div>
          <div class="row relief-row">
            <button data-action="relief" data-id="${p.id}" data-relief="water"
                    class="relief">💧 Apă ${pts(p, POINTS.water)}</button>
            <button data-action="relief" data-id="${p.id}" data-relief="milk"
                    class="relief">🥛 Lapte ${pts(p, POINTS.milk)}</button>
            <button data-action="tap-out" data-id="${p.id}"
                    class="danger">Abandon</button>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderRemainingChip(s) {
  const r = remainingByDifficulty();
  return `
    <span class="remaining">
      <span class="chip diff-easy">${DIFF_SHORT.easy}:${r.easy}</span>
      <span class="chip diff-medium">${DIFF_SHORT.medium}:${r.medium}</span>
      <span class="chip diff-hard">${DIFF_SHORT.hard}:${r.hard}</span>
    </span>
  `;
}

function renderRankStrip(s) {
  if (s.currentRound <= s.hideScoresThroughRound || s.showScores) return '';
  const r = rankings();
  const items = r
    .map(
      (p, i) => `<span class="rank-item">${i + 1}. ${playerBadge(state.players.find((x) => x.id === p.id))} ${escape(p.name)}</span>`
    )
    .join('');
  return `<div class="rank-strip"><strong>Clasament:</strong> ${items}</div>`;
}

function renderPlaying(s) {
  const cards = s.players.map((p) => renderPlayerCard(p, s)).join('');
  return `
    <div class="screen playing">
      <header class="play-header">
        <div class="round-info">
          Runda <strong>${s.currentRound}</strong> / ${s.totalRounds}
        </div>
        ${renderRemainingChip(s)}
        <button class="ghost" data-action="toggle-scores">
          ${s.showScores ? 'Ascunde scoruri' : 'Arată scoruri'}
        </button>
      </header>

      ${renderRankStrip(s)}

      <div class="players">${cards}</div>

      <button class="primary big end-round" data-action="end-round">
        Termină runda ${s.currentRound} →
      </button>

      ${renderFooter(s)}

      ${s.pendingQuestion ? renderQuestionModal(s) : ''}
    </div>
  `;
}

function renderQuestionModal(s) {
  const { playerId, difficulty, qId } = s.pendingQuestion;
  const p = findPlayer(playerId);
  const q = findQuestion(qId);
  if (!p || !q) return '';
  const correctPts = pts(p, POINTS[difficulty]);
  const wrongPts = pts(p, POINTS[`${difficulty}_wrong`]);
  return `
    <div class="modal-backdrop">
      <div class="modal question-modal diff-${difficulty}">
        <div class="modal-header">
          <span class="badge">${playerBadge(p)}</span>
          <span class="player-name">${escape(p.name)}</span>
          <span class="diff-label">${DIFF_LABEL[difficulty]}</span>
          <span class="qnum">#${q.number}</span>
        </div>
        <div class="question">${escape(q.question)}</div>
        <div class="answer">
          <span class="label">Răspuns:</span> <strong>${escape(q.answer)}</strong>
        </div>
        ${
          q.reference
            ? `<div class="reference">
                 <span class="label">Referință:</span> ${escape(q.reference)}
               </div>`
            : ''
        }
        ${q.quote ? `<div class="quote">„${escape(q.quote)}"</div>` : ''}
        <div class="modal-actions">
          <button class="success" data-action="answer" data-correct="true">
            Corect ✅ ${correctPts}
          </button>
          <button class="danger" data-action="answer" data-correct="false">
            Greșit ❌ ${wrongPts}
          </button>
          <button class="ghost" data-action="cancel-question">
            Anulează (revine în pool)
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderReveal(s) {
  const r = rankings();
  const tiedTop = topTied();
  const canTiebreak = tiedTop.length >= 2;

  const rows = r
    .map((row, i) => {
      const p = state.players.find((x) => x.id === row.id);
      const isWinner =
        s.tiebreak && s.tiebreak.winnerId === p.id
          ? true
          : !s.tiebreak && i === 0 && tiedTop.length === 1;
      return `
        <li class="reveal-row ${isWinner ? 'winner' : ''}">
          <span class="rank">#${i + 1}</span>
          <span class="badge">${playerBadge(p)}</span>
          <span class="name">${escape(p.name)}</span>
          <span class="score">${p.score}</span>
          ${!isActive(p) ? `<span class="tag">Abandonat R${p.tappedOutRound}</span>` : ''}
        </li>
      `;
    })
    .join('');

  return `
    <div class="screen reveal">
      <header class="brand">
        <h1>🏆 Final</h1>
      </header>
      <ol class="reveal-list">${rows}</ol>
      ${
        canTiebreak
          ? `<button class="primary big" data-action="start-tiebreak">
               Departajare (${tiedTop.length} jucători) →
             </button>`
          : ''
      }
      ${renderFooter(s)}
    </div>
  `;
}

function renderTiebreak(s) {
  if (!s.tiebreak) return '';
  const q = findQuestion(s.tiebreak.qId);
  const players = s.tiebreak.playerIds.map((id) => findPlayer(id));
  const winnerBtns = players
    .map(
      (p) => `
      <button class="primary" data-action="tiebreak-winner" data-id="${p.id}">
        ${playerBadge(p)} ${escape(p.name)} a răspuns primul
      </button>
    `
    )
    .join('');
  return `
    <div class="screen tiebreak">
      <header class="brand">
        <h1>⚔️ Departajare</h1>
      </header>
      <div class="modal question-modal diff-hard inline">
        <div class="modal-header">
          <span class="diff-label">Greu</span>
          <span class="qnum">#${q.number}</span>
        </div>
        <div class="question">${escape(q.question)}</div>
        <div class="answer">
          <span class="label">Răspuns:</span> <strong>${escape(q.answer)}</strong>
        </div>
        ${q.reference ? `<div class="reference"><span class="label">Referință:</span> ${escape(q.reference)}</div>` : ''}
        ${q.quote ? `<div class="quote">„${escape(q.quote)}"</div>` : ''}
      </div>
      <div class="tiebreak-buttons">${winnerBtns}</div>
      ${renderFooter(s)}
    </div>
  `;
}

function renderFooter(s) {
  return `
    <footer class="app-footer">
      <button class="ghost small" data-action="export">💾 Salvează backup</button>
      <button class="ghost small" data-action="import">📂 Încarcă backup</button>
      <button class="ghost small danger-text" data-action="reset">↺ Resetează</button>
    </footer>
  `;
}

function render() {
  const root = document.getElementById('app');
  let html;
  switch (state.phase) {
    case 'setup': html = renderSetup(state); break;
    case 'playing': html = renderPlaying(state); break;
    case 'reveal': html = renderReveal(state); break;
    case 'tiebreak': html = renderTiebreak(state); break;
    default: html = '<p>Stare necunoscută.</p>';
  }
  root.innerHTML = html;
  attachHandlers(root);
}

// === Event handling ===
function attachHandlers(root) {
  root.addEventListener('click', onClick);
  const form = document.getElementById('add-player-form');
  if (form) form.addEventListener('submit', onAddPlayer);
  for (const inp of root.querySelectorAll('input.name-input')) {
    inp.addEventListener('change', (e) => {
      dispatch({
        type: 'RENAME_PLAYER',
        id: e.target.dataset.id,
        name: e.target.value,
      });
    });
  }
}

function onAddPlayer(e) {
  e.preventDefault();
  const input = document.getElementById('new-player-name');
  const name = input.value;
  if (!name.trim()) return;
  dispatch({ type: 'ADD_PLAYER', name, mode: 'carbonara' });
  input.value = '';
  input.focus();
}

function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  switch (a) {
    case 'remove-player':
      dispatch({ type: 'REMOVE_PLAYER', id: btn.dataset.id });
      break;
    case 'set-mode':
      dispatch({
        type: 'SET_PLAYER_MODE',
        id: btn.dataset.id,
        mode: btn.dataset.mode,
      });
      break;
    case 'set-rounds':
      dispatch({ type: 'SET_TOTAL_ROUNDS', n: parseInt(btn.dataset.n, 10) });
      break;
    case 'start-game':
      dispatch({ type: 'START_GAME' });
      break;
    case 'pick':
      dispatch({
        type: 'PICK_QUESTION',
        playerId: btn.dataset.id,
        difficulty: btn.dataset.difficulty,
      });
      break;
    case 'answer':
      dispatch({
        type: 'ANSWER_QUESTION',
        correct: btn.dataset.correct === 'true',
      });
      break;
    case 'cancel-question':
      dispatch({ type: 'CANCEL_QUESTION' });
      break;
    case 'relief':
      dispatch({
        type: 'RELIEF',
        playerId: btn.dataset.id,
        relief: btn.dataset.relief,
      });
      break;
    case 'tap-out':
      if (confirm(`Confirmi abandonul pentru acest jucător?`)) {
        dispatch({ type: 'TAP_OUT', playerId: btn.dataset.id });
      }
      break;
    case 'end-round':
      if (confirm(`Termini runda ${state.currentRound}? +50 supraviețuire pentru jucătorii activi.`)) {
        dispatch({ type: 'END_ROUND' });
      }
      break;
    case 'toggle-scores':
      dispatch({ type: 'TOGGLE_SCORES' });
      break;
    case 'start-tiebreak':
      dispatch({ type: 'START_TIEBREAK' });
      break;
    case 'tiebreak-winner':
      dispatch({ type: 'TIEBREAK_WINNER', playerId: btn.dataset.id });
      break;
    case 'export':
      exportBackup();
      break;
    case 'import':
      document.getElementById('import-file').click();
      break;
    case 'reset':
      if (confirm('Sigur resetezi jocul? Toate datele se pierd.')) {
        dispatch({ type: 'RESET' });
      }
      break;
  }
}

// === Backup ===
function exportBackup() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/T/, '_')
    .slice(0, 16);
  const a = document.createElement('a');
  a.href = url;
  a.download = `buldak-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupImport() {
  const inp = document.getElementById('import-file');
  inp.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (imported.version !== 1) {
          alert('Versiune incompatibilă a backup-ului.');
          return;
        }
        if (!confirm('Înlocuiești jocul curent cu backup-ul ales?')) return;
        dispatch({ type: 'IMPORT_STATE', state: imported });
      } catch (err) {
        alert('Fișier invalid: ' + err.message);
      } finally {
        inp.value = '';
      }
    };
    reader.readAsText(file);
  });
}

// === Boot ===
window.addEventListener('DOMContentLoaded', () => {
  if (!window.TRIVIA) {
    document.getElementById('app').innerHTML =
      '<p style="padding:20px;color:#fff">Eroare: trivia.js nu e încărcat.</p>';
    return;
  }
  setupImport();
  render();
});
