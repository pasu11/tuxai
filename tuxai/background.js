// TuxAI - background service worker / event page.
// Handles side panel behavior, tool context menu, Alt+select quick picker,
// and panel open/close state for browsers that can toggle an open panel.

import {
  getEffectiveTools,
  TOOL_STORAGE_KEYS,
} from "./lib/tools.js";

const api = typeof browser !== "undefined" ? browser : chrome;

const ROOT_MENU_ID = "penguin-tool-root";
const TOOL_PREFIX = "penguin-tool::";
const PENDING_KEY = "penguin_pending_run";
const PANEL_STATE_KEY = "penguin_panel_state";
const SELECTED_TEXT_KEY = "penguin_selected_text";

const SERVER_DEFAULTS = {
  ollama: { url: "http://localhost:11434", model: "" },
  koboldcpp: { url: "http://localhost:5001", model: "local-model" },
  llamacpp: { url: "http://localhost:8080", model: "local-model" },
  other: { url: "", model: "" },
};

const CLOUD_DEFAULTS = {
  deepseek: {
    kind: "openai",
    url: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  openai: {
    kind: "openai",
    url: "https://api.openai.com",
    model: "gpt-4o-mini",
  },
  anthropic: {
    kind: "anthropic",
    url: "https://api.anthropic.com",
    model: "",
  },
  gemini: {
    kind: "gemini",
    url: "https://generativelanguage.googleapis.com",
    model: "",
  },
  mistral: {
    kind: "openai",
    url: "https://api.mistral.ai",
    model: "",
  },
  cohere: {
    kind: "cohere",
    url: "https://api.cohere.com",
    model: "",
  },
};

const BUILT_IN_CLOUD_PROVIDERS = [
  "deepseek",
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "cohere",
];

const CUSTOM_CLOUD_PROVIDERS_KEY = "penguin_custom_cloud_providers";

function isBuiltInCloudProvider(provider) {
  return BUILT_IN_CLOUD_PROVIDERS.includes(provider);
}

async function getCustomCloudProviders() {
  try {
    const result = await api.storage.local.get([CUSTOM_CLOUD_PROVIDERS_KEY]);
    const list = Array.isArray(result[CUSTOM_CLOUD_PROVIDERS_KEY])
      ? result[CUSTOM_CLOUD_PROVIDERS_KEY]
      : [];
    return list.filter(
      (provider) => provider && provider.id && provider.name && provider.url
    );
  } catch (error) {
    return [];
  }
}

async function getCloudProviderDefaults(provider) {
  if (BUILT_IN_CLOUD_PROVIDERS.includes(provider)) {
    return CLOUD_DEFAULTS[provider];
  }
  const customProviders = await getCustomCloudProviders();
  const custom = customProviders.find((item) => item.id === provider);
  return custom
    ? { kind: "openai", url: custom.url || "", model: "" }
    : { kind: "openai", url: "", model: "" };
}

async function getCloudProviderKind(provider) {
  return (await getCloudProviderDefaults(provider)).kind || "openai";
}

async function getCloudProviderLabel(provider) {
  const labels = {
    deepseek: "DeepSeek",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    gemini: "Google Gemini",
    mistral: "Mistral",
    cohere: "Cohere",
  };
  if (labels[provider]) return labels[provider];
  const customProviders = await getCustomCloudProviders();
  const custom = customProviders.find((item) => item.id === provider);
  return custom ? custom.name : provider;
}

if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("TuxAI:", error));
}

let panelOpen = false;

async function setPanelOpen(open) {
  if (panelOpen === open) return;
  panelOpen = open;
  try {
    await api.storage.local.set({
      [PANEL_STATE_KEY]: { open, ts: Date.now() },
    });
  } catch (error) {
    // Storage writes are best-effort here.
  }
}

try {
  api.storage.local.get([PANEL_STATE_KEY]).then((result) => {
    const state = result && result[PANEL_STATE_KEY];
    panelOpen = !!(state && state.open);
  });
} catch (error) {
  // Ignore storage init errors.
}

async function rebuildMenus() {
  try {
    await api.contextMenus.removeAll();
    const tools = await getEffectiveTools();

    await api.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "TuxAI",
      contexts: ["selection"],
    });

    for (const tool of tools) {
      await api.contextMenus.create({
        id: TOOL_PREFIX + tool.id,
        parentId: ROOT_MENU_ID,
        title: tool.name,
        contexts: ["selection"],
      });
    }
  } catch (error) {
    console.error("TuxAI: failed to rebuild menus", error);
  }
}

