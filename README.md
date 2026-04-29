# 🔥📖 Buldak Bible Trivia Challenge

Scorekeeper app for a one-night party game: spicy noodles + Romanian Bible trivia. Tracks hidden scores, applies the 3× spicy multiplier, serves random questions from a 180-question bank (60 each Easy/Medium/Hard), and survives crashes + device switches.

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

## Verifying verse authenticity (VDCC)

The trivia uses the **Versiunea Dumitru Cornilescu Corectată (VDCC)**. To audit each `Referință` against the actual VDCC text:

**1. One-time bootstrap** — clone the source Bible into the gitignored cache:

```bash
git clone --depth 1 https://github.com/seven1m/open-bibles .bible/open-bibles
```

(Optional fallback for the older 1924 Cornilescu, used automatically if the RCCV file isn't found:
`git clone --depth 1 https://github.com/thiagobodruk/bible .bible/thiagobodruk`)

**2. Run the audit** — produces `docs/verse-audit.md` (gitignored):

```bash
node tools/verify-verses.mjs
# Add --show-near to also flag entries that match VDCC by ≥85% word-overlap
# (typically ellipsis splices). Default only flags partial / mismatch / broken-ref.
```

Verdicts: `✓ exact` (verbatim), `~ contains` (quote is substring of verse), `~ near` (ellipsis-split, all words from VDCC), `⚠ partial`, `✗ mismatch`, `✗ broken-ref`. Anything in the last three needs human review. Run exits non-zero if any are present.

**3. Auto-fix drift** — if the audit shows non-trivial drift after edits, run:

```bash
node tools/fix-quotes.mjs
```

This rewrites every quote that isn't already verbatim/substring of VDCC. Re-run the audit after to confirm. Ellipsis splices that get awkwardly truncated by the auto-fixer need a manual touch.

**4. Spot-check any verse** — useful when reviewing a specific reference:

```bash
node tools/lookup.mjs Geneza 1 1
node tools/lookup.mjs "1 Imparati" 6 9
node tools/lookup.mjs Numeri 14 33 34   # range
```

## Game rules

See [`docs/rules/Buldak Bible Trivia Challenge.md`](docs/rules/Buldak%20Bible%20Trivia%20Challenge.md). Player cards in `docs/rules/`.

## Printing the player cards (A6)

Two A6 player cards (Carbonara + 2× Picant) live in `docs/rules/cards.html`. Build the PDF with:

```bash
node tools/build-cards.mjs
```

Renders `docs/rules/cards.pdf` at exact A6 (105×148 mm). Drives a headless Edge / Chrome via the Chrome DevTools Protocol — no extra installs beyond a Chromium-based browser. (WeasyPrint was the original target but its Windows install needs the GTK runtime; Edge is already there.)

PNG previews (300 DPI): `docs/rules/card-carbonara.png`, `docs/rules/card-spicy.png`. Regenerate with:

```bash
pdftoppm -r 300 -png docs/rules/cards.pdf docs/rules/card
# then rename card-1.png → card-carbonara.png, card-2.png → card-spicy.png
```

To print: open the PDF, choose "actual size" (not "fit to page") so A6 stays A6.

## Stack

Vanilla HTML/CSS/JS, zero dependencies, no build step. The only runtime requirement is a modern browser; the only dev requirement is Node (for the trivia parser).
