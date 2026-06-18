/**
 * everything-not-ai — offline heuristics engine
 *
 * Two jobs:
 *   1. BUZZWORDS  — regexes that find AI-ish words in page text.
 *   2. guessTech  — given the text *around* a match, guess the real tech.
 *
 * Exposed on `self.ENA` so the content script (same isolated world) can use it.
 */
(function () {
  "use strict";

  // ---- 1. Buzzwords we hunt for -------------------------------------------
  // Order matters: longer / multi-word phrases first so they win over "AI".
  // `ci` = case-insensitive (safe for multi-word phrases). The bare "AI" stays
  // case-SENSITIVE so we don't light up "again", "said", "captain", "email".
  const BUZZWORDS = [
    { label: "generative AI",          re: /generative\s+a\.?i\.?/gi },
    { label: "artificial intelligence", re: /artificial\s+intelligence/gi },
    { label: "machine learning",       re: /machine\s+learning/gi },
    { label: "deep learning",          re: /deep\s+learning/gi },
    { label: "neural network",         re: /neural\s+networks?/gi },
    { label: "large language model",   re: /large\s+language\s+models?/gi },
    { label: "LLM",                    re: /\bLLMs?\b/g },
    { label: "GPT",                    re: /\bGPT-?\d?\b/g },
    { label: "AI-powered",             re: /\bA\.?I\.?[-\s](?:powered|driven|enabled|based|enhanced)\b/gi },
    { label: "AI",                     re: /\bA\.?I\.?(?![A-Za-z])/g }, // case-sensitive: only "AI"/"A.I."
  ];

  // ---- 2. Tech categories + their tell-tale context words -----------------
  // Each category: signals (words near the match that hint at it), a verdict,
  // and a one-liner. We score categories by signal hits in the surrounding text.
  const CATEGORIES = [
    {
      id: "cv",
      verdict: "Computer Vision",
      blurb: "Image classification / object detection — convolutional nets or similar.",
      signals: ["image", "images", "photo", "photos", "picture", "scan", "scanning",
        "detect", "detection", "recognize", "recognition", "face", "facial", "object",
        "visual", "vision", "camera", "ocr", "x-ray", "xray", "mri", "diagnos", "pixel",
        "video", "footage", "augmented reality", "ar "],
    },
    {
      id: "llm",
      verdict: "Large Language Model",
      blurb: "Text in, text out — a transformer LLM doing autocomplete with vibes.",
      signals: ["chat", "chatbot", "assistant", "write", "writing", "writer", "text",
        "language", "summar", "translat", "generate", "generative", "prompt",
        "conversation", "copilot", "content", "compose", "draft", "rewrite", "grammar",
        "question", "answer", "agent", "reasoning"],
    },
    {
      id: "speech",
      verdict: "Speech Recognition / TTS",
      blurb: "Audio to/from text - ASR or text-to-speech models.",
      signals: ["voice", "speech", "transcri", "audio", "dictation", "call", "accent",
        "pronounce", "spoken", "listen", "microphone", "podcast", "subtitle"],
    },
    {
      id: "recsys",
      verdict: "Recommender System",
      blurb: "Collaborative filtering / ranking — 'people who liked X…' math.",
      signals: ["recommend", "suggestion", "suggest", "personaliz", "for you", "feed",
        "discover", "curate", "curated", "tailored", "matching", "matches", "similar"],
    },
    {
      id: "predict",
      verdict: "Predictive ML / Statistics",
      blurb: "Regression / gradient-boosted trees on tabular data. Often just stats.",
      signals: ["predict", "forecast", "score", "scoring", "risk", "fraud", "churn",
        "anomaly", "classif", "segment", "analytics", "optimi", "trend", "estimate",
        "probability", "credit", "demand", "pricing"],
    },
    {
      id: "search",
      verdict: "Search / Ranking",
      blurb: "Information retrieval — embeddings or good old keyword ranking.",
      signals: ["search", "ranking", "relevance", "retrieval", "index", "query",
        "semantic", "embedding", "filter results"],
    },
    {
      id: "automation",
      verdict: "Automation / Rules Engine",
      blurb: "Workflow automation — frequently a pile of if/else, not learning anything.",
      signals: ["automat", "workflow", "robot", "rpa", "no-code", "trigger", "rule",
        "pipeline", "orchestrat", "schedul"],
    },
  ];

  const FALLBACK = {
    id: "marketing",
    verdict: "Probably marketing",
    blurb: "No real signal nearby. Could be plain statistics, if-statements, or pure hype.",
  };

  /**
   * Guess the real tech from surrounding context.
   * @param {string} context  lowercased text around the match
   * @returns {{verdict:string, blurb:string, confidence:number, id:string}}
   */
  function guessTech(context) {
    const text = (context || "").toLowerCase();
    let best = null;
    let bestScore = 0;

    for (const cat of CATEGORIES) {
      let score = 0;
      for (const sig of cat.signals) {
        if (text.includes(sig)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = cat;
      }
    }

    if (!best) {
      return { ...FALLBACK, confidence: 0.2 };
    }
    // Map raw signal hits to a rough 0.4–0.95 confidence.
    const confidence = Math.min(0.95, 0.45 + bestScore * 0.15);
    return { id: best.id, verdict: best.verdict, blurb: best.blurb, confidence };
  }

  /**
   * Find all buzzword matches in a string, longest-phrase-wins, no overlaps.
   * @param {string} text
   * @returns {Array<{start:number,end:number,raw:string,label:string}>}
   */
  function findMatches(text) {
    const hits = [];
    for (const { label, re } of BUZZWORDS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length, raw: m[0], label });
        if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
      }
    }
    // Sort by start, then longest-first, and drop overlaps (longer phrase wins).
    hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const chosen = [];
    let cursor = -1;
    for (const h of hits) {
      if (h.start >= cursor) {
        chosen.push(h);
        cursor = h.end;
      }
    }
    return chosen;
  }

  const api = { BUZZWORDS, guessTech, findMatches };

  // Browser (content script, isolated world): hang off `self`.
  if (typeof self !== "undefined") {
    self.ENA = Object.assign(self.ENA || {}, api);
  }
  // Node (tests): CommonJS export.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
