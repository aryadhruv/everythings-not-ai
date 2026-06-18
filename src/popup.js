/* everything-not-ai — popup logic */

const $ = (id) => document.getElementById(id);

// Show/hide the custom-model input depending on the dropdown.
function syncCustomField() {
  $("customField").hidden = $("model").value !== "__custom__";
}

// Load saved state.
chrome.storage.local.get(
  { enabled: true, apiKey: "", model: "openrouter/owl-alpha" },
  (cfg) => {
    $("enabled").checked = cfg.enabled !== false;
    $("apiKey").value = cfg.apiKey || "";
    const select = $("model");
    // A stored value that matches a preset selects it; anything else is treated
    // as a custom model slug and drops into the "Custom model…" input.
    if ([...select.options].some((o) => o.value === cfg.model && o.value !== "__custom__")) {
      select.value = cfg.model;
    } else if (cfg.model) {
      select.value = "__custom__";
      $("customModel").value = cfg.model;
    } else {
      select.selectedIndex = 0;
    }
    syncCustomField();
  }
);

$("model").addEventListener("change", syncCustomField);

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
  const select = $("model");
  const model =
    select.value === "__custom__"
      ? $("customModel").value.trim()
      : select.value;
  chrome.storage.local.set(
    { apiKey: $("apiKey").value.trim(), model },
    () => {
      const tag = $("saved");
      tag.hidden = false;
      setTimeout(() => (tag.hidden = true), 1500);
    }
  );
});
