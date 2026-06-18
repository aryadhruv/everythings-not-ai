/**
 * Standalone API smoke-test
 *
 * Usage:
 *   OPENROUTER_KEY=sk-or-v1-... node test/test-api.js
 *   OPENROUTER_KEY=sk-or-v1-... MODEL=google/gemma-4-31b-it:free node test/test-api.js
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL  = "openrouter/owl-alpha";

const SYSTEM_PROMPT =
  "You are a skeptical engineer who cuts through AI marketing buzzwords. " +
  "Given a snippet of webpage text that uses an AI buzzword, name the SINGLE " +
  "most likely real technology behind it (e.g. 'logistic regression', " +
  "'a fine-tuned LLM', 'CNN image classifier', 'a pile of if-statements'). " +
  "Reply in 1-2 short sentences, plain text, no preamble, slightly dry humor allowed.";

// ---- test cases ------------------------------------------------------------
const CASES = [
  {
    term: "AI",
    context: "Our AI-powered camera detects faces and recognizes objects in every photo.",
  },
  {
    term: "AI",
    context: "The chatbot assistant uses generative AI to write and summarize your emails.",
  },
  {
    term: "AI",
    context: "Powered by AI.",
  },
];

async function run() {
  const apiKey = process.env.OPENROUTER_KEY;
  const model  = process.env.MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    console.error("Missing OPENROUTER_KEY env var.");
    console.error("  Usage: OPENROUTER_KEY=sk-or-v1-... node test/test-api.js");
    process.exit(1);
  }

  console.log(`Model : ${model}`);
  console.log(`URL   : ${OPENROUTER_URL}`);
  console.log("─".repeat(60));

  for (const { term, context } of CASES) {
    const userPrompt =
      `Buzzword used: "${term}"\n` +
      `Surrounding text: """${context.slice(0, 600)}"""\n` +
      `What's the real tech most likely behind it?`;

    console.log(`\nTERM   : "${term}"`);
    console.log(`CONTEXT: ${context}`);
    process.stdout.write("ANSWER : ");

    let res;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/everything-not-ai",
          "X-Title": "everything-not-ai",
        },
        body: JSON.stringify({
          model,
          max_tokens: 160,
          temperature: 0.6,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: userPrompt },
          ],
        }),
      });
    } catch (err) {
      console.log(`NETWORK ERROR: ${err.message}`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`HTTP ${res.status} ${res.statusText}`);
      console.log("RESPONSE BODY:", body.slice(0, 400));
      continue;
    }

    const data = await res.json();
    console.log("RAW JSON:", JSON.stringify(data, null, 2));
    const answer = data?.choices?.[0]?.message?.content?.trim();
    console.log("\nPARSED :", answer ?? "(empty)");
    console.log("─".repeat(60));
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
