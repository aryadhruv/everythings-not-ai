/**
 * everything-not-ai — content script
 *
 * Walks the page's text nodes, wraps AI-ish buzzwords, glitch-reveals them,
 * and on hover morphs the word into the predicted real tech + a tooltip.
 */
(function () {
  "use strict";

  const ENA = self.ENA;
  if (!ENA || !ENA.BUZZWORDS) return; // heuristics.js failed to load

  const MARK_CLASS = "ena-mark";
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "CODE", "PRE", "KBD", "SVG", "CANVAS", "IFRAME",
  ]);

  const processed = new WeakSet(); // text nodes we've already handled
  let enabled = true;
  let matchCount = 0;
  let activeTooltip = null;
  let dead = false; // set once the extension context is gone (reload/update)

  // matcher lives in heuristics.js so tests + content share one implementation
  const findMatches = ENA.findMatches;

  // ---- extension-context liveness -----------------------------------------
  // When the extension is reloaded/updated, content scripts already injected in
  // open tabs keep running but lose their chrome.* bridge. Touching any chrome
  // API then throws "Extension context invalidated". We detect that, go inert,
  // and stop fighting the page so the only fallout is "refresh to re-enable".
  function ctxAlive() {
    try {
      return !dead && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function teardown() {
    if (dead) return;
    dead = true;
    enabled = false;
    try { observer.disconnect(); } catch (_) {}
    clearTimeout(pending);
    removeTooltip();
  }

  // ---- DOM walking ---------------------------------------------------------
  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      // Never re-scan anything WE injected (marks, glyphs, tooltip). Otherwise
      // our own verdict/blurb/"Ask a real AI" text gets matched and bleeds into
      // the context we capture and send to the AI.
      if (el.hasAttribute && el.hasAttribute("data-ena")) return true;
      el = el.parentElement;
    }
    return false;
  }

  function scanRoot(root) {
    if (!enabled) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (processed.has(node)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(wrapMatchesInNode);
  }

  function wrapMatchesInNode(node) {
    processed.add(node);
    const text = node.nodeValue;
    const matches = findMatches(text);
    if (!matches.length) return;

    const frag = document.createDocumentFragment();
    let last = 0;
    for (const hit of matches) {
      if (hit.start > last) {
        frag.appendChild(document.createTextNode(text.slice(last, hit.start)));
      }
      // surrounding context: ~120 chars each side, for the heuristic guess.
      const ctx = text.slice(Math.max(0, hit.start - 120), hit.end + 120);
      frag.appendChild(makeMark(hit.raw, hit.label, ctx));
      last = hit.end;
      matchCount++;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    node.parentNode.replaceChild(frag, node);
  }

  function makeMark(raw, label, context) {
    // Pass the matched label too: the word itself is a strong prior (e.g. "GPT"
    // leans LLM, "agentic" leans agent loop) even before we weigh the context.
    const guess = ENA.guessTech(context, label);
    const span = document.createElement("span");
    span.className = MARK_CLASS;
    span.setAttribute("data-ena", "mark");
    span.textContent = raw;
    span.dataset.raw = raw;
    span.dataset.tech = guess.verdict;
    span.dataset.blurb = guess.blurb;
    span.dataset.confidence = String(Math.round(guess.confidence * 100));
    span.dataset.context = context;
    span.dataset.label = label;
    // staggered entrance scramble
    span.style.setProperty("--ena-delay", (Math.random() * 0.6).toFixed(2) + "s");
    span.addEventListener("mouseenter", onEnter);
    span.addEventListener("mouseleave", onLeave);
    return span;
  }

  // ---- glitch / decode morph ----------------------------------------------
  const GLYPHS = "!<>-_\\/[]{}—=+*^?#01AI░▒▓".split("");

  function scrambleTo(el, target, done) {
    const from = el.textContent;
    const len = Math.max(from.length, target.length);
    let frame = 0;
    cancelAnimationFrame(el._ena_raf);

    const queue = [];
    for (let i = 0; i < len; i++) {
      const start = Math.floor(Math.random() * 8);
      const end = start + Math.floor(Math.random() * 8) + 4;
      queue.push({ to: target[i] || "", fromChar: from[i] || "", start, end, char: "" });
    }

    function tick() {
      let out = "";
      let complete = 0;
      for (const q of queue) {
        if (frame >= q.end) {
          complete++;
          out += escapeHtml(q.to);
        } else if (frame >= q.start) {
          if (!q.char || Math.random() < 0.32) {
            q.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          out += `<span class="ena-glyph">${escapeHtml(q.char)}</span>`;
        } else {
          out += escapeHtml(q.fromChar);
        }
      }
      el.innerHTML = out;
      if (complete === queue.length) {
        el.textContent = target;
        if (done) done();
        return;
      }
      frame++;
      el._ena_raf = requestAnimationFrame(tick);
    }
    tick();
  }

  const HOVER_DELAY_MS = 450;
  let hoverTimer = null;

  function onEnter(e) {
    const el = e.currentTarget;
    if (!enabled) return;
    cancelHide();
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      el.classList.add("ena-active");
      // inline word only flashes back to itself — no width change, no layout shift
      scrambleTo(el, el.dataset.raw);
      showTooltip(el);
    }, HOVER_DELAY_MS);
  }

  function onLeave(e) {
    clearTimeout(hoverTimer);
    e.currentTarget.classList.remove("ena-active");
    scheduleHide();
  }

  // ---- tooltip -------------------------------------------------------------
  // A plain hover tooltip auto-hides when the mouse leaves. Clicking "Ask a real
  // AI" pins it (sticky): then it stays until the close button, an outside
  // click, or Escape, so the answer doesn't vanish mid-read.
  let activeEl = null;
  let hideTimer = null;
  let sticky = false;

  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  function scheduleHide() {
    if (sticky) return;
    cancelHide();
    hideTimer = setTimeout(removeTooltip, 180); // grace period to reach the tooltip
  }

  function onDocPointerDown(e) {
    if (!activeTooltip) return;
    if (activeTooltip.contains(e.target)) return;
    if (activeEl && activeEl.contains(e.target)) return;
    removeTooltip();
  }
  function onDocKeyDown(e) {
    if (e.key === "Escape" && activeTooltip) removeTooltip();
  }

  // Called when "Ask a real AI" is clicked: lock the tooltip open.
  function pinTooltip() {
    if (sticky) return;
    sticky = true;
    cancelHide();
    if (activeTooltip) activeTooltip.classList.add("ena-sticky");
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onDocKeyDown, true);
  }

  function showTooltip(el) {
    // Re-hovering the word that already owns the tooltip? just cancel its hide.
    if (activeTooltip && activeEl === el) { cancelHide(); return; }
    removeTooltip();
    activeEl = el;

    const conf = el.dataset.confidence;
    const tip = document.createElement("div");
    tip.className = "ena-tooltip";
    tip.setAttribute("data-ena", "tooltip");
    tip.innerHTML = `
      <button class="ena-tt-close" type="button" aria-label="Close">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
        </svg>
      </button>
      <div class="ena-tt-head">
        <span class="ena-tt-raw">"${escapeHtml(el.dataset.raw)}"</span>
        <span class="ena-tt-arrow">-&gt;</span>
        <span class="ena-tt-tech">${escapeHtml(el.dataset.raw)}</span>
      </div>
      <div class="ena-tt-conf">
        <div class="ena-tt-bar"><i style="width:${conf}%"></i></div>
        <span>${conf}% hunch</span>
      </div>
      <div class="ena-tt-blurb">${escapeHtml(el.dataset.blurb)}</div>
      <button class="ena-tt-ask" type="button">Ask a real AI</button>
      <div class="ena-tt-ai" hidden></div>
    `;
    document.body.appendChild(tip);
    positionTooltip(tip, el);

    tip.querySelector(".ena-tt-close").addEventListener("click", removeTooltip);
    tip.querySelector(".ena-tt-ask").addEventListener("click", () => { pinTooltip(); askAI(el, tip); });
    tip.addEventListener("mouseenter", cancelHide);
    tip.addEventListener("mouseleave", scheduleHide);

    activeTooltip = tip;

    // decode-morph the verdict inside the tooltip (safe — no page layout shift)
    scrambleTo(tip.querySelector(".ena-tt-tech"), el.dataset.tech);
  }

  function positionTooltip(tip, el) {
    const r = el.getBoundingClientRect();
    const gap = 8;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    // default below; flip above if it would overflow the viewport bottom
    let top = window.scrollY + r.bottom + gap;
    if (r.bottom + gap + th > window.innerHeight && r.top - gap - th > 0) {
      top = window.scrollY + r.top - gap - th;
    }

    let left = window.scrollX + r.left;
    const maxLeft = window.scrollX + window.innerWidth - tw - 12;
    left = Math.min(left, maxLeft);
    left = Math.max(window.scrollX + 8, left);

    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  function removeTooltip() {
    cancelHide();
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
    sticky = false;
    if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
    if (activeEl) { activeEl.classList.remove("ena-active"); activeEl = null; }
  }

  // ---- rich context for "Ask a real AI" -----------------------------------
  // The heuristic only needs ~120 chars, but a real model does far better with
  // the page around the word. We gather this lazily (on click) from the live
  // DOM: page title + URL + nearest heading, plus ~100 words before and after
  // the word, spilling into adjacent blocks when the immediate one is short.
  const BLOCK_TAGS = new Set([
    "P", "LI", "TD", "TH", "BLOCKQUOTE", "ARTICLE", "SECTION", "ASIDE", "MAIN",
    "FIGCAPTION", "DD", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "DIV",
  ]);

  function blockAncestor(el) {
    let n = el.parentElement, last = el.parentElement;
    while (n) {
      if (BLOCK_TAGS.has(n.tagName)) return n;
      last = n;
      n = n.parentElement;
    }
    return last || el.parentElement || el;
  }

  function rangeText(setup) {
    try {
      const r = document.createRange();
      setup(r);
      return r.toString();
    } catch (_) {
      return "";
    }
  }
  const wordsOf = (s) => (s || "").trim().split(/\s+/).filter(Boolean);
  const lastWords = (s, n) => { const w = wordsOf(s); return w.slice(Math.max(0, w.length - n)).join(" "); };
  const firstWords = (s, n) => wordsOf(s).slice(0, n).join(" ");

  // Text from the start of the block up to the mark, then back through previous
  // sibling blocks until we have ~n words. Keeps the LAST n (closest to word).
  function gatherBefore(block, el, n) {
    let acc = rangeText((r) => { r.setStart(block, 0); r.setEndBefore(el); });
    let prev = block.previousElementSibling, hops = 0;
    while (wordsOf(acc).length < n && prev && hops < 6) {
      acc = (prev.textContent || "") + " " + acc;
      prev = prev.previousElementSibling;
      hops++;
    }
    return lastWords(acc, n);
  }
  // Mirror of gatherBefore, walking forward; keeps the FIRST n words.
  function gatherAfter(block, el, n) {
    let acc = rangeText((r) => { r.setStartAfter(el); r.setEnd(block, block.childNodes.length); });
    let next = block.nextElementSibling, hops = 0;
    while (wordsOf(acc).length < n && next && hops < 6) {
      acc = acc + " " + (next.textContent || "");
      next = next.nextElementSibling;
      hops++;
    }
    return firstWords(acc, n);
  }

  // Closest heading earlier in the document than the mark.
  function nearestHeading(el) {
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      let sib = node.previousElementSibling;
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent.trim();
        const h = sib.querySelector && sib.querySelector("h1,h2,h3,h4,h5,h6");
        if (h) return h.textContent.trim();
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function buildAskPayload(el) {
    const block = blockAncestor(el);
    return {
      type: "ENA_ASK_AI",
      term: el.dataset.raw,
      pageTitle: (document.title || "").slice(0, 200),
      pageUrl: (location.href || "").slice(0, 300),
      heading: nearestHeading(el).slice(0, 200),
      before: gatherBefore(block, el, 100),
      after: gatherAfter(block, el, 100),
    };
  }

  function askAI(el, tip) {
    const out = tip.querySelector(".ena-tt-ai");
    const btn = tip.querySelector(".ena-tt-ask");
    out.hidden = false;
    out.textContent = "Asking...";
    btn.disabled = true;

    if (!ctxAlive()) {
      teardown();
      out.textContent = "Extension was reloaded. Refresh this page to re-enable.";
      btn.disabled = true;
      return;
    }

    try {
      chrome.runtime.sendMessage(
        buildAskPayload(el),
        (resp) => {
          // The callback runs later; the context can die in between.
          if (chrome.runtime.lastError) {
            out.textContent = "Error: " + chrome.runtime.lastError.message;
            btn.disabled = false;
            return;
          }
          if (!resp || resp.error) {
            out.textContent = "Error: " + ((resp && resp.error) || "No response");
            btn.disabled = false;
            return;
          }
          out.textContent = resp.answer;
          btn.disabled = false;
        }
      );
    } catch (_) {
      // Synchronous "Extension context invalidated" throw.
      teardown();
      out.textContent = "Extension was reloaded. Refresh this page to re-enable.";
      btn.disabled = true;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // ---- live pages ----------------------------------------------------------
  let pending = null;
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    if (!ctxAlive()) { teardown(); return; }
    const roots = [];
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1) roots.push(node);
        else if (node.nodeType === 3 && node.parentElement) roots.push(node.parentElement);
      }
    }
    if (!roots.length) return;
    clearTimeout(pending);
    pending = setTimeout(() => roots.forEach((r) => r.isConnected && scanRoot(r)), 400);
  });

  // ---- wiring --------------------------------------------------------------
  function start() {
    chrome.storage.local.get({ enabled: true }, (cfg) => {
      enabled = cfg.enabled !== false;
      if (!enabled) return;
      scanRoot(document.body);
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) scanRoot(document.body);
    }
  });

  // expose a tiny stat hook for the popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "ENA_GET_STATS") {
      sendResponse({ count: matchCount, enabled });
    }
    return true;
  });

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
