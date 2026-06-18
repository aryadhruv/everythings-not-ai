# everything-not-ai

A Chromium extension that scans a webpage for the word **"AI"** (and friends —
`artificial intelligence`, `machine learning`, `GPT`, `LLM`, `neural network`,
`deep learning`…), then glitch-morphs each buzzword into the **real technology**
probably hiding behind it.

> Because *most* of what gets sold as "AI" is a logistic regression, a CNN, a
> recommender system, or a tidy pile of if-statements.

## How it works

- **Heuristics (offline, default):** for every match, it reads the surrounding
  text and scores it against tech categories — computer vision, LLMs, speech,
  recommender systems, predictive ML, search, automation — then shows its best
  hunch with a confidence bar. No network, no keys, instant.
- **Ask a real AI (optional):** click the button in the tooltip to send just the
  matched phrase + nearby context to a **free model on OpenRouter** for a sharper
  verdict. You supply your own key; it's stored locally and only sent to
  OpenRouter.

## Install (developer mode)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open any AI-marketing-heavy page and hover the highlighted buzzwords.

## Optional: enable "Ask a real AI"

1. Get a free key at <https://openrouter.ai/keys>.
2. Click the extension icon → paste the key → pick a free model → **Save**.

## Project layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `src/heuristics.js` | buzzword regexes + offline context→tech guesser |
| `src/content.js` | DOM scan, match wrapping, glitch-morph, tooltip |
| `src/content.css` | glitch / decode animation + tooltip styling |
| `src/background.js` | service worker → OpenRouter "Ask a real AI" proxy |
| `src/popup.*` | on/off toggle, API key, model picker, match count |

## Tests & demo

```bash
npm test          # runs the matcher + guesser tests (plain Node, no deps)
```

The suite checks both detection (catches `AI`, `A.I.`, `machine learning`,
`GPT-4`, …) and false-positive guarding (ignores `again`, `captain`, `email`),
plus that each context routes to the right real-tech verdict.

`test/demo.html` is a buzzword-stuffed sample page — open it in the browser with
the extension loaded to watch the glitch-morph and tooltips in action.

## Status

v0.1 — heuristics + glitch reveal + OpenRouter hybrid working. No icons yet.

## Roadmap

- [ ] Extension icons (16/32/48/128).
- [ ] Per-site enable/disable + allow/block list.
- [ ] Smarter heuristics (look at the page's `<meta>`/headings, not just nearby words).
- [ ] "Audit this page" report view listing every match + verdict.
- [ ] Tests for the matcher (false-positive guarding).