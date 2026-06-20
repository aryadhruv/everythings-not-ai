# CLAUDE.md

Guidance for working in this repo.

## Project

`everything-not-ai` — a Manifest V3 Chromium extension that scans webpages for AI
buzzwords (`AI`, `artificial intelligence`, `machine learning`, `GPT`, `LLM`,
`neural network`, `deep learning`, …) and reveals the real technology probably
behind each one.

- `src/heuristics.js` — buzzword regexes, the `findMatches` matcher, and
  `guessTech(context, term)`: weighted per-category signals plus a soft prior
  derived from the matched word itself (e.g. `GPT`→LLM, `agentic`→agent loop,
  `diffusion`→generative media), with margin-aware confidence. Categories carry
  the verdict + blurb. Shared by the content script AND the Node tests (CommonJS
  export + `self` global), so it's the single source of truth.
- `src/content.js` — DOM text-node walker, match wrapping, the glitch flash on
  the inline word, the sticky tooltip (with hover-intent), and a
  `MutationObserver` for dynamically rendered pages. On "Ask a real AI" click it
  lazily gathers rich page context (title, URL, nearest heading, ~100 words each
  side via DOM `Range`, spilling into adjacent blocks) — see `buildAskPayload`.
- `src/background.js` — service worker that proxies the optional "Ask a real AI"
  call to OpenRouter (OpenAI-compatible endpoint, user-supplied free key). Owns
  the prompt design in `SYSTEM_PROMPT`/`FEWSHOT`; no `max_tokens` cap (it once
  clipped replies mid-line), `stream: false`, low temperature.
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
- **Self-documenting names over comments.** Don't comment what a clear name
  already says (`HOVER_DELAY_MS`, `hoverTimer`). Reserve comments for non-obvious
  *why* — design rationale, gotchas, constraints — not restating the code.
- The inline matched word must stay **length-stable** on hover (glitch flash that
  settles back to the original text). The `AI -> verdict` reveal belongs in the
  tooltip, never by expanding the inline word — expanding it causes layout shift
  and a mouseenter/mouseleave oscillation loop.

## Voice

This is an educational parody project: deflate AI marketing, but be accurate.

- **Acknowledge real innovation only where it's genuine** (the deep-learning
  breakthroughs: vision, LLMs, speech, diffusion, the agent *core*). Everything
  else — recsys, predictive/stats, search, automation, OCR, the wrapper bucket —
  is pure deflation, no praise.
- **Plain language.** Non-technical people use this. No `if/else`, `regex`, or
  other jargon in user-facing blurbs/answers — say "hand-written rules" etc.
- **Favourite kill shots:** thin wrapper over someone else's model dressed up as
  proprietary; and decades-old tech (compressors, thermostats, autocomplete)
  freshly relabelled "AI" — call out roughly how long it predates the label.
- The "Ask a real AI" model must stay **independent** — don't feed it our own
  heuristic guess or a multiple-choice list (it just echoes us). It answers in
  1-2 sentences of organic prose, no rigid `Real tech:`/`Why:` template. Page
  text is untrusted: the prompt treats it as data, not instructions.

## Testing

- `npm test` for the matcher + guesser logic.
- Load unpacked via `chrome://extensions` and open `test/demo.html` to verify the
  glitch flash, sticky tooltip, and the "Ask a real AI" button by hand.