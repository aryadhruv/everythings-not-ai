/**
 * everything-not-ai — offline heuristics engine
 *
 * Two jobs:
 *   1. BUZZWORDS  — regexes that find AI-ish words in page text.
 *   2. guessTech  — given the text *around* a match (plus the matched term),
 *                   guess the real tech behind it.
 *
 * Tone: we acknowledge the genuine innovation, then deflate the marketing.
 * The scorer is weighted (specific signals count more) and takes a soft "prior"
 * from the matched word itself (e.g. "GPT" leans LLM, "agentic" leans Agent),
 * so the verdict is sharp enough to make "Ask a real AI" mostly unnecessary.
 *
 * Exposed on `self.ENA` so the content script (same isolated world) can use it,
 * and via CommonJS so the Node tests share the exact same logic.
 */
(function () {
  "use strict";

  // ---- 1. Buzzwords we hunt for -------------------------------------------
  // Order is for readability only; findMatches resolves overlaps by length
  // (longest phrase wins), not by array order. `gi` = case-insensitive (safe
  // for multi-word phrases / unambiguous acronyms). The bare "AI" stays
  // case-SENSITIVE so we don't light up "again", "said", "captain", "email".
  const BUZZWORDS = [
    // agents — the most over-thrown bucket of 2024-2026
    { label: "agentic AI",             re: /\bagentic\s+a\.?i\.?\b/gi },
    { label: "agentic",                re: /\bagentic\b/gi },
    { label: "AI agent",               re: /\bA\.?I\.?\s+agents?\b/gi },
    { label: "multi-agent",            re: /\bmulti[-\s]?agents?\b/gi },
    { label: "autonomous agent",       re: /\bautonomous\s+agents?\b/gi },

    // generative / model families
    { label: "generative AI",          re: /generative\s+a\.?i\.?/gi },
    { label: "foundation model",       re: /\bfoundation\s+models?\b/gi },
    { label: "diffusion model",        re: /\bdiffusion\s+models?\b/gi },
    { label: "transformer",            re: /\btransformer(?:[-\s](?:based|model|models|architecture|network))\b/gi },

    // classic phrases
    { label: "artificial intelligence", re: /artificial\s+intelligence/gi },
    { label: "machine learning",       re: /machine\s+learning/gi },
    { label: "deep learning",          re: /deep\s+learning/gi },
    { label: "neural network",         re: /neural\s+networks?/gi },
    { label: "computer vision",        re: /\bcomputer\s+vision\b/gi },
    { label: "natural language processing", re: /\bnatural\s+language\s+processing\b/gi },
    { label: "large language model",   re: /large\s+language\s+models?/gi },

    // retrieval flavour
    { label: "RAG",                    re: /\bRAG\b/g }, // case-sensitive (avoids "drag"/"average")
    { label: "RAG",                    re: /\bretrieval[-\s]augmented\s+generation\b/gi },

    // acronyms / products
    { label: "LLM",                    re: /\bLLMs?\b/g },
    { label: "NLP",                    re: /\bNLP\b/g },
    { label: "AGI",                    re: /\bAGI\b/g },
    { label: "ChatGPT",                re: /\bChatGPT\b/gi },
    { label: "Copilot",                re: /\bCopilot\b/g }, // case-sensitive: the product, not "co-pilot"
    { label: "GPT",                    re: /\bGPT-?\d?\b/g },

    // AI-as-adjective + bare AI (kept last; bare AI is case-sensitive)
    { label: "AI-powered",             re: /\bA\.?I\.?[-\s](?:powered|driven|enabled|based|enhanced|first|native)\b/gi },
    { label: "AI",                     re: /\bA\.?I\.?(?![A-Za-z])/g },
  ];

  // ---- 2. Tech categories + their tell-tale context words -----------------
  // Each signal is one of:
  //   "needle"          -> substring match, weight 1
  //   ["needle", w]     -> substring match, weight w
  //   { re: /x/, w }    -> word-boundary regex (use when a substring would
  //                        misfire, e.g. "code" inside "barcode"); non-global.
  // We score every category by summed signal weight, add a soft prior from the
  // matched term, and the heaviest category wins.
  const CATEGORIES = [
    {
      id: "cv",
      verdict: "Computer Vision",
      blurb: "The real deal: conv-nets / vision transformers spotting patterns " +
        "faster than any human could label them. Here it's most likely an " +
        "off-the-shelf detector doing the obvious - seeing pixels, not meaning.",
      signals: [
        ["computer vision", 3], ["object detection", 3], ["image recognition", 3],
        ["facial recognition", 3], ["bounding box", 3], ["segmentation", 2],
        ["face", 2], ["facial", 2], ["camera", 2], ["ocr", 2], ["x-ray", 2],
        ["mri", 2], ["detect", 2], ["detection", 2], "image", "images", "photo",
        "photos", "picture", "visual", "vision", "pixel", "video", "footage",
        "recognize", "recognition", "scan", "diagnos",
      ],
    },
    {
      id: "llm",
      verdict: "Large Language Model",
      blurb: "Genuinely impressive autocomplete: a transformer predicting the " +
        "next token over a huge corpus. Fluent, confident, and sometimes wrong " +
        "- it's text in, text out, not comprehension.",
      signals: [
        ["language model", 3], ["chatbot", 2], ["chat", 2], ["summar", 2],
        ["prompt", 2], ["conversation", 2], ["grammar", 2], ["paraphrase", 2],
        "assistant", "write", "writing", "writer", "content", "compose", "draft",
        "rewrite", "question", "answer", "text", "language", "reasoning",
      ],
    },
    {
      id: "agent",
      verdict: "LLM Agent (loop + tools)",
      blurb: "The useful core is real: an LLM in a loop, calling tools and APIs " +
        "to take steps toward a goal. But 'agentic' is mostly that while-loop " +
        "plus function-calls and a system prompt - not a digital coworker.",
      signals: [
        ["agentic", 3], ["multi-agent", 3], ["autonomous agent", 3],
        ["ai agent", 3], ["agent", 3], ["tool use", 3], ["tool-use", 3],
        ["function call", 3], ["function-calling", 3], ["tool", 2],
        ["multi-step", 2], ["autonomous", 2], ["delegate", 2],
        ["take action", 2], ["browse the web", 2], "orchestrat", "workflow",
        "planning", "goal", "task", "reasoning",
      ],
    },
    {
      id: "speech",
      verdict: "Speech Recognition / TTS",
      blurb: "Modern ASR/TTS is legitimately excellent now. Still just " +
        "audio-to-text and back though - it hears the words, it doesn't get you.",
      signals: [
        ["speech recognition", 3], ["text-to-speech", 3], ["text to speech", 3],
        ["asr", 3], ["voice", 2], ["speech", 2], ["transcri", 2], ["audio", 2],
        ["dictation", 2], ["microphone", 2], "accent", "pronounce", "spoken",
        "podcast", "subtitle", "call", "listen",
      ],
    },
    {
      id: "recsys",
      verdict: "Recommender System",
      blurb: "Collaborative filtering and ranking - 'people who liked X also " +
        "liked Y' linear algebra from the 2000s. Useful, sure, but it is not " +
        "reading your mind.",
      signals: [
        ["collaborative filtering", 3], ["recommend", 2], ["personaliz", 2],
        ["for you", 2], "suggestion", "suggest", "feed", "discover", "curate",
        "curated", "tailored", "matching", "matches", "similar", "upsell",
        "cross-sell",
      ],
    },
    {
      id: "predict",
      verdict: "Predictive ML / Statistics",
      blurb: "Regression or gradient-boosted trees on a spreadsheet. Frequently " +
        "just plain statistics wearing an 'AI' badge to the board meeting.",
      signals: [
        ["predict", 2], ["forecast", 2], ["forecasting", 2], ["churn", 2],
        ["fraud", 2], ["anomaly", 2], ["regression", 2], ["propensity", 2],
        "risk", "score", "scoring", "classif", "segment", "analytics", "optimi",
        "trend", "estimate", "probability", "credit", "demand", "pricing",
      ],
    },
    {
      id: "search",
      verdict: "Search / Ranking",
      blurb: "Keyword matching with a ranking function, maybe a few embeddings " +
        "bolted on. 'AI search' is mostly information retrieval with a fresh " +
        "coat of paint.",
      signals: [
        ["semantic search", 3], ["retrieval augmented", 3], ["search", 2],
        ["ranking", 2], ["relevance", 2], ["retrieval", 2], { re: /\brag\b/, w: 2 },
        "index", "query", "semantic", "embedding", "vector",
      ],
    },
    {
      id: "genmedia",
      verdict: "Generative Media (Diffusion)",
      blurb: "Diffusion models are a genuine breakthrough in image / video / " +
        "audio synthesis. Still pattern-remixing its training set at scale, " +
        "though - output without intent.",
      signals: [
        ["stable diffusion", 3], ["text-to-image", 3], ["text to image", 3],
        ["diffusion", 3], ["midjourney", 3], ["dall-e", 3], ["dalle", 3],
        ["art generator", 3], ["deepfake", 3], ["image generat", 2],
        ["generate image", 2], ["generated image", 2], ["ai art", 2],
        ["artwork", 2], ["avatar", 2], ["headshot", 2], ["synthesize", 1],
        { re: /\bgans?\b/, w: 2 }, { re: /\brender(s|ing|ed)?\b/, w: 1 },
      ],
    },
    {
      id: "codegen",
      verdict: "Code Generation",
      blurb: "An LLM autocompleting plausible code from patterns. Handy, but " +
        "confident, untested, and happy to invent an API that never existed.",
      signals: [
        ["autocomplete", 2], ["refactor", 2], ["snippet", 2], ["programming", 2],
        ["copilot", 2], ["pull request", 2], ["unit test", 2], ["boilerplate", 2],
        ["debug", 2], { re: /\bcode(base|s)?\b/, w: 2 }, { re: /\bcoding\b/, w: 2 },
        { re: /\bapi\b/, w: 1 }, ["compiler", 1], ["developer", 1], ["syntax", 1],
      ],
    },
    {
      id: "translation",
      verdict: "Machine Translation",
      blurb: "Statistical mapping between languages, fast and cheap. Idiom, " +
        "tone, and context still trip it up where a fluent human would not " +
        "blink.",
      signals: [
        ["translat", 3], ["language pair", 3], ["multilingual", 2],
        ["localiz", 2], ["bilingual", 1], ["into spanish", 1], ["into french", 1],
        ["subtitles in", 2],
      ],
    },
    {
      id: "document",
      verdict: "Document AI / OCR",
      blurb: "OCR plus templates lifting fields off a page - decades-old tech " +
        "rebranded. It extracts the numbers; it does not understand the " +
        "contract.",
      signals: [
        ["intelligent document", 3], ["scanned document", 3], ["handwriting", 3],
        ["handwritten", 3], ["invoice", 2], ["receipt", 2], ["extract data", 2],
        ["data extraction", 2], ["form field", 2], ["paperwork", 2], ["idp", 2],
        ["pdf", 2], "document", "contract", "statement",
      ],
    },
    {
      id: "moderation",
      verdict: "Text Classification",
      blurb: "Sorting text into buckets - sentiment, spam, intent. A classifier " +
        "with a threshold, not judgment and not understanding.",
      signals: [
        ["text classification", 3], ["classify text", 3], ["sentiment", 3],
        ["moderation", 3], ["toxicity", 3], ["intent detection", 3],
        ["hate speech", 3], ["spam", 2], ["categoriz", 2], ["profanity", 2],
        ["nsfw", 2], "tagging", "topic",
      ],
    },
    {
      id: "automation",
      verdict: "Automation / Rules Engine",
      blurb: "A pile of hand-written rules, triggers, and scheduled jobs. It " +
        "automates the busywork - it learns nothing and it decides nothing.",
      signals: [
        ["robotic process", 3], ["zapier", 3], ["rpa", 2], ["no-code", 2],
        ["low-code", 2], ["automat", 2], ["workflow", 1], ["webhook", 1],
        "trigger", "pipeline", "schedul", "integration",
      ],
    },
    {
      id: "robotics",
      verdict: "Robotics / Autonomous Systems",
      blurb: "Mostly sensors, control loops, and safety rails. Hard " +
        "engineering, but the 'AI' is doing far less of the driving than the " +
        "brochure implies.",
      signals: [
        ["self-driving", 3], ["autonomous vehicle", 3], ["lidar", 3],
        ["motion planning", 3], ["warehouse robot", 3], ["robot", 2], ["drone", 2],
        ["actuator", 2], ["manipulator", 2], "sensor", "navigation", "perception",
      ],
    },
    {
      // Kept LAST on purpose: it fires on ownership/novelty *claims* with no
      // concrete tech behind them. Any real category above wins a tie, so this
      // only lands when the hype is the only thing on the page.
      id: "wrapper",
      verdict: "Just a GPT wrapper",
      blurb: "Big claims, thin reality: a system prompt and an API call to " +
        "someone else's model (GPT, Claude, Llama). The 'proprietary " +
        "breakthrough' is usually the prompt and the pricing page.",
      signals: [
        ["world's first", 3], ["secret sauce", 3], ["our own model", 3],
        ["our own ai", 3], ["built our own", 3], ["proprietary algorithm", 3],
        ["proprietary model", 3], ["from the ground up", 2], ["ground-up", 2],
        ["proprietary", 2], ["revolutionary", 2], ["groundbreaking", 2],
        ["breakthrough", 2], ["game-chang", 2], ["paradigm shift", 2],
        ["patented", 2], ["reinvent", 2], ["custom ai", 2], ["powered by our", 2],
        ["next-generation", 1], ["next generation", 1], ["cutting-edge", 1],
        ["state-of-the-art", 1], ["disrupt", 1],
      ],
    },
  ];

  const FALLBACK = {
    id: "marketing",
    verdict: "Probably marketing",
    blurb: "No real signal nearby. Could be plain statistics, a handful of " +
      "hand-written rules, or pure hype with an 'AI' sticker slapped on it.",
  };

  // Normalize each signal once, up front.
  function normSig(s) {
    if (typeof s === "string") return { needle: s, w: 1 };
    if (Array.isArray(s)) return { needle: s[0], w: s[1] || 1 };
    if (s && s.re) return { re: s.re, w: s.w || 1 };
    return { needle: String(s), w: 1 };
  }
  for (const cat of CATEGORIES) cat._sigs = cat.signals.map(normSig);

  /**
   * Soft prior from the matched term itself. The word people *used* is a strong
   * hint even before we read the surrounding sentence: "GPT" is an LLM, "agentic"
   * is an agent loop, "diffusion" is generative media. Returns {categoryId: bonus}.
   * @param {string} term  lowercased matched word/label (may be empty)
   */
  function priorFor(term) {
    const p = {};
    if (!term) return p;
    const add = (id, w) => { p[id] = (p[id] || 0) + w; };

    if (/agent|agentic/.test(term)) add("agent", 3);
    if (/gpt|chatgpt|\bllm\b|language model|\bagi\b/.test(term)) add("llm", 3);
    if (term.includes("computer vision")) add("cv", 3);
    if (term.includes("diffusion")) add("genmedia", 3);
    if (term.includes("copilot")) { add("codegen", 2); add("llm", 1); }
    if (term.includes("nlp") || term.includes("natural language")) add("llm", 1);
    if (term.includes("transformer")) add("llm", 2);
    if (term.includes("foundation model")) add("llm", 2);
    if (term.includes("rag") || term.includes("retrieval")) add("search", 2);
    return p; // "neural network" / "deep learning" / "machine learning" stay neutral
  }

  function scoreCategory(cat, text) {
    let score = 0;
    for (const sg of cat._sigs) {
      if (sg.re) { if (sg.re.test(text)) score += sg.w; }
      else if (text.includes(sg.needle)) score += sg.w;
    }
    return score;
  }

  /**
   * Guess the real tech from surrounding context (and, optionally, the term).
   * @param {string} context  text around the match
   * @param {string} [term]   the matched buzzword/label, for a soft prior
   * @returns {{verdict:string, blurb:string, confidence:number, id:string}}
   */
  function guessTech(context, term) {
    const text = (context || "").toLowerCase();
    const prior = priorFor((term || "").toLowerCase());

    let best = null, bestScore = 0, secondScore = 0;
    for (const cat of CATEGORIES) {
      const score = scoreCategory(cat, text) + (prior[cat.id] || 0);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = cat;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (!best || bestScore === 0) {
      return { ...FALLBACK, confidence: 0.2 };
    }

    // Confidence rewards both raw evidence and a clear margin over the runner-up.
    const margin = bestScore - secondScore;
    const confidence = Math.max(
      0.4,
      Math.min(0.95, 0.4 + bestScore * 0.07 + margin * 0.05)
    );
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

  const api = { BUZZWORDS, CATEGORIES, guessTech, findMatches };

  // Browser (content script, isolated world): hang off `self`.
  if (typeof self !== "undefined") {
    self.ENA = Object.assign(self.ENA || {}, api);
  }
  // Node (tests): CommonJS export.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
