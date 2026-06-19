/**
 * everything-not-ai — background service worker
 *
 * The only job here is the optional "Ask a real AI" call. We proxy the request
 * through the worker so the page never touches the API key, and so the call
 * isn't blocked by the page's own CSP.
 *
 * Uses OpenRouter's OpenAI-compatible chat-completions endpoint with whatever
 * free model the user picked. The user supplies their own key (stored locally).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/owl-alpha";

// The models people plug in here are small, free, and easily distracted. We
// don't hand them our own guess or a multiple-choice list (that just makes them
// echo us). Instead we keep them independent but disciplined: a clear analytical
// task, a hard two-line format, worked examples for tone, and a low temperature
// so a weak model stops rambling and commits to an answer.
const SYSTEM_PROMPT = [
  "You are a skeptical senior engineer who sees straight through AI marketing.",
  "You are shown a snippet of webpage text that uses an AI buzzword. Work out what",
  "is ACTUALLY running under the hood and name it specifically.",
  "",
  "Be concrete - name the real technique or model family, for example:",
  "a fine-tuned LLM (GPT/Llama-style), a CNN image classifier, gradient-boosted",
  "trees on tabular data, a collaborative-filtering recommender, speech-to-text",
  "(ASR), a thin wrapper over someone else's API, or just regex and if-statements.",
  "If the text only makes grand claims with no real capability, say that plainly.",
  "",
  "Output EXACTLY two short plain-text lines, nothing else:",
  "Real tech: <specific technology or model family>",
  "Why: <one concrete sentence grounded in the text, dry tone ok>",
  "",
  "Be decisive. Never hedge with 'it could be many things'. Never repeat the",
  "marketing back. No preamble, no markdown, no bullet lists.",
].join("\n");

// Worked examples lock the format and tone. They teach HOW to answer; the model
// still has to analyze each new snippet itself.
const FEWSHOT = [
  {
    role: "user",
    content:
      'Buzzword: "AI"\n' +
      'Text: """Meet your AI assistant - it drafts emails, summarizes documents, and answers questions in plain language."""',
  },
  {
    role: "assistant",
    content:
      "Real tech: A large language model (a fine-tuned GPT/Llama-style transformer).\n" +
      "Why: Drafting, summarizing, and answering in natural language is text-in, text-out autocomplete.",
  },
  {
    role: "user",
    content:
      'Buzzword: "AI"\n' +
      'Text: """Our proprietary, revolutionary AI is a groundbreaking breakthrough we built from the ground up."""',
  },
  {
    role: "assistant",
    content:
      "Real tech: Most likely a thin wrapper over a third-party LLM.\n" +
      'Why: Pure novelty claims with no described capability - the "proprietary" part is usually the prompt.',
  },
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "ENA_ASK_AI") {
    handleAsk(msg).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err && err.message ? err.message : err) });
    });
    return true;
  }
});

async function handleAsk({ term, context }) {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) {
    return { error: "No OpenRouter API key set. Open the extension popup to add one." };
  }

  const userPrompt =
    `Buzzword: "${term}"\n` +
    `Text: """${(context || "").slice(0, 600)}"""`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/aryadhruv/everythings-not-ai",
      "X-Title": "everythings-not-ai",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 120,
      temperature: 0.3, // low: this is analysis, not creative writing - stop the rambling
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...FEWSHOT,
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `OpenRouter ${res.status}: ${text.slice(0, 160) || res.statusText}` };
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) return { error: "Empty response from model." };
  return { answer };
}
