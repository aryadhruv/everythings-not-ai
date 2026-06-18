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

  // matcher lives in heuristics.js so tests + content share one implementation
  const findMatches = ENA.findMatches;

  // ---- DOM walking ---------------------------------------------------------
  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      if (el.classList && el.classList.contains(MARK_CLASS)) return true;
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
    const guess = ENA.guessTech(context);
    const span = document.createElement("span");
    span.className = MARK_CLASS;
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

  function onEnter(e) {
    const el = e.currentTarget;
    if (!enabled) return;
    cancelHide();
    el.classList.add("ena-active");
    // Inline word only FLASHES (scrambles then settles back to itself) so its
    // width never changes — no layout shift, no enter/leave oscillation. The
    // real "AI -> verdict" reveal happens inside the tooltip below.
    scrambleTo(el, el.dataset.raw);
    showTooltip(el);
  }

  function onLeave(e) {
    e.currentTarget.classList.remove("ena-active");
    scheduleHide();
  }

  // ---- tooltip -------------------------------------------------------------
  let activeEl = null;
  let hideTimer = null;

  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(removeTooltip, 180); // grace period to reach the tooltip
  }

  function showTooltip(el) {
    // Re-hovering the same word? keep the existing tooltip, just cancel its hide.
    if (activeTooltip && activeEl === el) { cancelHide(); return; }
    removeTooltip();
    activeEl = el;

    const conf = el.dataset.confidence;
    const tip = document.createElement("div");
    tip.className = "ena-tooltip";
    tip.innerHTML = `
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

    tip.addEventListener("mouseenter", cancelHide);
    tip.addEventListener("mouseleave", scheduleHide);
    tip.querySelector(".ena-tt-ask").addEventListener("click", () => askAI(el, tip));

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
    if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
    if (activeEl) { activeEl.classList.remove("ena-active"); activeEl = null; }
  }

  function askAI(el, tip) {
    const out = tip.querySelector(".ena-tt-ai");
    const btn = tip.querySelector(".ena-tt-ask");
    out.hidden = false;
    out.textContent = "Asking...";
    btn.disabled = true;
    chrome.runtime.sendMessage(
      { type: "ENA_ASK_AI", term: el.dataset.raw, context: el.dataset.context },
      (resp) => {
        btn.disabled = false;
        if (chrome.runtime.lastError) {
          out.textContent = "Error: " + chrome.runtime.lastError.message;
          return;
        }
        if (!resp || resp.error) {
          out.textContent = "Error: " + ((resp && resp.error) || "No response");
          return;
        }
        out.textContent = resp.answer;
      }
    );
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
