/* everything-not-ai — popup logic */

const $ = (id) => document.getElementById(id);

// Load saved state.
chrome.storage.local.get(
  { enabled: true, apiKey: "", model: "meta-llama/llama-3.3-70b-instruct:free" },
  (cfg) => {
    $("enabled").checked = cfg.enabled !== false;
    $("apiKey").value = cfg.apiKey || "";
    $("model").value = cfg.model;
  }
);

// Live match count from the active tab's content script.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "ENA_GET_STATS" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      $("stat").textContent = "no scannable page here";
      return;
    }
    $("stat").textContent = `${resp.count} buzzword${resp.count === 1 ? "" : "s"} found`;
  });
});

// Toggle scanning.
$("enabled").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});

// Save API key + model.
$("save").addEventListener("click", () => {
  chrome.storage.local.set(
    { apiKey: $("apiKey").value.trim(), model: $("model").value },
    () => {
      const tag = $("saved");
      tag.hidden = false;
      setTimeout(() => (tag.hidden = true), 1500);
    }
  );
});
