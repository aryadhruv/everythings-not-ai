# CLAUDE.md

Guidance for working in this repo.

## Project

`everything-not-ai` — a Manifest V3 Chromium extension that scans webpages for AI
buzzwords (`AI`, `artificial intelligence`, `machine learning`, `GPT`, `LLM`,
`neural network`, `deep learning`, …) and reveals the real technology probably
behind each one.

- `src/heuristics.js` — buzzword regexes, the context->tech guesser, and the
  `findMatches` matcher. Shared by the content script AND the Node tests
  (CommonJS export + `self` global), so it's the single source of truth.
- `src/content.js` — DOM text-node walker, match wrapping, the glitch flash on
  the inline word, the sticky tooltip (with hover-intent), and a
  `MutationObserver` for dynamically rendered pages.
- `src/background.js` — service worker that proxies the optional "Ask a real AI"
  call to OpenRouter (OpenAI-compatible endpoint, user-supplied free key).
- `src/popup.*` — on/off toggle, API key + free-model picker, live match count.
- `test/heuristics.test.js` — zero-dep Node tests. Run with `npm test`.
- `test/demo.html` — buzzword-stuffed fixture page for manual/visual testing.

## Conventions

- **No emojis. Anywhere.** Not in the UI, code, comments, commit messages, docs,
  test output, or console logs. This is a hard rule.
  - When an icon is genuinely needed in the UI, use a real vector icon from an
    icon set (e.g. Heroicons, Lucide, Tabler) — solid style — bundled locally as
    inline SVG. Never substitute an emoji for an icon.
  - Prefer plain words for status (`PASS`/`FAIL`, `saved`, `Error:`) over symbol
    glyphs.
- Keep `heuristics.js` runnable in both the browser and Node (don't add
  browser-only globals at module top level).
- The inline matched word must stay **length-stable** on hover (glitch flash that
  settles back to the original text). The `AI -> verdict` reveal belongs in the
  tooltip, never by expanding the inline word — expanding it causes layout shift
  and a mouseenter/mouseleave oscillation loop.

## Testing

- `npm test` for the matcher + guesser logic.
- Load unpacked via `chrome://extensions` and open `test/demo.html` to verify the
  glitch flash, sticky tooltip, and the "Ask a real AI" button by hand.