api.runtime.onInstalled.addListener(() => {
  rebuildMenus();
});

api.runtime.onStartup.addListener(() => {
  rebuildMenus();
});

if (
  !api.sidePanel &&
  api.sidebarAction &&
  api.sidebarAction.open &&
  api.action &&
  api.action.onClicked
) {
  api.action.onClicked.addListener(() => {
    api.sidebarAction.open().catch(() => {});
  });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.values(TOOL_STORAGE_KEYS);
  if (keys.some((key) => changes[key])) rebuildMenus();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "penguin_panel_opened") {
    setPanelOpen(true);
    return;
  }

  if (message.type === "penguin_panel_closed") {
    setPanelOpen(false);
    return;
  }

  if (message.type === "penguin_get_tools") {
    getEffectiveTools()
      .then((tools) => {
        sendResponse(
          tools.map((tool) => ({ id: tool.id, name: tool.name }))
        );
      })
      .catch(() => sendResponse([]));
    return true;
  }

  if (message.type === "penguin_run_selected") {
    const toolId = message.toolId;
    const text = String(message.text || "").trim();
    const tabId =
      sender && sender.tab && typeof sender.tab.id === "number"
        ? sender.tab.id
        : undefined;

    if (!toolId || !text) {
      try {
        sendResponse({ ok: false });
      } catch (error) {
        // No-op.
      }
      return;
    }

    openPanelIfClosed(tabId);
    deliverToPanel(tabId, toolId, text);

    try {
      sendResponse({ ok: true });
    } catch (error) {
      // No-op.
    }
    return;
  }

  if (message.type === "penguin_selected_text") {
    const text = String(message.text || "").trim();
    const tabId =
      sender && sender.tab && typeof sender.tab.id === "number"
        ? sender.tab.id
        : undefined;

    if (!text) return;

    deliverSelectedText(tabId, text);
    return;
  }

  if (message.type === "penguin_clear_selected_text") {
    try {
      api.storage.local.remove([SELECTED_TEXT_KEY]);
    } catch (error) {
      // No-op.
    }
    try {
      api.runtime
        .sendMessage({ type: "penguin_clear_selected_text" })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }
    return;
  }

  if (message.type === "penguin_popup_run_tool") {
    const toolId = message.toolId;
    const text = String(message.text || "").trim();
    if (!toolId || !text) {
      try {
        sendResponse({ ok: false, error: "Missing tool or selected text." });
      } catch (error) {
        // No-op.
      }
      return;
    }

    runPopupToolRequest(toolId, text)
      .then((result) => {
        try {
          sendResponse(result);
        } catch (error) {
          // No-op.
        }
      })
      .catch((error) => {
        const message = error && error.message ? error.message : String(error);
        try {
          sendResponse({ ok: false, error: message });
        } catch (sendError) {
          // No-op.
        }
      });
    return true;
  }

  if (message.type === "penguin_popup_speak") {
    const text = String(message.text || "").trim();
    if (!text) {
      try {
        sendResponse({ ok: false, error: "No text to speak." });
      } catch (error) {
        // No-op.
      }
      return;
    }

    speakViaTts(text)
      .then((result) => {
        try {
          sendResponse(result);
        } catch (error) {
          // No-op.
        }
      })
      .catch((error) => {
        const msg = error && error.message ? error.message : String(error);
        try {
          sendResponse({ ok: false, error: msg });
        } catch (sendError) {
          // No-op.
        }
      });
    return true;
  }

  if (message.type === "penguin_notify") {
    // Sidebar uses this only to show a system message when it is open.
    try {
      api.storage.local.set({
        penguin_notice: {
          message: String(message.message || ""),
          ts: Date.now(),
        },
      });
    } catch (error) {
      // No-op.
    }
  }
});

async function getSelectionText(tab, info) {
  if (info && info.selectionText) return info.selectionText;
  if (!tab || tab.id == null) return "";
  try {
    const results = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection();
        return selection ? selection.toString() : "";
      },
    });
    return (results && results[0] && results[0].result) || "";
  } catch (error) {
    return "";
  }
}

