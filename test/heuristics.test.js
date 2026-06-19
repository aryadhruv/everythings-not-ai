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
// helper: list of canonical labels in a text (raw may carry a plural/suffix)
const labelsOf = (t) => findMatches(t).map((h) => h.label);
// helper: verdict for the first match in a text (context only, no term prior)
function verdictFor(t) {
  const m = findMatches(t);
  if (!m.length) return null;
  const h = m[0];
  const ctx = t.slice(Math.max(0, h.start - 120), h.end + 120);
  return guessTech(ctx).verdict;
}
// helper: verdict for the first match, feeding its label as the term prior
function verdictWithPrior(t) {
  const m = findMatches(t);
  if (!m.length) return null;
  const h = m[0];
  const ctx = t.slice(Math.max(0, h.start - 120), h.end + 120);
  return guessTech(ctx, h.label).verdict;
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
ok(rawsOf("our agentic AI workflow").includes("agentic AI"), "matches 'agentic AI'");
ok(labelsOf("deploy AI agents today").includes("AI agent"), "matches 'AI agent' (plural raw)");
ok(labelsOf("a fleet of autonomous agents").includes("autonomous agent"), "matches 'autonomous agent' (plural raw)");
ok(labelsOf("built on a multi-agent system").includes("multi-agent"), "matches 'multi-agent'");
ok(rawsOf("ask ChatGPT or use Copilot").length === 2, "matches 'ChatGPT' and 'Copilot'");
ok(rawsOf("powered by RAG over your docs").includes("RAG"), "matches 'RAG' (uppercase only)");
ok(rawsOf("our NLP pipeline").includes("NLP"), "matches 'NLP'");
ok(labelsOf("a transformer-based encoder").includes("transformer"), "matches 'transformer-based'");

console.log("\n\x1b[1mfindMatches — false-positive guarding\x1b[0m");
ok(rawsOf("Again, the captain said email is fine.").length === 0, "ignores 'again/captain/said/email' (lowercase 'ai')");
ok(rawsOf("We maintain our gains and remain plain.").length === 0, "ignores 'maintain/gains/remain/plain'");
ok(rawsOf("The chairman paid the bill.").length === 0, "ignores 'chairman/paid'");
ok(rawsOf("On average we drag the rag across the floor.").length === 0, "ignores 'average/drag/rag' (RAG is uppercase-only)");
ok(rawsOf("co-pilot in the cockpit").length === 0, "ignores lowercase 'co-pilot' (Copilot is the product)");

console.log("\n\x1b[1mguessTech — verdict routing\x1b[0m");
ok(verdictFor("Our AI camera detects faces and recognizes objects in every photo.") === "Computer Vision", "image/detect/face context → Computer Vision", verdictFor("Our AI camera detects faces and recognizes objects in every photo."));
ok(verdictFor("The AI chatbot assistant can write and summarize your text.") === "Large Language Model", "chat/write/summarize context → LLM", verdictFor("The AI chatbot assistant can write and summarize your text."));
ok(verdictFor("AI voice assistant transcribes your calls from audio.") === "Speech Recognition / TTS", "voice/transcribe/audio context → Speech", verdictFor("AI voice assistant transcribes your calls from audio."));
ok(verdictFor("Our AI recommends personalized suggestions in your feed.") === "Recommender System", "recommend/personalize/feed context → Recommender", verdictFor("Our AI recommends personalized suggestions in your feed."));
ok(verdictFor("AI predicts churn and scores fraud risk for analytics.") === "Predictive ML / Statistics", "predict/churn/fraud/risk context → Predictive ML", verdictFor("AI predicts churn and scores fraud risk for analytics."));
ok(verdictFor("AI search ranking uses semantic embeddings for relevance.") === "Search / Ranking", "search/ranking/embeddings context → Search", verdictFor("AI search ranking uses semantic embeddings for relevance."));
ok(verdictFor("Powered by AI.") === "Probably marketing", "no signal → 'Probably marketing'", verdictFor("Powered by AI."));

console.log("\n\x1b[1mguessTech — extended coverage (agents + new categories)\x1b[0m");
ok(verdictFor("Our agentic AI autonomously uses tools to complete multi-step tasks.") === "LLM Agent (loop + tools)", "agentic/tools/multi-step context → LLM Agent", verdictFor("Our agentic AI autonomously uses tools to complete multi-step tasks."));
ok(verdictFor("This AI image generator creates artwork with stable diffusion.") === "Generative Media (Diffusion)", "image-generator/diffusion context → Generative Media", verdictFor("This AI image generator creates artwork with stable diffusion."));
ok(verdictFor("An AI copilot autocompletes your code and refactors functions.") === "Code Generation", "copilot/autocomplete/refactor context → Code Generation", verdictFor("An AI copilot autocompletes your code and refactors functions."));
ok(verdictFor("Our AI translates documents across language pairs in real time.") === "Machine Translation", "translate/language-pair context → Machine Translation", verdictFor("Our AI translates documents across language pairs in real time."));
ok(verdictFor("AI extracts data from scanned invoices and handwritten receipts.") === "Document AI / OCR", "invoice/handwritten/extract context → Document AI", verdictFor("AI extracts data from scanned invoices and handwritten receipts."));
ok(verdictFor("Our AI flags toxicity and runs sentiment moderation on every post.") === "Text Classification", "toxicity/sentiment/moderation context → Text Classification", verdictFor("Our AI flags toxicity and runs sentiment moderation on every post."));
ok(verdictFor("AI powers our self-driving cars with lidar and motion planning.") === "Robotics / Autonomous Systems", "self-driving/lidar context → Robotics", verdictFor("AI powers our self-driving cars with lidar and motion planning."));
ok(verdictFor("Our proprietary, revolutionary AI is a groundbreaking breakthrough built from the ground up.") === "Just a GPT wrapper", "proprietary/revolutionary/breakthrough hype → GPT wrapper", verdictFor("Our proprietary, revolutionary AI is a groundbreaking breakthrough built from the ground up."));
ok(verdictFor("Our proprietary AI camera detects faces and recognizes objects in every photo.") === "Computer Vision", "real CV signal still beats 'proprietary' hype", verdictFor("Our proprietary AI camera detects faces and recognizes objects in every photo."));

console.log("\n\x1b[1mguessTech — label priors (term sharpens thin context)\x1b[0m");
ok(verdictWithPrior("Powered by GPT.") === "Large Language Model", "bare 'GPT' with no context → LLM (via prior)", verdictWithPrior("Powered by GPT."));
ok(verdictWithPrior("Built with AI agents.") === "LLM Agent (loop + tools)", "'AI agent' with no context → LLM Agent (via prior)", verdictWithPrior("Built with AI agents."));
ok(verdictWithPrior("Now with computer vision.") === "Computer Vision", "'computer vision' term → Computer Vision (via prior)", verdictWithPrior("Now with computer vision."));
ok(verdictWithPrior("Generated with diffusion models.") === "Generative Media (Diffusion)", "'diffusion model' term → Generative Media (via prior)", verdictWithPrior("Generated with diffusion models."));
ok(guessTech("Powered by GPT.").verdict === "Probably marketing", "same thin context WITHOUT the term prior → marketing", guessTech("Powered by GPT.").verdict);
ok(guessTech("The AI chatbot can write and summarize your text.", "AI agent").verdict === "Large Language Model", "strong LLM context still beats an 'agent' prior", guessTech("The AI chatbot can write and summarize your text.", "AI agent").verdict);

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
