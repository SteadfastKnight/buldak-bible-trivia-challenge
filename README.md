# 🔥📖 Buldak Bible Trivia Challenge

Scorekeeper app for a one-night party game: spicy noodles + Romanian Bible trivia. Tracks hidden scores, applies the 3× spicy multiplier, serves random questions from a 120-question bank, and survives crashes + device switches.

## Run

**Hosted (recommended):** push to `main`, enable GitHub Pages (Settings → Pages → Source: `main` / root). Bookmark the URL on your phone *and* a backup laptop.

**Local file:** download / clone the repo and open `index.html` directly in a browser. Works offline. Same code, same state.

## Persistence

- **Auto-save**: every action writes to `localStorage` (key `buldak-state-v1`). A tab refresh or phone lock loses nothing.
- **Backup**: bottom-of-screen `💾 Salvează backup` downloads a JSON snapshot. `📂 Încarcă backup` restores it. Use this to move between devices: AirDrop / email / Dropbox the file, import on the other side.
- **Reset**: `↺ Resetează` wipes the saved game.

## Regenerating the trivia bank

`trivia.js` is generated from `docs/trivia/{easy,medium,hard}.md`. Re-run if you edit questions:

```bash
node tools/parse-trivia.mjs
```

## Game rules

See [`docs/rules/Buldak Bible Trivia Challenge.md`](docs/rules/Buldak%20Bible%20Trivia%20Challenge.md). Player cards in `docs/rules/`.

## Stack

Vanilla HTML/CSS/JS, zero dependencies, no build step. The only runtime requirement is a modern browser; the only dev requirement is Node (for the trivia parser).
