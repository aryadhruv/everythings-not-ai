/**
 * everythings
 * Plain Node, zero dependencies. Run with:
 *   node test/heuristics.test.js     (or)   npm test
 *
 * Covers two things:
 *   1. findMatches — does it catch buzzwords AND avoid false positives?
 *   2. guessTech   — does the right real-tech verdict win for given context?
 */

const { findMatches, guessTech } = require("../src/heuristics.js");

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) {
    passed++;
    console.log("  \x1b[32mPASS\x1b[0m " + name);
  } else {
    failed++;
    failures.push(name + (detail ? "  ::  " + detail : ""));
    console.log("  \x1b[31mFAIL\x1b[0m " + name + (detail ? "  :: " + detail : ""));
  }
}

// helper: list of matched raw strings in a text
const rawsOf = (t) => findMatches(t).map((h) => h.raw);
// helper: verdict for the first match in a text
function verdictFor(t) {
  const m = findMatches(t);
  if (!m.length) return null;
  const h = m[0];
  const ctx = t.slice(Math.max(0, h.start - 120), h.end + 120);
  return guessTech(ctx).verdict;
}

console.log("\n\x1b[1mfindMatches — detection\x1b[0m");
ok(rawsOf("Our AI helps you.").includes("AI"), "matches bare 'AI'");
ok(rawsOf("Powered by A.I. today").includes("A.I."), "matches 'A.I.'");
ok(rawsOf("uses Artificial Intelligence").length === 1, "matches 'Artificial Intelligence' as one hit");
ok(rawsOf("built on machine learning").join() === "machine learning", "matches 'machine learning'");
ok(rawsOf("a deep learning neural network").length === 2, "matches 'deep learning' + 'neural network'");
ok(rawsOf("runs on GPT-4").join() === "GPT-4", "matches 'GPT-4'");
ok(rawsOf("our LLM and LLMs").length === 2, "matches 'LLM' and 'LLMs'");
ok(rawsOf("AI-powered search").includes("AI-powered"), "matches 'AI-powered' (and prefers it over bare 'AI')");
ok(!rawsOf("AI-powered search").includes("AI"), "does NOT double-count 'AI' inside 'AI-powered'");

console.log("\n\x1b[1mfindMatches — false-positive guarding\x1b[0m");
ok(rawsOf("Again, the captain said email is fine.").length === 0, "ignores 'again/captain/said/email' (lowercase 'ai')");
ok(rawsOf("We maintain our gains and remain plain.").length === 0, "ignores 'maintain/gains/remain/plain'");
ok(rawsOf("The chairman paid the bill.").length === 0, "ignores 'chairman/paid'");

console.log("\n\x1b[1mguessTech — verdict routing\x1b[0m");
ok(verdictFor("Our AI camera detects faces and recognizes objects in every photo.") === "Computer Vision", "image/detect/face context → Computer Vision", verdictFor("Our AI camera detects faces and recognizes objects in every photo."));
ok(verdictFor("The AI chatbot assistant can write and summarize your text.") === "Large Language Model", "chat/write/summarize context → LLM", verdictFor("The AI chatbot assistant can write and summarize your text."));
ok(verdictFor("AI voice assistant transcribes your calls from audio.") === "Speech Recognition / TTS", "voice/transcribe/audio context → Speech", verdictFor("AI voice assistant transcribes your calls from audio."));
ok(verdictFor("Our AI recommends personalized suggestions in your feed.") === "Recommender System", "recommend/personalize/feed context → Recommender", verdictFor("Our AI recommends personalized suggestions in your feed."));
ok(verdictFor("AI predicts churn and scores fraud risk for analytics.") === "Predictive ML / Statistics", "predict/churn/fraud/risk context → Predictive ML", verdictFor("AI predicts churn and scores fraud risk for analytics."));
ok(verdictFor("AI search ranking uses semantic embeddings for relevance.") === "Search / Ranking", "search/ranking/embeddings context → Search", verdictFor("AI search ranking uses semantic embeddings for relevance."));
ok(verdictFor("Powered by AI.") === "Probably marketing", "no signal → 'Probably marketing'", verdictFor("Powered by AI."));

console.log("\n\x1b[1mguessTech — confidence\x1b[0m");
{
  const strong = guessTech("ai detects faces objects images photos camera visual recognition");
  const weak = guessTech("powered by ai");
  ok(strong.confidence > weak.confidence, "more signal words → higher confidence", `strong=${strong.confidence} weak=${weak.confidence}`);
  ok(weak.confidence <= 0.3, "no-signal confidence stays low", String(weak.confidence));
}

console.log("\n" + "─".repeat(40));
console.log(`\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failed) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  failures.forEach((f) => console.log("  • " + f));
  process.exit(1);
}
