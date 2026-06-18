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

const SYSTEM_PROMPT =
  "You are a skeptical engineer who cuts through AI marketing buzzwords. " +
  "Given a snippet of webpage text that uses an AI buzzword, name the SINGLE " +
  "most likely real technology behind it (e.g. 'logistic regression', " +
  "'a fine-tuned LLM', 'CNN image classifier', 'a pile of if-statements'). " +
  "Reply in 1-2 short sentences, plain text, no preamble, slightly dry humor allowed.";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "ENA_ASK_AI") {
    handleAsk(msg).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err && err.message ? err.message : err) });
    });
    return true; // keep the message channel open for the async response
  }
});

async function handleAsk({ term, context }) {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) {
    return { error: "No OpenRouter API key set. Open the extension popup to add one." };
  }

  const userPrompt =
    `Buzzword used: "${term}"\n` +
    `Surrounding text: """${(context || "").slice(0, 600)}"""\n` +
    `What's the real tech most likely behind it?`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter likes these for attribution; harmless if ignored.
      "HTTP-Referer": "https://github.com/everything-not-ai",
      "X-Title": "everything-not-ai",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 160,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