async function runPopupToolRequest(toolId, text) {
  const tools = await getEffectiveTools();
  const tool = tools.find((item) => item.id === toolId);
  if (!tool) {
    return { ok: false, error: `Tool "${toolId}" is no longer available.` };
  }

  const settings = await api.storage.local.get([
    "penguin_mode",
    "penguin_server_type",
    "cloud_provider",
  ]);

  const mode = settings.penguin_mode || "server";
  const messages = [
    { role: "system", content: tool.prompt },
    { role: "user", content: text },
  ];

  let config;
  let label = "";

  if (mode === "server") {
    const type = settings.penguin_server_type || "ollama";
    const defaults = SERVER_DEFAULTS[type];
    if (!defaults) {
      return { ok: false, error: `Unknown local backend: ${type}` };
    }

    const keys = [`server_url_${type}`, `server_model_${type}`];
    const stored = await api.storage.local.get(keys);
    const baseUrl = (
      stored[keys[0]] || defaults.url
    ).trim().replace(/\/+$/, "");
    const storedModel = stored[keys[1]] || defaults.model;
    const model =
      type === "ollama"
        ? storedModel
        : storedModel || "local-model";

    if (!baseUrl) {
      return { ok: false, error: "Local server endpoint URL is not set." };
    }
    if (!model) {
      return { ok: false, error: "Model name is required for Ollama endpoints." };
    }

    const backendLabel =
      type === "ollama"
        ? "Ollama"
        : type === "koboldcpp"
          ? "kobold.cpp"
          : type === "llamacpp"
            ? "llama.cpp"
            : "Other";
    label = `${backendLabel} · ${model}`;

    if (type === "ollama") {
      config = {
        kind: "ollama",
        url: `${baseUrl}/api/chat`,
        headers: { "Content-Type": "application/json" },
        body: { model, messages, stream: false },
      };
    } else {
      config = {
        kind: "openai",
        url: `${baseUrl}/v1/chat/completions`,
        headers: { "Content-Type": "application/json" },
        body: { model, messages, stream: false },
      };
    }
  } else {
    const provider = settings.cloud_provider || "deepseek";
    const defaults = await getCloudProviderDefaults(provider);
    const keys = [
      `cloud_api_url_${provider}`,
      `cloud_api_key_${provider}`,
      `cloud_model_${provider}`,
    ];
    const stored = await api.storage.local.get(keys);
    const baseUrl = (
      stored[keys[0]] || defaults.url
    ).trim().replace(/\/+$/, "");
    const apiKey = String(stored[keys[1]] || "").trim();
    const model = stored[keys[2]] || defaults.model;

    if (!baseUrl) {
      return { ok: false, error: "Cloud API URL is not set." };
    }
    if (!apiKey) {
      return { ok: false, error: "Cloud API key is not set." };
    }
    if (!model) {
      return { ok: false, error: "Cloud model is not set." };
    }

    const providerName = await getCloudProviderLabel(provider);
    label = `${providerName} · ${model}`;
    const kind = await getCloudProviderKind(provider);

    if (kind === "anthropic") {
      const system = messages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean)
        .join("\n\n");
      const anthropicMessages = messages
        .filter((item) => item.role !== "system")
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content || ""),
        }));
      config = {
        kind: "anthropic",
        url: `${baseUrl}/v1/messages`,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: {
          model,
          max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: anthropicMessages,
        },
      };
    } else if (kind === "gemini") {
      const systemParts = messages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean);
      const contents = messages
        .filter((item) => item.role !== "system")
        .map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: String(item.content || "") }],
        }));
      config = {
        kind: "gemini",
        url: `${baseUrl}/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        headers: { "Content-Type": "application/json" },
        body: {
          contents,
          ...(systemParts.length
            ? {
                systemInstruction: {
                  parts: [{ text: systemParts.join("\n\n") }],
                },
              }
            : {}),
        },
      };
    } else if (kind === "cohere") {
      const historyMessages = messages.filter(
        (item) => item.role !== "system"
      );
      const chatHistory = historyMessages.slice(0, -1).map((item) => ({
        role: item.role === "assistant" ? "CHATBOT" : "USER",
        message: String(item.content || ""),
      }));
      const lastMessage = historyMessages.length
        ? historyMessages[historyMessages.length - 1]
        : { role: "user", content: "" };
      const preamble = messages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean)
        .join("\n\n");
      config = {
        kind: "cohere",
        url: `${baseUrl}/v1/chat`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          message: String(lastMessage.content || ""),
          chat_history: chatHistory,
          ...(preamble ? { preamble } : {}),
        },
      };
    } else {
      config = {
        kind: "openai",
        url: `${baseUrl}/v1/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: { model, messages, stream: false },
      };
    }
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(config.body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} - ${body || response.statusText}`);
    }

    const data = await response.json();
    let resultText = "";

    if (config.kind === "ollama") {
      resultText = (data.message && data.message.content) || "";
    } else if (config.kind === "anthropic") {
      const blocks = Array.isArray(data.content) ? data.content : [];
      resultText = blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("");
    } else if (config.kind === "gemini") {
      const parts =
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts;
      resultText = Array.isArray(parts)
        ? parts.map((part) => part.text || "").join("")
        : "";
    } else if (config.kind === "cohere") {
      resultText = data.text || "";
    } else {
      resultText =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content
          ? data.choices[0].message.content
          : "";
    }

    if (!resultText.trim()) {
      return { ok: false, error: "The model returned an empty response." };
    }

    return { ok: true, text: resultText, label };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { ok: false, error: message };
  }
}

// ---------- Text to speech (quick popup) ----------

const DEFAULT_TTS_VOICE = "alloy";

function isKnownTtsModel(model) {
  const name = String(model || "").trim().toLowerCase();
  if (!name) return false;
  return /(^|\/)tts-1(-hd)?$/.test(name) || /tts/.test(name);
}

function defaultTtsModel(provider) {
  return provider === "openai" ? "gpt-4o-mini-tts" : "tts-1";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Builds the same /v1/audio/speech request the sidebar uses. Mirrors the
// sidebar's provider precedence so the page popup can speak tool results.
async function speakViaTts(text) {
  const keys = [
    "penguin_mode",
    "penguin_server_type",
    "cloud_provider",
    "penguin_tts_model",
    "penguin_tts_voice",
    "penguin_tts_url",
    "penguin_tts_key",
    "penguin_tts_provider",
  ];
  const stored = await api.storage.local.get(keys);
  const mode = stored.penguin_mode || "server";
  const manualUrl = String(stored.penguin_tts_url || "").trim();
  const manualKey = String(stored.penguin_tts_key || "").trim();
  const ttsProvider = String(stored.penguin_tts_provider || "").trim();

  let baseUrl = "";
  let apiKey = "";
  let authRequired = true;

  if (manualUrl) {
    baseUrl = manualUrl.replace(/\/+$/, "");
    apiKey = manualKey;
    authRequired = false;
  } else if (ttsProvider) {
    const kind = await getCloudProviderKind(ttsProvider);
    if (kind !== "openai") {
      return {
        ok: false,
        error: `${await getCloudProviderLabel(
          ttsProvider
        )} does not expose an OpenAI-compatible speech endpoint.`,
      };
    }
    const endpoint = await getCloudProviderDefaults(ttsProvider);
    const providerKeys = [
      `cloud_api_url_${ttsProvider}`,
      `cloud_api_key_${ttsProvider}`,
    ];
    const providerStore = await api.storage.local.get(providerKeys);
    baseUrl = String(
      providerStore[providerKeys[0]] || endpoint.url || ""
    ).replace(/\/+$/, "");
    apiKey = manualKey || String(providerStore[providerKeys[1]] || "").trim();
    if (!baseUrl) {
      return {
        ok: false,
        error: `Set the API URL for ${await getCloudProviderLabel(
          ttsProvider
        )}.`,
      };
    }
    if (!apiKey) {
      return {
        ok: false,
        error: `Add an API key for ${await getCloudProviderLabel(
          ttsProvider
        )} in the sidebar settings.`,
      };
    }
  } else if (mode === "cloud") {
    const provider = stored.cloud_provider || "deepseek";
    const kind = await getCloudProviderKind(provider);
    if (kind !== "openai") {
      return {
        ok: false,
        error: `${await getCloudProviderLabel(
          provider
        )} does not expose an OpenAI-compatible speech endpoint.`,
      };
    }
    const endpoint = await getCloudProviderDefaults(provider);
    const providerKeys = [`cloud_api_url_${provider}`, `cloud_api_key_${provider}`];
    const providerStore = await api.storage.local.get(providerKeys);
    baseUrl = String(
      providerStore[providerKeys[0]] || endpoint.url || ""
    ).replace(/\/+$/, "");
    apiKey = manualKey || String(providerStore[providerKeys[1]] || "").trim();
    if (!baseUrl || !apiKey) {
      return {
        ok: false,
        error: "Set the cloud API URL and API key to use text-to-speech.",
      };
    }
  } else {
    const type = stored.penguin_server_type || "ollama";
    if (type === "ollama") {
      return {
        ok: false,
        error: "Ollama does not expose a text-to-speech endpoint.",
      };
    }
    const defaults = SERVER_DEFAULTS[type] || SERVER_DEFAULTS.koboldcpp;
    const serverKeys = [`server_url_${type}`];
    const serverStore = await api.storage.local.get(serverKeys);
    baseUrl = String(serverStore[serverKeys[0]] || defaults.url || "").replace(
      /\/+$/,
      ""
    );
    authRequired = false;
    if (!baseUrl) {
      return {
        ok: false,
        error: "Set the local server URL to use text-to-speech.",
      };
    }
  }

  let model = String(stored.penguin_tts_model || "").trim();
  if (!model) {
    if (manualUrl) model = "gpt-4o-mini-tts";
    else if (ttsProvider) model = defaultTtsModel(ttsProvider);
    else if (mode === "cloud")
      model = defaultTtsModel(stored.cloud_provider || "deepseek");
    else model = "tts-1";
  }
  // Guards against the very common "gpt-40" (zero) / "gpt-4o" (letter o) typo.
  model = model.replace(/^gpt-40(?=[-_]|$)/i, "gpt-4o");
  if (!isKnownTtsModel(model)) {
    return {
      ok: false,
      error: `"${model}" is not recognized as a text-to-speech model.`,
    };
  }

  const voice =
    String(stored.penguin_tts_voice || "").trim() || DEFAULT_TTS_VOICE;
  const headers = { "Content-Type": "application/json" };
  if (authRequired && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${response.status}${
        detail ? ` - ${detail.slice(0, 240)}` : ""
      }`,
    };
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  return {
    ok: true,
    audio: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`,
  };
}

async function openPanelIfClosed(tabId) {
  try {
    if (
      api.sidePanel &&
      api.sidePanel.open &&
      typeof tabId === "number" &&
      !panelOpen
    ) {
      await api.sidePanel.open({ tabId });
    } else if (api.sidebarAction && api.sidebarAction.open) {
      await api.sidebarAction.open();
    }
  } catch (error) {
    // Sidebar/side panel APIs are best-effort across browsers.
  }
}

async function deliverToPanel(tabId, toolId, text) {
  try {
    await api.storage.local.set({
      [PENDING_KEY]: { toolId, text, ts: Date.now() },
    });
    try {
      await api.runtime.sendMessage({
        type: "penguin_run_tool",
        toolId,
        text,
      });
    } catch (error) {
      // Panel will pick the pending item from storage.
    }
  } catch (error) {
    console.error("TuxAI: deliverToPanel error", error);
  }
}

async function deliverSelectedText(tabId, text) {
  try {
    await api.storage.local.set({
      [SELECTED_TEXT_KEY]: { text, ts: Date.now() },
    });
    try {
      await api.runtime.sendMessage({
        type: "penguin_selected_text",
        text,
      });
    } catch (error) {
      // Panel will pick the pending selected text from storage.
    }
  } catch (error) {
    console.error("TuxAI: deliverSelectedText error", error);
  }
}

if (api.contextMenus && api.contextMenus.onClicked) {
  api.contextMenus.onClicked.addListener((info, tab) => {
    const menuId = info && info.menuItemId;
    if (
      !menuId ||
      typeof menuId !== "string" ||
      !menuId.startsWith(TOOL_PREFIX)
    ) {
      return;
    }

    const toolId = menuId.slice(TOOL_PREFIX.length);
    if (!toolId) return;

    const targetTabId =
      tab && typeof tab.id === "number" ? tab.id : undefined;

    openPanelIfClosed(targetTabId);

    getSelectionText(tab, info).then((text) => {
      const trimmed = String(text || "").trim();
      if (!trimmed) {
        try {
          api.runtime
            .sendMessage({
              type: "penguin_notify",
              message: "No text selected.",
            })
            .catch(() => {});
        } catch (error) {
          // No-op.
        }
        return;
      }
      deliverToPanel(targetTabId, toolId, trimmed);
    });
  });
}
