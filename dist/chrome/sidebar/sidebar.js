// TuxAI - sidebar application logic.
// Supports Local Server and Cloud API modes only.

import {
  TOOL_STORAGE_KEYS,
  getToolState,
  effectiveToolsFromState,
  isBuiltInTool,
} from "../lib/tools.js";
import { renderMarkdown } from "../lib/markdown.js";

const api = typeof browser !== "undefined" ? browser : chrome;

// ---------- i18n ----------

const i18n =
  (typeof window !== "undefined" && window.TuxAIi18n) ||
  (typeof globalThis !== "undefined" && globalThis.TuxAIi18n) ||
  null;
const LANGUAGE_KEY = (i18n && i18n.LANG_KEY) || "penguin_language";
let uiLang = "en";

function resolveLang(pref) {
  if (i18n && typeof i18n.resolveLang === "function") {
    return i18n.resolveLang(pref);
  }
  return pref === "zh" ? "zh" : "en";
}

function t(key, fallback) {
  if (i18n && typeof i18n.t === "function") {
    return i18n.t(uiLang, key, fallback);
  }
  return fallback !== undefined ? fallback : key;
}

function applyLanguage(pref) {
  const value = pref === "zh" || pref === "en" ? pref : "auto";
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
  } catch (error) {
    // No-op.
  }
  api.storage.local.set({ [LANGUAGE_KEY]: value }).catch(() => {});
  uiLang = resolveLang(value);
  document.documentElement.lang = uiLang === "zh" ? "zh" : "en";
  if (i18n && typeof i18n.apply === "function") {
    i18n.apply(uiLang, document);
  }
  if (dom.uiLanguage) dom.uiLanguage.value = value;
}

function renderAppVersion() {
  if (!dom.appVersion) return;
  try {
    const version = api.runtime.getManifest().version;
    if (version) dom.appVersion.textContent = `v ${version}`;
  } catch (error) {
    // No-op if the manifest is unavailable.
  }
}

const SERVER_TYPES = new Set(["ollama", "koboldcpp", "llamacpp", "other"]);

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

const PENDING_KEY = "penguin_pending_run";
const NOTICE_KEY = "penguin_notice";
const QUICK_SHORTCUT_KEY = "penguin_quick_shortcut";
const SELECTED_TEXT_KEY = "penguin_selected_text";
const TEXT_SIZE_KEY = "penguin_text_size";
const DEFAULT_TEXT_SIZE = 14;
const TTS_MODEL_KEY = "penguin_tts_model";
const TTS_VOICE_KEY = "penguin_tts_voice";
const TTS_URL_KEY = "penguin_tts_url";
const TTS_KEY_KEY = "penguin_tts_key";
const TTS_PROVIDER_KEY = "penguin_tts_provider";
const DEFAULT_TTS_VOICE = "alloy";
// Short sample used by the settings "Test" button.
const TTS_TEST_SENTENCE = "ok";
// Voice lists taken from the OpenAI text-to-speech docs. `tts-1` and
// `tts-1-hd` only support the legacy subset; newer models add more voices.
const TTS_VOICES_FULL = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];
const TTS_VOICES_LEGACY = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
];
const CHAT_SESSIONS_KEY = "penguin_chat_sessions";
const CHAT_TABS_KEY = "penguin_chat_tabs";
const INTERFACE_SCALE_KEY = "penguin_interface_scale";
const RESTORED_MODEL_KEY = "penguin_restored_model";
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_LOCAL_STORAGE_KEYS = [
  "penguin_mode",
  "penguin_server_type",
  "penguin_theme",
  "penguin_context_size",
  "penguin_text_size",
  "penguin_tts_model",
  "penguin_tts_voice",
  "penguin_tts_url",
  "penguin_tts_key",
  "penguin_tts_provider",
  "penguin_interface_scale",
  "penguin_language",
  "penguin_settings_collapsed",
  "penguin_settings_tab",
];

const dom = {
  themeToggle: document.getElementById("theme-toggle"),
  themeIcon: document.getElementById("theme-icon"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsPanel: document.getElementById("settings-panel"),
  backupExportBtn: document.getElementById("backup-export-btn"),
  backupImportBtn: document.getElementById("backup-import-btn"),
  backupFileInput: document.getElementById("backup-file-input"),
  historyExportBtn: document.getElementById("history-export-btn"),
  historyImportBtn: document.getElementById("history-import-btn"),
  historyFileInput: document.getElementById("history-file-input"),
  serverType: document.getElementById("server-type"),
  serverUrl: document.getElementById("server-url"),
  serverModel: document.getElementById("server-model"),
  serverModelList: document.getElementById("server-model-list"),
  serverModelManager: document.getElementById("server-model-manager"),
  serverModelCount: document.getElementById("server-model-count"),
  serverAddModelBtn: document.getElementById("server-add-model-btn"),
  serverAddModelForm: document.getElementById("server-add-model-form"),
  serverCustomModelInput: document.getElementById("server-custom-model-input"),
  serverAddModelConfirm: document.getElementById("server-add-model-confirm"),
  serverAddModelCancel: document.getElementById("server-add-model-cancel"),
  fetchModelsBtn: document.getElementById("fetch-models-btn"),
  cloudProvider: document.getElementById("cloud-provider"),
  addCloudProviderBtn: document.getElementById("add-cloud-provider-btn"),
  removeCloudProviderBtn: document.getElementById("remove-cloud-provider-btn"),
  addProviderForm: document.getElementById("add-provider-form"),
  addProviderName: document.getElementById("add-provider-name"),
  addProviderUrl: document.getElementById("add-provider-url"),
  addProviderConfirm: document.getElementById("add-provider-confirm"),
  addProviderCancel: document.getElementById("add-provider-cancel"),
  cloudApiUrl: document.getElementById("cloud-api-url"),
  cloudApiKey: document.getElementById("cloud-api-key"),
  cloudModelSelect: document.getElementById("cloud-model-select"),
  cloudModelManager: document.getElementById("cloud-model-manager"),
  cloudModelCount: document.getElementById("cloud-model-count"),
  cloudAddModelBtn: document.getElementById("cloud-add-model-btn"),
  cloudAddModelForm: document.getElementById("cloud-add-model-form"),
  cloudCustomModelInput: document.getElementById("cloud-custom-model-input"),
  cloudAddModelConfirm: document.getElementById("cloud-add-model-confirm"),
  cloudAddModelCancel: document.getElementById("cloud-add-model-cancel"),
  fetchCloudModelsBtn: document.getElementById("fetch-cloud-models-btn"),
  contextSize: document.getElementById("context-size"),
  textSize: document.getElementById("text-size"),
  resetTextSize: document.getElementById("reset-text-size"),
  ttsModel: document.getElementById("tts-model"),
  ttsApplyModel: document.getElementById("tts-apply-model"),
  ttsProvider: document.getElementById("tts-provider"),
  ttsUrl: document.getElementById("tts-url"),
  ttsKey: document.getElementById("tts-key"),
  ttsVoice: document.getElementById("tts-voice"),
  ttsTestVoice: document.getElementById("tts-test-voice"),
  interfaceScale: document.getElementById("interface-scale"),
  resetInterfaceScale: document.getElementById("reset-interface-scale"),
  quickShortcut: document.getElementById("quick-shortcut"),
  langToggle: document.getElementById("lang-toggle"),
  uiLanguage: document.getElementById("ui-language"),
  newTool: document.getElementById("new-tool"),
  resetTools: document.getElementById("reset-tools"),
  manageTool: document.getElementById("manage-tool"),
  toolName: document.getElementById("tool-name"),
  toolModelPicker: document.getElementById("tool-model-picker"),
  toolModelTrigger: document.getElementById("tool-model-trigger"),
  toolModelLabel: document.getElementById("tool-model-label"),
  toolModelMenu: document.getElementById("tool-model-menu"),
  toolPrompt: document.getElementById("tool-prompt"),
  saveTool: document.getElementById("save-tool"),
  deleteTool: document.getElementById("delete-tool"),
  chat: document.getElementById("chat"),
  scrollToBottomBtn: document.getElementById("scroll-to-bottom-btn"),
  chatStatus: document.getElementById("chat-status"),
  appVersion: document.getElementById("app-version"),
  messageInput: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
  selectionPanel: document.getElementById("selection-panel"),
  selectedTextPreview: document.getElementById("selected-text-preview"),
  selectionTools: document.getElementById("selection-tools"),
  clearSelection: document.getElementById("clear-selection"),
  quickModelSelect: document.getElementById("quick-model-select"),
  quickModelPicker: document.getElementById("quick-model-picker"),
  quickModelTrigger: document.getElementById("quick-model-trigger"),
  quickModelLabel: document.getElementById("quick-model-label"),
  quickModelMenu: document.getElementById("quick-model-menu"),
  attachBtn: document.getElementById("attach-btn"),
  fileInput: document.getElementById("file-input"),
  attachmentList: document.getElementById("attachment-list"),
  historyBtn: document.getElementById("history-btn"),
  newChatBtn: document.getElementById("new-chat-btn"),
  newTabBtn: document.getElementById("new-tab-btn"),
  chatTabs: document.getElementById("chat-tabs"),
  historyPanel: document.getElementById("history-panel"),
  historyList: document.getElementById("history-list"),
  historyClose: document.getElementById("history-close"),
  historyDeleteAll: document.getElementById("history-delete-all"),
};

const state = {
  mode: localStorage.getItem("penguin_mode") || "server",
  serverType: localStorage.getItem("penguin_server_type") || "ollama",
  customCloudProviders: [],
  cloudStore: {},
  modelOptions: [],
  toolState: { customTools: [], overrides: {}, deleted: [] },
  editingToolId: null,
  editingToolModelRef: "",
  selectedText: "",
  // Multiple concurrent conversations. The active tab is projected onto
  // `state.messages` / `state.attachments` / `state.currentSessionId` below so
  // the rest of the app keeps using those names unchanged.
  tabs: [],
  activeTabId: null,
  sessions: [],
  generating: false,
  abortController: null,
  lastRunKey: null,
  lastRunAt: 0,
};

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

Object.defineProperty(state, "messages", {
  get() {
    const tab = getActiveTab();
    return tab ? tab.messages : [];
  },
  set(value) {
    const tab = getActiveTab();
    if (tab) tab.messages = value;
  },
});

Object.defineProperty(state, "attachments", {
  get() {
    const tab = getActiveTab();
    return tab ? tab.attachments : [];
  },
  set(value) {
    const tab = getActiveTab();
    if (tab) tab.attachments = value;
  },
});

Object.defineProperty(state, "currentSessionId", {
  get() {
    const tab = getActiveTab();
    return tab ? tab.sessionId : null;
  },
  set(value) {
    const tab = getActiveTab();
    if (tab) tab.sessionId = value;
  },
});

let uiReady = false;
let cloudFetchTimer = null;
// Auto-scroll behavior while a reply streams:
//   "top"    - follow new text until the pinned element's top edge is near the
//              top of the viewport, then stop (default). The pinned element is
//              the final answer bubble once it has text; while only reasoning
//              streams, the newest reasoning text is followed instead so the
//              stop does not happen on the reasoning bubble.
//   "bottom" - keep the newest text visible (after the ↓ button is clicked)
//   "off"    - no automatic scrolling (after the user scrolls away)
const STREAM_TOP_MARGIN = 8;
let autoScrollMode = "off";
let lastChatScrollTop = 0;
const SETTINGS_TAB_IDS = ["cloud", "local", "ui", "sound", "tools", "misc"];
const SETTINGS_TAB_ALIASES = { chat: "ui", shortcut: "ui" };
let activeSettingsTab = (() => {
  const stored = localStorage.getItem("penguin_settings_tab");
  const normalized = SETTINGS_TAB_ALIASES[stored] || stored;
  return SETTINGS_TAB_IDS.includes(normalized) ? normalized : "cloud";
})();

document.addEventListener("DOMContentLoaded", init);

window.addEventListener("beforeunload", () => {
  if (state.tabs.length) saveTabs();
});

async function init() {
  renderAppVersion();
  applyTheme(localStorage.getItem("penguin_theme") || "light");
  dom.contextSize.value = localStorage.getItem("penguin_context_size") || "8192";
  const savedTextSize = parseInt(localStorage.getItem(TEXT_SIZE_KEY), 10);
  applyTextSize(
    Number.isFinite(savedTextSize) ? savedTextSize : DEFAULT_TEXT_SIZE
  );
  initTtsSettings();
  await hydrateTtsSettingsFromStorage();
  const savedInterfaceScale = parseFloat(
    localStorage.getItem(INTERFACE_SCALE_KEY)
  );
  applyInterfaceScale(
    Number.isFinite(savedInterfaceScale) ? savedInterfaceScale : 1
  );
  restoreSettingsPanelVisibility();
  bindEvents();
  applyLanguage(localStorage.getItem(LANGUAGE_KEY) || "auto");
  state.toolState = await getToolState();
  renderTools();

  const shortcutResult = await api.storage.local.get([QUICK_SHORTCUT_KEY]);
  dom.quickShortcut.value = shortcutResult[QUICK_SHORTCUT_KEY] || "alt";

  await restoreConnectionSettings();
  await setMode(state.mode, { skipHistory: true });
  await loadChatSessions();
  await loadTabs();
  ensureFirstTab();

  const restoredTab = getActiveTab();
  if (restoredTab && restoredTab.modelId) {
    const ok = await applyModelToConnection(restoredTab.modelId, {
      silent: true,
    });
    if (!ok) await refreshUnifiedModelSelect();
  } else {
    await refreshUnifiedModelSelect();
  }

  renderChatFromState();
  renderAttachmentList();
  renderTabs();
  updateSendButton();
  await processRestoredActiveModel();
  updateSendButton();

  if (!getActiveTab().messages.length) {
    appendSystemMessage(
      "Connect to a local server or cloud API, pick a tool, then start chatting."
    );
  }

  processPendingRun();
  setupPanelStateReporter();
  uiReady = true;
  processPendingSelectedText();

  if (state.mode === "cloud") {
    maybeAutoFetchCloudModels();
  }
}

function bindEvents() {
  dom.settingsToggle.addEventListener("click", toggleSettingsPanel);
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.backupExportBtn.addEventListener("click", exportSettingsBackup);
  dom.backupImportBtn.addEventListener("click", () => {
    dom.backupFileInput.click();
  });
  dom.backupFileInput.addEventListener("change", handleBackupFileImport);
  dom.historyExportBtn.addEventListener("click", exportChatHistoryBackup);
  dom.historyImportBtn.addEventListener("click", () => {
    dom.historyFileInput.click();
  });
  dom.historyFileInput.addEventListener("change", handleChatHistoryImport);
  bindSettingsTabs();
  bindSelectionTools();

  dom.serverType.addEventListener("change", async () => {
    localStorage.setItem("penguin_server_type", dom.serverType.value);
    await applyServerDefaults();
    await refreshUnifiedModelSelect();
    applyTtsModel();
    if (state.mode === "server" && dom.serverUrl.value.trim()) {
      fetchServerModels({ silent: true });
    }
  });

  dom.serverUrl.addEventListener("input", () => {
    const key = `server_url_${dom.serverType.value}`;
    api.storage.local.set({ [key]: dom.serverUrl.value });
  });

  dom.serverModel.addEventListener("input", () => {
    const key = `server_model_${dom.serverType.value}`;
    api.storage.local.set({ [key]: dom.serverModel.value });
  });

  dom.fetchModelsBtn.addEventListener("click", fetchServerModels);

  dom.serverAddModelBtn.addEventListener("click", () => {
    dom.serverAddModelForm.hidden = !dom.serverAddModelForm.hidden;
    if (!dom.serverAddModelForm.hidden) dom.serverCustomModelInput.focus();
  });
  dom.serverAddModelCancel.addEventListener("click", () => {
    dom.serverAddModelForm.hidden = true;
    dom.serverCustomModelInput.value = "";
  });
  dom.serverAddModelConfirm.addEventListener("click", () => {
    addCustomModel("server", dom.serverType.value, dom.serverCustomModelInput);
  });
  dom.serverCustomModelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomModel("server", dom.serverType.value, dom.serverCustomModelInput);
    }
  });

  dom.cloudProvider.addEventListener("change", async () => {
    api.storage.local.set({ cloud_provider: dom.cloudProvider.value });
    if (cloudFetchTimer) clearTimeout(cloudFetchTimer);
    await loadCloudSettingsForProvider();
    await refreshUnifiedModelSelect();
    applyTtsModel();
  });

  dom.addCloudProviderBtn.addEventListener("click", () => {
    dom.addProviderForm.hidden = !dom.addProviderForm.hidden;
    if (!dom.addProviderForm.hidden) dom.addProviderName.focus();
  });
  dom.addProviderCancel.addEventListener("click", () => {
    dom.addProviderForm.hidden = true;
    dom.addProviderName.value = "";
    dom.addProviderUrl.value = "";
  });
  dom.addProviderConfirm.addEventListener("click", addCloudProvider);
  dom.addProviderUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCloudProvider();
    }
  });
  dom.addProviderName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCloudProvider();
    }
  });
  dom.removeCloudProviderBtn.addEventListener("click", removeCloudProvider);

  dom.cloudApiUrl.addEventListener("input", () => {
    const provider = dom.cloudProvider.value;
    api.storage.local.set({ [`cloud_api_url_${provider}`]: dom.cloudApiUrl.value });
  });

  dom.cloudApiUrl.addEventListener("change", () => {
    if (dom.cloudApiKey.value.trim()) {
      fetchCloudModels({ silent: true });
    }
  });

  dom.cloudApiKey.addEventListener("input", async () => {
    const provider = dom.cloudProvider.value;
    await api.storage.local.set({
      [`cloud_api_key_${provider}`]: dom.cloudApiKey.value,
    });
    await renderCloudModelManager(provider);
    await refreshUnifiedModelSelect();

    if (cloudFetchTimer) clearTimeout(cloudFetchTimer);
    if (dom.cloudApiKey.value.trim()) {
      cloudFetchTimer = setTimeout(() => {
        cloudFetchTimer = null;
        fetchCloudModels({ silent: true });
      }, 800);
    }
  });

  dom.cloudModelSelect.addEventListener("change", () => {
    saveCloudModel();
  });

  dom.fetchCloudModelsBtn.addEventListener("click", () => {
    fetchCloudModels({ silent: false });
  });

  dom.cloudAddModelBtn.addEventListener("click", () => {
    dom.cloudAddModelForm.hidden = !dom.cloudAddModelForm.hidden;
    if (!dom.cloudAddModelForm.hidden) dom.cloudCustomModelInput.focus();
  });
  dom.cloudAddModelCancel.addEventListener("click", () => {
    dom.cloudAddModelForm.hidden = true;
    dom.cloudCustomModelInput.value = "";
  });
  dom.cloudAddModelConfirm.addEventListener("click", () => {
    addCustomModel("cloud", dom.cloudProvider.value, dom.cloudCustomModelInput);
  });
  dom.cloudCustomModelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomModel("cloud", dom.cloudProvider.value, dom.cloudCustomModelInput);
    }
  });

  dom.contextSize.addEventListener("change", () => {
    localStorage.setItem("penguin_context_size", dom.contextSize.value);
  });

  dom.textSize.addEventListener("input", () => {
    const parsed = parseInt(dom.textSize.value, 10);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 24) return;
    document.documentElement.style.setProperty("--text-size", `${parsed}px`);
    localStorage.setItem(TEXT_SIZE_KEY, String(parsed));
  });

  dom.textSize.addEventListener("change", () => {
    const parsed = parseInt(dom.textSize.value, 10);
    if (!Number.isFinite(parsed)) {
      applyTextSize(DEFAULT_TEXT_SIZE);
      localStorage.setItem(TEXT_SIZE_KEY, String(DEFAULT_TEXT_SIZE));
      return;
    }
    applyTextSize(parsed);
    localStorage.setItem(TEXT_SIZE_KEY, String(parsed));
  });

  dom.resetTextSize.addEventListener("click", () => {
    applyTextSize(DEFAULT_TEXT_SIZE);
    localStorage.setItem(TEXT_SIZE_KEY, String(DEFAULT_TEXT_SIZE));
  });

  dom.ttsModel.addEventListener("input", () => {
    saveTtsSetting(TTS_MODEL_KEY, dom.ttsModel.value.trim());
  });

  dom.ttsProvider.addEventListener("change", () => {
    saveTtsSetting(TTS_PROVIDER_KEY, dom.ttsProvider.value);
    applyTtsModel();
  });

  dom.ttsUrl.addEventListener("input", () => {
    saveTtsSetting(TTS_URL_KEY, dom.ttsUrl.value.trim());
  });

  dom.ttsUrl.addEventListener("change", () => applyTtsModel());

  dom.ttsKey.addEventListener("input", () => {
    saveTtsSetting(TTS_KEY_KEY, dom.ttsKey.value.trim());
  });

  dom.ttsKey.addEventListener("change", () => applyTtsModel());

  // Pressing Enter (or clicking "Use") loads the voices for this model.
  dom.ttsModel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyTtsModel();
  });

  dom.ttsApplyModel.addEventListener("click", () => applyTtsModel());

  dom.ttsVoice.addEventListener("change", () => {
    saveTtsSetting(TTS_VOICE_KEY, dom.ttsVoice.value.trim());
  });

  dom.ttsTestVoice.addEventListener("click", () => {
    if (activeSpeech && activeSpeech.button === dom.ttsTestVoice) {
      stopActiveSpeech();
      return;
    }
    testTtsVoice();
  });

  dom.interfaceScale.addEventListener("change", () => {
    applyInterfaceScale(dom.interfaceScale.value);
  });

  dom.resetInterfaceScale.addEventListener("click", () => {
    applyInterfaceScale(1);
  });

  dom.quickShortcut.addEventListener("change", () => {
    api.storage.local.set({ [QUICK_SHORTCUT_KEY]: dom.quickShortcut.value });
  });

  if (dom.langToggle) {
    dom.langToggle.addEventListener("click", () => {
      const next = uiLang === "zh" ? "en" : "zh";
      applyLanguage(next);
      if (typeof renderTools === "function") renderTools();
      renderTtsProviderOptions();
      applyTtsModel({ persist: false });
    });
  }

  dom.manageTool.addEventListener("change", () => {
    state.editingToolId = dom.manageTool.value;
    renderManageFields();
  });

  dom.newTool.addEventListener("click", startNewTool);
  dom.saveTool.addEventListener("click", saveTool);
  dom.deleteTool.addEventListener("click", deleteTool);
  dom.resetTools.addEventListener("click", resetTools);
  dom.toolModelTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleToolModelMenu();
  });
  dom.newChatBtn.addEventListener("click", clearChat);
  if (dom.newTabBtn) dom.newTabBtn.addEventListener("click", newTab);
  dom.clearSelection.addEventListener("click", clearSelectedText);

  dom.quickModelSelect.addEventListener("change", () => {
    switchQuickModel(dom.quickModelSelect.value);
  });

  dom.quickModelTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleQuickModelMenu();
  });
  document.addEventListener("click", (event) => {
    if (!dom.quickModelPicker.contains(event.target)) closeQuickModelMenu();
    if (
      dom.toolModelPicker &&
      !dom.toolModelPicker.contains(event.target)
    ) {
      closeToolModelMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeQuickModelMenu();
    closeToolModelMenu();
    if (!dom.historyPanel.hidden) hideHistoryPanel();
  });

  applyFileInputAccept();
  dom.attachBtn.addEventListener("click", () => {
    openAttachmentPicker();
  });

  dom.fileInput.addEventListener("change", () => handleSelectedFiles());

  dom.historyBtn.addEventListener("click", toggleHistoryPanel);
  dom.historyClose.addEventListener("click", hideHistoryPanel);
  dom.historyDeleteAll.addEventListener("click", deleteAllSessions);

  dom.messageInput.addEventListener("input", () => {
    autoResizeInput();
    updateSendButton();
    const tab = getActiveTab();
    if (tab) {
      tab.draft = dom.messageInput.value;
      scheduleTabsSave();
    }
  });

  dom.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!state.generating) submit();
    }
  });

  dom.sendBtn.addEventListener("click", submit);

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!uiReady) return;
    if (message && message.type === "penguin_run_tool") {
      const handled = handlePendingRun({
        toolId: message.toolId,
        text: message.text,
      });
      if (handled) api.storage.local.remove([PENDING_KEY]);
      if (sendResponse) sendResponse({ ok: handled });
    }
    if (message && message.type === "penguin_selected_text" && message.text) {
      showSelectedText(message.text);
      api.storage.local.remove([SELECTED_TEXT_KEY]);
    }
    if (message && message.type === "penguin_clear_selected_text") {
      clearSelectedText();
    }
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PENDING_KEY] && changes[PENDING_KEY].newValue && uiReady) {
      const handled = handlePendingRun(changes[PENDING_KEY].newValue);
      if (handled) api.storage.local.remove([PENDING_KEY]);
    }
    if (changes[SELECTED_TEXT_KEY] && changes[SELECTED_TEXT_KEY].newValue && uiReady) {
      const payload = changes[SELECTED_TEXT_KEY].newValue;
      if (payload && payload.text) showSelectedText(payload.text);
      api.storage.local.remove([SELECTED_TEXT_KEY]);
    }
    if (changes[NOTICE_KEY]) {
      const notice = changes[NOTICE_KEY].newValue;
      if (notice && notice.message) appendSystemMessage(notice.message);
      api.storage.local.remove([NOTICE_KEY]);
    }
  });

  dom.chat.addEventListener(
    "scroll",
    () => {
      // Scrolling up means the user is reading; pause auto-follow. Downward
      // movement is usually our own programmatic scroll.
      if (dom.chat.scrollTop < lastChatScrollTop - 1) autoScrollMode = "off";
      lastChatScrollTop = dom.chat.scrollTop;
      updateScrollToBottomButton();
    },
    { passive: true }
  );

  if (dom.scrollToBottomBtn) {
    dom.scrollToBottomBtn.addEventListener("click", jumpToLatest);
  }
}

// ---------- Theme / settings panel ----------

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  dom.themeIcon.innerHTML = dark
    ? '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>'
    : '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>';
}

function applyTextSize(size) {
  let px = parseInt(size, 10);
  if (!Number.isFinite(px)) px = DEFAULT_TEXT_SIZE;
  px = Math.min(24, Math.max(10, px));

  document.documentElement.style.setProperty("--text-size", `${px}px`);
  dom.textSize.value = String(px);
}

// Returns the supported voice list for a known TTS model, or null when the
// model is not recognized as a text-to-speech model.
function knownTtsVoices(model) {
  const name = String(model || "").trim().toLowerCase();
  if (!name) return null;
  // Only the classic tts-1 / tts-1-hd models use the smaller voice set.
  if (/(^|\/)tts-1(-hd)?$/.test(name)) return TTS_VOICES_LEGACY;
  if (/tts/.test(name)) return TTS_VOICES_FULL;
  return null;
}

// The model that will actually be used for speech: the explicit TTS model if
// set, otherwise a sensible default for the current provider. When a dedicated
// TTS endpoint is configured, default to the best OpenAI TTS model.
function effectiveTtsModel() {
  const explicit = ttsModelValue();
  if (explicit) return explicit;

  if (dom.ttsUrl && dom.ttsUrl.value.trim()) {
    return "gpt-4o-mini-tts";
  }

  if (dom.ttsProvider && dom.ttsProvider.value) {
    return defaultTtsModel(dom.ttsProvider.value);
  }

  if (state.mode === "cloud") {
    const provider = dom.cloudProvider.value;
    const endpoint = cloudProviderDefaults(provider);
    const chatModel = getCloudModelValue() || endpoint.model || "";
    if (chatModel && /tts|audio/i.test(chatModel)) return chatModel;
    return defaultTtsModel(provider);
  }

  return "tts-1";
}

function setTtsVoice(value) {
  const voice = String(value || "");
  if (dom.ttsVoice) dom.ttsVoice.value = voice;
  saveTtsSetting(TTS_VOICE_KEY, voice);
}

function showTtsVoiceUnsupported(reason) {
  if (!dom.ttsVoice) return;
  dom.ttsVoice.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = t("sound.notSupported", "TTS not supported");
  dom.ttsVoice.appendChild(option);
  dom.ttsVoice.disabled = true;
  dom.ttsVoice.title = reason || "Text-to-speech is not supported.";
}

function populateTtsVoices(voices) {
  if (!dom.ttsVoice) return;
  dom.ttsVoice.innerHTML = "";
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = voice;
    dom.ttsVoice.appendChild(option);
  }
  dom.ttsVoice.disabled = false;
  dom.ttsVoice.title = "";

  const saved = localStorage.getItem(TTS_VOICE_KEY) || "";
  const chosen = voices.includes(saved) ? saved : DEFAULT_TTS_VOICE;
  setTtsVoice(chosen);
}

// Builds the "TTS provider" dropdown so speech can use a different provider
// than the chat model (e.g. chat with DeepSeek, speak with OpenAI).
function renderTtsProviderOptions(selected) {
  if (!dom.ttsProvider) return "";
  const current =
    selected !== undefined
      ? selected
      : dom.ttsProvider.value || localStorage.getItem(TTS_PROVIDER_KEY) || "";

  dom.ttsProvider.innerHTML = "";
  const sameOption = document.createElement("option");
  sameOption.value = "";
  sameOption.textContent = t("sound.sameAsChat", "Same as chat provider");
  dom.ttsProvider.appendChild(sameOption);

  const providers = [
    ...BUILT_IN_CLOUD_PROVIDERS.map((id) => ({
      id,
      label: cloudProviderLabel(id),
    })),
    ...(state.customCloudProviders || []).map((item) => ({
      id: item.id,
      label: item.name,
    })),
  ];
  for (const provider of providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    dom.ttsProvider.appendChild(option);
  }

  const valid = ["", ...providers.map((provider) => provider.id)];
  dom.ttsProvider.value = valid.includes(current) ? current : "";
  return dom.ttsProvider.value;
}

// Runs when the user clicks "Use" (or presses Enter) next to the TTS model
// field: loads the supported voices, or reports that the model has no TTS.
function applyTtsModel(options = {}) {
  const raw = dom.ttsModel ? dom.ttsModel.value : "";
  const explicit = normalizeTtsModelName(raw);
  if (dom.ttsModel && dom.ttsModel.value !== explicit) {
    dom.ttsModel.value = explicit;
  }
  // Always persist a corrected (auto-fixed) value, even on silent reloads.
  if (options.persist !== false || raw !== explicit) {
    saveTtsSetting(TTS_MODEL_KEY, explicit);
  }

  const provider = getTtsConfig();
  if (!provider.supported) {
    showTtsVoiceUnsupported(provider.reason);
    refreshSpeakButtons();
    return;
  }

  const model = provider.model || effectiveTtsModel();
  const voices = knownTtsVoices(model);
  if (!voices) {
    showTtsVoiceUnsupported(
      `"${model}" is not recognized as a text-to-speech model.`
    );
  } else {
    populateTtsVoices(voices);
  }
  refreshSpeakButtons();
}

function initTtsSettings() {
  if (dom.ttsModel) {
    dom.ttsModel.value = localStorage.getItem(TTS_MODEL_KEY) || "";
  }
  if (dom.ttsUrl) {
    dom.ttsUrl.value = localStorage.getItem(TTS_URL_KEY) || "";
  }
  if (dom.ttsKey) {
    dom.ttsKey.value = localStorage.getItem(TTS_KEY_KEY) || "";
  }
  // Voice options are filled in by applyTtsModel() once the provider settings
  // have loaded.
}

// TTS settings live in localStorage for synchronous UI reads, but the
// background worker needs them too, so mirror each change into storage.local.
function saveTtsSetting(key, value) {
  const text = String(value ?? "");
  try {
    localStorage.setItem(key, text);
  } catch (error) {
    // No-op.
  }
  api.storage.local.set({ [key]: text }).catch(() => {});
}

// Pulls TTS settings back from storage.local (e.g. after an extension update
// or a backup restore) and mirrors them into localStorage.
async function hydrateTtsSettingsFromStorage() {
  const keys = [
    TTS_MODEL_KEY,
    TTS_VOICE_KEY,
    TTS_URL_KEY,
    TTS_KEY_KEY,
    TTS_PROVIDER_KEY,
  ];
  let stored = {};
  try {
    stored = await api.storage.local.get(keys);
  } catch (error) {
    return;
  }

  const model = stored[TTS_MODEL_KEY];
  if (model !== undefined && model !== null) {
    dom.ttsModel.value = model;
    localStorage.setItem(TTS_MODEL_KEY, model);
  }
  const url = stored[TTS_URL_KEY];
  if (url !== undefined && url !== null) {
    dom.ttsUrl.value = url;
    localStorage.setItem(TTS_URL_KEY, url);
  }
  const key = stored[TTS_KEY_KEY];
  if (key !== undefined && key !== null) {
    dom.ttsKey.value = key;
    localStorage.setItem(TTS_KEY_KEY, key);
  }
  const provider = stored[TTS_PROVIDER_KEY];
  if (provider !== undefined && provider !== null) {
    localStorage.setItem(TTS_PROVIDER_KEY, provider);
  }
  const voice = stored[TTS_VOICE_KEY];
  if (voice !== undefined && voice !== null) {
    localStorage.setItem(TTS_VOICE_KEY, voice);
  }

  // Keep storage.local in sync so the background worker can read them even
  // for settings that only existed in localStorage before this update.
  saveTtsSetting(TTS_MODEL_KEY, dom.ttsModel.value || "");
  saveTtsSetting(TTS_URL_KEY, dom.ttsUrl.value || "");
  saveTtsSetting(TTS_KEY_KEY, dom.ttsKey.value || "");
  saveTtsSetting(
    TTS_VOICE_KEY,
    localStorage.getItem(TTS_VOICE_KEY) || DEFAULT_TTS_VOICE
  );
  saveTtsSetting(
    TTS_PROVIDER_KEY,
    localStorage.getItem(TTS_PROVIDER_KEY) || ""
  );
}

function applyInterfaceScale(value) {
  let scale = parseFloat(value);
  if (!Number.isFinite(scale)) scale = 1;
  scale = Math.min(1.5, Math.max(0.8, scale));

  document.documentElement.style.zoom = String(scale);
  dom.interfaceScale.value = String(scale);
  localStorage.setItem(INTERFACE_SCALE_KEY, String(scale));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("penguin_theme", next);
  applyTheme(next);
}

function restoreSettingsPanelVisibility() {
  const collapsed = localStorage.getItem("penguin_settings_collapsed");
  if (collapsed === "false") {
    dom.settingsPanel.hidden = false;
    document.body.classList.add("settings-open");
    hideHistoryPanel();
    switchSettingsTab(activeSettingsTab);
  }
}

function switchSettingsTab(tab) {
  if (!SETTINGS_TAB_IDS.includes(tab)) return;
  activeSettingsTab = tab;

  document.querySelectorAll(".settings-tab").forEach((button) => {
    const isActive = button.dataset.settingsTab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll(".settings-page").forEach((page) => {
    page.hidden = !page.id.endsWith(`-${tab}`);
  });

  localStorage.setItem("penguin_settings_tab", tab);
}

function bindSettingsTabs() {
  document.querySelectorAll(".settings-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.settingsTab;
      switchSettingsTab(tab);
      if (tab === "cloud") {
        setMode("cloud");
        // Switching to the Cloud tab is an explicit, user-initiated decision
        // to use a remote provider, so this click is a good place to ask for
        // data-collection consent (already granted -> no prompt).
        requestDataConsent().catch(() => {});
      } else if (tab === "local") setMode("server");
      else if (tab === "tools") refreshToolModelSelect();
    });
  });
}

function toggleSettingsPanel() {
  dom.settingsPanel.hidden = !dom.settingsPanel.hidden;
  document.body.classList.toggle("settings-open", !dom.settingsPanel.hidden);

  if (!dom.settingsPanel.hidden) {
    hideHistoryPanel();
    switchSettingsTab(activeSettingsTab);
  }

  localStorage.setItem("penguin_settings_collapsed", String(dom.settingsPanel.hidden));
}

// ---------- Settings backup / restore ----------

function isBackupStorageKey(key) {
  const exactKeys = [
    "penguin_mode",
    "penguin_server_type",
    "cloud_provider",
    "penguin_quick_shortcut",
    "penguin_custom_cloud_providers",
    "penguin_custom_tools",
    "penguin_tool_overrides",
    "penguin_tool_deleted",
    // TTS settings are mirrored into storage.local so the background worker
    // can read them; they must be part of the backup too.
    "penguin_tts_model",
    "penguin_tts_voice",
    "penguin_tts_url",
    "penguin_tts_key",
    "penguin_tts_provider",
    "penguin_language",
  ];
  if (exactKeys.includes(key)) return true;
  if (/^server_(url|model|model_list|model_disabled|custom_models)_/.test(key)) return true;
  if (/^cloud_(api_url|api_key|model|model_list|model_disabled|custom_models)_/.test(key)) {
    return true;
  }
  return false;
}

// Chat history lives in its own backup so the settings backup stays small and
// free of conversation data. Open tabs are included as they are live chats.
const CHAT_HISTORY_STORAGE_KEYS = ["penguin_chat_sessions", "penguin_chat_tabs"];

function isChatHistoryStorageKey(key) {
  return CHAT_HISTORY_STORAGE_KEYS.includes(key);
}

function downloadBackupJson(backup, prefix) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${prefix}-${new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 19)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportSettingsBackup() {
  try {
    const allStored = await api.storage.local.get(null);
    const storageLocal = {};
    for (const [key, value] of Object.entries(allStored)) {
      if (isBackupStorageKey(key)) storageLocal[key] = value;
    }

    const localData = {};
    for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) localData[key] = value;
    }

    const backup = {
      app: "tuxai",
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      localStorage: localData,
      storageLocal,
      activeModel: currentQuickModelId() || "",
    };

    downloadBackupJson(backup, "tuxai-backup");

    setStatus("Settings backup exported.");
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(`Export failed: ${message}`);
  }
}

async function handleBackupFileImport(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (
      !data ||
      data.app !== "tuxai" ||
      !data.storageLocal ||
      typeof data.storageLocal !== "object" ||
      !data.localStorage ||
      typeof data.localStorage !== "object"
    ) {
      setStatus("Invalid TuxAI backup file.");
      return;
    }

    const safeStorage = {};
    for (const [key, value] of Object.entries(data.storageLocal)) {
      if (isBackupStorageKey(key)) safeStorage[key] = value;
    }

    const currentStored = await api.storage.local.get(null);
    const removeKeys = Object.keys(currentStored).filter(
      (key) => isBackupStorageKey(key) && !(key in safeStorage)
    );
    if (removeKeys.length) {
      await api.storage.local.remove(removeKeys);
    }
    await api.storage.local.set(safeStorage);

    for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data.localStorage, key)) {
        localStorage.setItem(key, data.localStorage[key]);
      } else {
        localStorage.removeItem(key);
      }
    }

    if (typeof data.activeModel === "string" && data.activeModel) {
      localStorage.setItem(RESTORED_MODEL_KEY, data.activeModel);
    } else {
      localStorage.removeItem(RESTORED_MODEL_KEY);
    }

    setStatus("Settings restored. Reloading...");
    setTimeout(() => location.reload(), 800);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(`Import failed: ${message}`);
  }
}

async function exportChatHistoryBackup() {
  try {
    const stored = await api.storage.local.get(CHAT_HISTORY_STORAGE_KEYS);
    const storageLocal = {};
    for (const [key, value] of Object.entries(stored)) {
      if (isChatHistoryStorageKey(key)) storageLocal[key] = value;
    }

    const backup = {
      app: "tuxai",
      kind: "chat-history",
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      storageLocal,
    };

    downloadBackupJson(backup, "tuxai-chat-history");
    setStatus("Chat history exported.");
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(`Export failed: ${message}`);
  }
}

async function handleChatHistoryImport(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (
      !data ||
      data.app !== "tuxai" ||
      !data.storageLocal ||
      typeof data.storageLocal !== "object"
    ) {
      setStatus("Invalid TuxAI chat history file.");
      return;
    }

    const safeStorage = {};
    for (const [key, value] of Object.entries(data.storageLocal)) {
      if (isChatHistoryStorageKey(key)) safeStorage[key] = value;
    }

    const currentStored = await api.storage.local.get(CHAT_HISTORY_STORAGE_KEYS);
    const removeKeys = Object.keys(currentStored).filter(
      (key) => isChatHistoryStorageKey(key) && !(key in safeStorage)
    );
    if (removeKeys.length) {
      await api.storage.local.remove(removeKeys);
    }
    await api.storage.local.set(safeStorage);

    setStatus("Chat history restored. Reloading...");
    setTimeout(() => location.reload(), 800);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(`Import failed: ${message}`);
  }
}

// ---------- Data collection consent ----------
// TuxAI only transmits data when the user sends a message or selected text to
// an AI endpoint. The Firefox manifest declares `personalCommunications` and
// `websiteContent` as *optional* data-collection permissions, so we must obtain
// the user's consent before the first non-local request. Once granted, Firefox
// remembers the choice, so the prompt appears at most once (and the user can
// revoke it later in about:addons).
const DATA_COLLECTION_TYPES = ["personalCommunications", "websiteContent"];

// Firefox 140+ exposes the built-in data-collection consent API. Chrome and
// older Firefox builds do not, in which case there is nothing for us to gate.
function hasDataCollectionApi() {
  return (
    typeof api !== "undefined" &&
    api.permissions &&
    typeof api.permissions.getAll === "function" &&
    typeof api.permissions.request === "function"
  );
}

async function isDataConsentGranted() {
  if (!hasDataCollectionApi()) return true;
  try {
    const perms = await api.permissions.getAll();
    // The `data_collection` key is only present when the built-in consent
    // system is available.
    if (!perms || !("data_collection" in perms)) return true;
    const granted = Array.isArray(perms.data_collection)
      ? perms.data_collection
      : [];
    return DATA_COLLECTION_TYPES.every((type) => granted.includes(type));
  } catch (error) {
    return true;
  }
}

// Must run from a user gesture (a click); Firefox rejects the request
// otherwise. Returns true when consent is granted.
async function requestDataConsent() {
  if (!hasDataCollectionApi()) return true;
  if (await isDataConsentGranted()) return true;
  try {
    return await api.permissions.request({
      data_collection: DATA_COLLECTION_TYPES,
    });
  } catch (error) {
    return false;
  }
}

// Sending to the user's own machine (a local LLM server) is not data
// collection, so only remote endpoints require consent.
function isLocalEndpoint(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost")
    );
  } catch (error) {
    return false;
  }
}

const DATA_CONSENT_REFUSED_MESSAGE =
  "TuxAI needs your permission before it can send your messages or selected " +
  "text to a cloud provider. Open Settings → Cloud Server to grant it.";

async function ensureDataConsent(endpointUrl) {
  if (isLocalEndpoint(endpointUrl)) return true;
  if (await isDataConsentGranted()) return true;
  if (await requestDataConsent()) return true;
  appendSystemMessage(DATA_CONSENT_REFUSED_MESSAGE);
  return false;
}

// ---------- Mode / connection settings ----------

async function setMode(mode, options = {}) {
  state.mode = mode;
  localStorage.setItem("penguin_mode", mode);
  api.storage.local.set({ penguin_mode: mode }).catch(() => {});

  if (mode === "server") {
    dom.serverType.value = state.serverType;
    await applyServerDefaults();
  } else {
    await loadCloudSettingsForProvider();
  }
  applyTtsModel({ persist: false });
}

async function applyServerDefaults() {
  const type = dom.serverType.value;
  state.serverType = type;
  localStorage.setItem("penguin_server_type", type);
  api.storage.local.set({ penguin_server_type: type }).catch(() => {});
  dom.serverModelList.innerHTML = "";

  const defaults = SERVER_DEFAULTS[type] || SERVER_DEFAULTS.koboldcpp;
  const keys = [`server_url_${type}`, `server_model_${type}`];
  const result = await api.storage.local.get(keys);
  dom.serverUrl.value = result[keys[0]] || defaults.url;
  dom.serverModel.value = result[keys[1]] || defaults.model;
  await renderServerModelManager(type);
}

async function fetchServerModels(options = {}) {
  const silent = !!options.silent;
  const type = dom.serverType.value;
  const baseUrl = dom.serverUrl.value.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    appendSystemMessage("Enter the server endpoint URL before fetching models.");
    return;
  }

  const originalLabel = dom.fetchModelsBtn.textContent;
  dom.fetchModelsBtn.disabled = true;
  dom.fetchModelsBtn.textContent = "Fetching...";
  if (!silent) setStatus("Fetching models...");

  try {
    let models = [];
    let url;

    if (type === "ollama") {
      url = `${baseUrl}/api/tags`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      models = (data.models || []).map((model) => model.name).filter(Boolean);
    } else {
      url = `${baseUrl}/v1/models`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      models = (data.data || [])
        .map((model) => model.id || model.name)
        .filter(Boolean);
    }

    dom.serverModelList.innerHTML = "";
    for (const name of models) {
      const option = document.createElement("option");
      option.value = name;
      dom.serverModelList.appendChild(option);
    }

    await api.storage.local.set({ [`server_model_list_${type}`]: models });
    await renderServerModelManager(type);
    await refreshUnifiedModelSelect();

    if (models.length === 0) {
      if (!silent) {
        setStatus("No models returned");
        appendSystemMessage("The server returned no models.");
      }
      return;
    }

    if (!silent) {
      setStatus(`Found ${models.length} models`);
      appendSystemMessage(`Found ${models.length} model(s) from ${url}`);
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (!silent) {
      setStatus("Fetch failed");
      appendSystemMessage(`Failed to fetch models: ${message}`);
    }
  } finally {
    dom.fetchModelsBtn.disabled = false;
    dom.fetchModelsBtn.textContent = originalLabel;
  }
}

function uniqueModels(models) {
  return [...new Set((Array.isArray(models) ? models : []).filter(Boolean))];
}

function addDeepseekChat(models) {
  const list = uniqueModels(models);
  if (
    dom.cloudProvider.value === "deepseek" &&
    !list.includes("deepseek-chat")
  ) {
    list.unshift("deepseek-chat");
  }
  return list;
}

function createModelManagerRow(model, enabled) {
  const row = document.createElement("div");
  row.className = `model-manager-row${enabled ? "" : " off"}`;

  const name = document.createElement("span");
  name.className = "model-manager-name";
  name.textContent = model;
  name.title = model;

  const label = document.createElement("label");
  label.className = "switch";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = enabled;
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${model}`);
  const track = document.createElement("span");
  track.className = "switch-track";

  label.append(toggle, track);
  row.append(name, label);
  return { row, toggle };
}

function customModelsKey(kind, id) {
  return kind === "server"
    ? `server_custom_models_${id}`
    : `cloud_custom_models_${id}`;
}

async function addCustomModel(kind, id, inputEl) {
  const model = String(inputEl.value || "").trim();
  if (!model) return;

  const key = customModelsKey(kind, id);
  const result = await api.storage.local.get([key]);
  const list = uniqueModels(result[key] || []);
  if (!list.includes(model)) {
    list.push(model);
    await api.storage.local.set({ [key]: list });
  }

  inputEl.value = "";
  if (kind === "server") {
    dom.serverAddModelForm.hidden = true;
    await renderServerModelManager(id);
  } else {
    dom.cloudAddModelForm.hidden = true;
    await renderCloudModelManager(id);
  }
  await refreshUnifiedModelSelect();
}

async function removeCustomModel(kind, id, model) {
  const key = customModelsKey(kind, id);
  const result = await api.storage.local.get([key]);
  const list = uniqueModels(result[key] || []).filter((item) => item !== model);
  await api.storage.local.set({ [key]: list });

  if (kind === "server") {
    await renderServerModelManager(id);
  } else {
    await renderCloudModelManager(id);
  }
  await refreshUnifiedModelSelect();
}

async function renderServerModelManager(type) {
  const defaults = SERVER_DEFAULTS[type] || SERVER_DEFAULTS.koboldcpp;
  const disabledKey = `server_model_disabled_${type}`;
  const customKey = `server_custom_models_${type}`;
  const result = await api.storage.local.get([
    `server_model_${type}`,
    `server_model_list_${type}`,
    customKey,
    disabledKey,
  ]);
  const fetchedModels = uniqueModels(
    result[`server_model_list_${type}`] || []
  );
  const customModels = uniqueModels(result[customKey] || []);
  const modelList = uniqueModels([...fetchedModels, ...customModels]);
  let disabled = uniqueModels(result[disabledKey] || []);
  let current = String(result[`server_model_${type}`] || defaults.model || "");

  dom.serverModelManager.innerHTML = "";
  dom.serverModelCount.textContent = "";

  if (!modelList.length) {
    const empty = document.createElement("div");
    empty.className = "model-manager-empty";
    empty.textContent = "No models yet - click Fetch or add a custom model.";
    dom.serverModelManager.appendChild(empty);
    dom.serverModel.value = current;
    return;
  }

  disabled = disabled.filter((model) => modelList.includes(model));
  const enabledModels = modelList.filter((model) => !disabled.includes(model));

  if (!modelList.includes(current) || disabled.includes(current)) {
    current = enabledModels[0] || "";
  }
  dom.serverModel.value = current;
  await api.storage.local.set({
    [`server_model_${type}`]: current,
    [disabledKey]: disabled,
  });
  dom.serverModelCount.textContent = `${enabledModels.length} of ${modelList.length} enabled`;

  for (const model of modelList) {
    const isEnabled = !disabled.includes(model);
    const { row, toggle } = createModelManagerRow(model, isEnabled);

    toggle.addEventListener("change", async () => {
      const nextDisabled = toggle.checked
        ? disabled.filter((item) => item !== model)
        : uniqueModels([...disabled, model]);

      await api.storage.local.set({ [disabledKey]: nextDisabled });

      if (!toggle.checked && current === model) {
        const remainingEnabled = modelList.filter(
          (item) => !nextDisabled.includes(item)
        );
        current = remainingEnabled[0] || "";
        dom.serverModel.value = current;
        await api.storage.local.set({ [`server_model_${type}`]: current });
      }

      await renderServerModelManager(type);
      await refreshUnifiedModelSelect();
    });

    const isCustomOnly =
      customModels.includes(model) && !fetchedModels.includes(model);
    if (isCustomOnly) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "model-manager-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove custom model";
      removeBtn.setAttribute("aria-label", `Remove custom model ${model}`);
      removeBtn.addEventListener("click", () => {
        removeCustomModel("server", type, model);
      });
      row.appendChild(removeBtn);
    }

    dom.serverModelManager.appendChild(row);
  }
}

function syncHiddenCloudModelSelect(modelList, selected) {
  dom.cloudModelSelect.innerHTML = "";
  for (const model of modelList) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    dom.cloudModelSelect.appendChild(option);
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "No model enabled";
  dom.cloudModelSelect.appendChild(placeholder);
  dom.cloudModelSelect.value = selected || "";
  return selected || "";
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

async function saveCustomCloudProviders(providers) {
  await api.storage.local.set({ [CUSTOM_CLOUD_PROVIDERS_KEY]: providers });
}

function isBuiltInCloudProvider(provider) {
  return BUILT_IN_CLOUD_PROVIDERS.includes(provider);
}

function cloudProviderDefaults(provider) {
  if (BUILT_IN_CLOUD_PROVIDERS.includes(provider)) {
    return CLOUD_DEFAULTS[provider];
  }
  const custom = (state.customCloudProviders || []).find(
    (item) => item.id === provider
  );
  return custom
    ? { kind: "openai", url: custom.url || "", model: "" }
    : { kind: "openai", url: "", model: "" };
}

function cloudProviderKind(provider) {
  return cloudProviderDefaults(provider).kind || "openai";
}

function renderCloudProviderOptions(selectedProvider) {
  dom.cloudProvider.innerHTML = "";

  const providers = [
    ...BUILT_IN_CLOUD_PROVIDERS.map((id) => ({
      id,
      label: cloudProviderLabel(id),
    })),
    ...(state.customCloudProviders || []).map((item) => ({
      id: item.id,
      label: item.name,
    })),
  ];

  for (const provider of providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    dom.cloudProvider.appendChild(option);
  }

  const current =
    selectedProvider && providers.some((item) => item.id === selectedProvider)
      ? selectedProvider
      : providers.length
        ? providers[0].id
        : "deepseek";
  dom.cloudProvider.value = current;
  dom.removeCloudProviderBtn.hidden = isBuiltInCloudProvider(current);
  return current;
}

async function addCloudProvider() {
  const name = dom.addProviderName.value.trim();
  const url = dom.addProviderUrl.value.trim().replace(/\/+$/, "");
  if (!name || !url) {
    appendSystemMessage("Enter both a server name and an API URL.");
    return;
  }

  const customProviders = await getCustomCloudProviders();
  const lowerName = name.toLowerCase();
  const isBuiltInName = BUILT_IN_CLOUD_PROVIDERS.some(
    (id) => cloudProviderLabel(id).toLowerCase() === lowerName
  );
  if (
    isBuiltInName ||
    customProviders.some((item) => item.name.toLowerCase() === lowerName)
  ) {
    appendSystemMessage(`A server named "${name}" already exists.`);
    return;
  }

  const id = `custom_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const provider = { id, name, url };
  customProviders.push(provider);
  await saveCustomCloudProviders(customProviders);
  state.customCloudProviders = customProviders;

  await api.storage.local.set({
    cloud_provider: id,
    [`cloud_api_url_${id}`]: url,
    [`cloud_model_${id}`]: "",
  });

  dom.addProviderName.value = "";
  dom.addProviderUrl.value = "";
  dom.addProviderForm.hidden = true;
  await loadCloudSettingsForProvider();
  await refreshUnifiedModelSelect();
}

async function removeCloudProvider() {
  const provider = dom.cloudProvider.value;
  if (isBuiltInCloudProvider(provider)) return;

  const customProviders = await getCustomCloudProviders();
  const removed = customProviders.find((item) => item.id === provider);
  const remaining = customProviders.filter((item) => item.id !== provider);
  await saveCustomCloudProviders(remaining);
  state.customCloudProviders = remaining;

  await api.storage.local.remove([
    `cloud_api_url_${provider}`,
    `cloud_api_key_${provider}`,
    `cloud_model_${provider}`,
    `cloud_model_list_${provider}`,
    `cloud_model_disabled_${provider}`,
    `cloud_custom_models_${provider}`,
  ]);

  if (removed) {
    appendSystemMessage(`Removed custom server "${removed.name}".`);
  }
  await api.storage.local.set({ cloud_provider: "deepseek" });
  await loadCloudSettingsForProvider();
  await refreshUnifiedModelSelect();
}

async function renderCloudModelManager(provider) {
  const defaults = cloudProviderDefaults(provider);
  const disabledKey = `cloud_model_disabled_${provider}`;
  const customKey = `cloud_custom_models_${provider}`;
  const result = await api.storage.local.get([
    `cloud_api_key_${provider}`,
    `cloud_model_${provider}`,
    `cloud_model_list_${provider}`,
    customKey,
    disabledKey,
  ]);
  let fetchedModels = uniqueModels(
    result[`cloud_model_list_${provider}`] || []
  );
  const customModels = uniqueModels(result[customKey] || []);
  let disabled = uniqueModels(result[disabledKey] || []);
  let current = String(result[`cloud_model_${provider}`] || defaults.model || "");

  // DeepSeek always exposes deepseek-chat once DeepSeek is connected.
  const apiKey = String(result[`cloud_api_key_${provider}`] || "").trim();
  if (
    provider === "deepseek" &&
    apiKey &&
    !fetchedModels.includes("deepseek-chat")
  ) {
    fetchedModels.unshift("deepseek-chat");
  }
  const modelList = uniqueModels([...fetchedModels, ...customModels]);

  dom.cloudModelManager.innerHTML = "";
  dom.cloudModelCount.textContent = "";

  if (!modelList.length) {
    const empty = document.createElement("div");
    empty.className = "model-manager-empty";
    empty.textContent = "No models yet - click Fetch or add a custom model.";
    dom.cloudModelManager.appendChild(empty);
    syncHiddenCloudModelSelect([], "");
    return;
  }

  disabled = disabled.filter((model) => modelList.includes(model));
  const enabledModels = modelList.filter((model) => !disabled.includes(model));

  if (
    !modelList.includes(current) ||
    disabled.includes(current) ||
    !enabledModels.includes(current)
  ) {
    current = enabledModels[0] || "";
  }

  syncHiddenCloudModelSelect(modelList, current);
  await api.storage.local.set({
    [`cloud_model_${provider}`]: current,
    [disabledKey]: disabled,
  });
  dom.cloudModelCount.textContent = `${enabledModels.length} of ${modelList.length} enabled`;

  for (const model of modelList) {
    const isEnabled = !disabled.includes(model);
    const { row, toggle } = createModelManagerRow(model, isEnabled);

    toggle.addEventListener("change", async () => {
      const nextDisabled = toggle.checked
        ? disabled.filter((item) => item !== model)
        : uniqueModels([...disabled, model]);

      await api.storage.local.set({ [disabledKey]: nextDisabled });

      if (!toggle.checked && current === model) {
        const remainingEnabled = modelList.filter(
          (item) => !nextDisabled.includes(item)
        );
        current = remainingEnabled[0] || "";
        syncHiddenCloudModelSelect(modelList, current);
        await api.storage.local.set({ [`cloud_model_${provider}`]: current });
      }

      await renderCloudModelManager(provider);
      await refreshUnifiedModelSelect();
    });

    const isCustomOnly =
      customModels.includes(model) && !fetchedModels.includes(model);
    if (isCustomOnly) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "model-manager-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove custom model";
      removeBtn.setAttribute("aria-label", `Remove custom model ${model}`);
      removeBtn.addEventListener("click", () => {
        removeCustomModel("cloud", provider, model);
      });
      row.appendChild(removeBtn);
    }

    dom.cloudModelManager.appendChild(row);
  }
}

function renderCloudModelOptions(models, preferredModel) {
  const list = uniqueModels(models);
  dom.cloudModelSelect.innerHTML = "";

  if (!list.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No models yet - click Fetch";
    dom.cloudModelSelect.appendChild(placeholder);
    dom.cloudModelSelect.value = "";
    return "";
  }

  for (const model of list) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    dom.cloudModelSelect.appendChild(option);
  }

  const selected =
    preferredModel && list.includes(preferredModel)
      ? preferredModel
      : list[0];
  dom.cloudModelSelect.value = selected;
  return selected;
}

function getCloudModelValue() {
  return dom.cloudModelSelect.value;
}

function saveCloudModel() {
  const provider = dom.cloudProvider.value;
  api.storage.local.set({
    [`cloud_model_${provider}`]: getCloudModelValue(),
  });
}

async function storeCloudModelList(provider, models) {
  try {
    await api.storage.local.set({
      [`cloud_model_list_${provider}`]: uniqueModels(models),
    });
  } catch (error) {
    // No-op.
  }
}

function maybeAutoFetchCloudModels() {
  if (state.mode !== "cloud" || !uiReady) return;
  if (!dom.cloudApiKey.value.trim()) return;
  fetchCloudModels({ silent: true });
}

async function loadCloudSettingsForProvider() {
  const requested = dom.cloudProvider.value || "deepseek";
  state.customCloudProviders = await getCustomCloudProviders();

  const savedResult = await api.storage.local.get(["cloud_provider"]);
  const savedProvider = savedResult.cloud_provider || requested || "deepseek";
  const provider = renderCloudProviderOptions(savedProvider);
  if (savedProvider !== provider) {
    await api.storage.local.set({ cloud_provider: provider });
  }

  const result = await api.storage.local.get([
    `cloud_api_url_${provider}`,
    `cloud_api_key_${provider}`,
    `cloud_model_${provider}`,
    `cloud_model_list_${provider}`,
    `cloud_model_disabled_${provider}`,
  ]);

  const defaults = cloudProviderDefaults(provider);
  dom.cloudApiUrl.value = result[`cloud_api_url_${provider}`] || defaults.url;
  dom.cloudApiKey.value = result[`cloud_api_key_${provider}`] || "";

  await renderCloudModelManager(provider);

  const cloudSettingsVisible =
    !dom.settingsPanel.hidden && activeSettingsTab === "cloud";
  if (
    uiReady &&
    dom.cloudApiKey.value.trim() &&
    (state.mode === "cloud" || cloudSettingsVisible)
  ) {
    fetchCloudModels({ silent: true });
  }
}

async function fetchCloudModels(options = {}) {
  const silent = !!options.silent;
  const provider = dom.cloudProvider.value;
  const baseUrl = dom.cloudApiUrl.value.trim().replace(/\/+$/, "");

  if (!baseUrl) {
    if (!silent) {
      appendSystemMessage("Enter the cloud API URL before fetching models.");
    }
    return;
  }

  const apiKey = dom.cloudApiKey.value.trim();
  const originalLabel = dom.fetchCloudModelsBtn.textContent;
  dom.fetchCloudModelsBtn.disabled = true;
  dom.fetchCloudModelsBtn.textContent = "Fetching...";
  if (!silent) setStatus("Fetching models...");

  try {
    const kind = cloudProviderKind(provider);
    const headers = { "Content-Type": "application/json" };
    let url;
    let fetchedModels = [];

    if (kind === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      url = `${baseUrl}/v1/models`;
    } else if (kind === "gemini") {
      url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    } else {
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      url = `${baseUrl}/v1/models`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    if (kind === "gemini") {
      fetchedModels = (data.models || [])
        .map((model) => String(model.name || "").replace(/^models\//, ""))
        .filter(Boolean);
    } else if (kind === "cohere") {
      fetchedModels = (data.models || [])
        .map((model) => model.name || model.id)
        .filter(Boolean);
    } else if (kind === "anthropic") {
      const modelList = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.models)
          ? data.models
          : [];
      fetchedModels = modelList
        .map((model) => model.id || model.name)
        .filter(Boolean);
    } else {
      fetchedModels = (data.data || [])
        .map((model) => model.id || model.name)
        .filter(Boolean);
    }

    const mergedList = addDeepseekChat(fetchedModels);
    await storeCloudModelList(provider, mergedList);

    await renderCloudModelManager(provider);
    await refreshUnifiedModelSelect();

    if (!silent) {
      setStatus(`Found ${fetchedModels.length} models`);
      appendSystemMessage(
        `Found ${fetchedModels.length} model(s) from ${baseUrl}/v1/models`
      );
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (!silent) {
      setStatus("Fetch failed");
      appendSystemMessage(`Failed to fetch models: ${message}`);
    }
  } finally {
    dom.fetchCloudModelsBtn.disabled = false;
    dom.fetchCloudModelsBtn.textContent = originalLabel;
  }
}

async function restoreConnectionSettings() {
  const savedServerType =
    localStorage.getItem("penguin_server_type") || "ollama";
  state.serverType = SERVER_TYPES.has(savedServerType)
    ? savedServerType
    : "ollama";
  dom.serverType.value = state.serverType;
  applyServerDefaults();

  const cloudResult = await api.storage.local.get(["cloud_provider"]);
  const provider = cloudResult.cloud_provider || "deepseek";
  dom.cloudProvider.value = provider;
  await loadCloudSettingsForProvider();
}

// ---------- Tools ----------

function effectiveTools() {
  return effectiveToolsFromState(state.toolState);
}

// ---------- Per-tool model picker ----------
// Mirrors the composer's model picker. An empty modelRef means "same as
// chat": the tool follows the model currently selected above the chat box.

function toolModelSameAsChatLabel() {
  const current = currentQuickModelId();
  const label = current ? toolModelRefLabel(current) : "";
  const base = t("tools.sameAsChatModel", "Same as chat");
  return label ? `${base} · ${label}` : base;
}

function toolModelRefLabel(ref) {
  const found = (state.modelOptions || []).find((item) => item.id === ref);
  if (found) return cleanModelLabel(found.label);
  const parts = String(ref || "").split("::");
  const model = parts.slice(2).join("::");
  return displayModelName(model) || ref;
}

function updateToolModelTrigger() {
  if (!dom.toolModelLabel || !dom.toolModelTrigger) return;
  const ref = state.editingToolModelRef || "";
  const effective = ref || currentQuickModelId() || "";
  const label = ref ? toolModelRefLabel(ref) : toolModelSameAsChatLabel();

  dom.toolModelLabel.textContent = "";
  const kind = quickModelKindFromId(effective);
  if (kind) dom.toolModelLabel.appendChild(createModelIconElement(kind));
  const text = document.createElement("span");
  text.textContent = label || t("composer.noModel", "No model selected");
  dom.toolModelLabel.appendChild(text);
  dom.toolModelTrigger.title =
    label || t("composer.switchModel", "Switch model");
}

function renderToolModelMenu() {
  if (!dom.toolModelMenu) return;
  dom.toolModelMenu.innerHTML = "";

  const selectedRef = state.editingToolModelRef || "";

  const sameButton = document.createElement("button");
  sameButton.type = "button";
  sameButton.className = "quick-model-option" + (selectedRef ? "" : " active");
  sameButton.setAttribute("role", "option");
  sameButton.setAttribute("aria-selected", String(!selectedRef));
  const sameText = document.createElement("span");
  sameText.textContent = toolModelSameAsChatLabel();
  sameButton.appendChild(sameText);
  sameButton.addEventListener("click", () => selectToolModelOption(""));
  dom.toolModelMenu.appendChild(sameButton);

  let currentGroup = null;
  const options = state.modelOptions || [];
  for (const item of options) {
    if (item.group !== currentGroup) {
      const title = document.createElement("div");
      title.className = "quick-model-group-title";
      title.textContent = item.group;
      dom.toolModelMenu.appendChild(title);
      currentGroup = item.group;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "quick-model-option" + (item.id === selectedRef ? " active" : "");
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(item.id === selectedRef));

    const kind = quickModelKindFromId(item.id);
    if (kind) button.appendChild(createModelIconElement(kind));

    const text = document.createElement("span");
    text.textContent = cleanModelLabel(item.label);
    button.appendChild(text);

    button.addEventListener("click", () => selectToolModelOption(item.id));
    dom.toolModelMenu.appendChild(button);
  }

  // Keep a previously chosen model visible even if it is no longer in the
  // fetched list, so the user can see and change it.
  if (selectedRef && !options.some((item) => item.id === selectedRef)) {
    const title = document.createElement("div");
    title.className = "quick-model-group-title";
    title.textContent = t("tools.modelUnavailable", "Unavailable");
    dom.toolModelMenu.appendChild(title);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-model-option active";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "true");
    const text = document.createElement("span");
    text.textContent = toolModelRefLabel(selectedRef);
    button.appendChild(text);
    button.addEventListener("click", () => selectToolModelOption(selectedRef));
    dom.toolModelMenu.appendChild(button);
  }
}

function selectToolModelOption(value) {
  state.editingToolModelRef = value || "";
  closeToolModelMenu();
  updateToolModelTrigger();
  renderToolModelMenu();
}

function toggleToolModelMenu() {
  if (!dom.toolModelMenu) return;
  if (dom.toolModelMenu.hidden) openToolModelMenu();
  else closeToolModelMenu();
}

function openToolModelMenu() {
  if (!dom.toolModelMenu) return;
  dom.toolModelMenu.hidden = false;
  dom.toolModelTrigger.setAttribute("aria-expanded", "true");
}

function closeToolModelMenu() {
  if (!dom.toolModelMenu) return;
  dom.toolModelMenu.hidden = true;
  dom.toolModelTrigger.setAttribute("aria-expanded", "false");
}

async function refreshToolModelSelect() {
  if (!dom.toolModelMenu) return;
  try {
    state.modelOptions = await collectModelOptions();
  } catch (error) {
    // Keep the previously collected options on failure.
  }
  renderToolModelMenu();
  updateToolModelTrigger();
}

function renderTools() {
  const tools = effectiveTools();

  dom.manageTool.innerHTML = "";

  for (const tool of tools) {
    const manageOption = document.createElement("option");
    manageOption.value = tool.id;
    manageOption.textContent = tool.name;
    dom.manageTool.appendChild(manageOption);
  }

  if (dom.manageTool.value) {
    state.editingToolId = dom.manageTool.value;
  } else if (tools.length) {
    state.editingToolId = tools[0].id;
    dom.manageTool.value = tools[0].id;
  }

  renderManageFields();

  if (!dom.selectionPanel.hidden) renderSelectionTools();
}

function renderManageFields() {
  const tools = effectiveTools();
  const tool = tools.find((item) => item.id === state.editingToolId);

  if (tool) {
    dom.toolName.value = tool.name;
    dom.toolPrompt.value = tool.prompt;
    state.editingToolModelRef = tool.modelRef || "";
    dom.toolName.disabled = false;
    dom.toolPrompt.disabled = false;
    dom.saveTool.disabled = false;
    dom.deleteTool.disabled = false;
  } else {
    dom.toolName.value = "";
    dom.toolPrompt.value = "";
    state.editingToolModelRef = "";
    dom.toolName.disabled = false;
    dom.toolPrompt.disabled = false;
    dom.saveTool.disabled = false;
    dom.deleteTool.disabled = true;
  }

  updateToolModelTrigger();
  renderToolModelMenu();
}

function startNewTool() {
  state.editingToolId = "custom_" + Date.now();
  state.editingToolModelRef = "";
  dom.toolName.value = "New Tool";
  dom.toolPrompt.value = "";
  dom.toolName.disabled = false;
  dom.toolPrompt.disabled = false;
  dom.saveTool.disabled = false;
  dom.deleteTool.disabled = true;
  updateToolModelTrigger();
  renderToolModelMenu();
}

async function saveTool() {
  const name = dom.toolName.value.trim();
  const prompt = dom.toolPrompt.value.trim();
  if (!name || !prompt) {
    appendSystemMessage("Tool name and system prompt are required.");
    return;
  }

  const tool = {
    id: state.editingToolId,
    name,
    prompt,
    modelRef: state.editingToolModelRef || "",
  };

  if (isBuiltInTool(state.editingToolId)) {
    state.toolState.overrides[state.editingToolId] = tool;
    state.toolState.deleted = state.toolState.deleted.filter(
      (id) => id !== state.editingToolId
    );
  } else {
    const customTools = [...state.toolState.customTools];
    const existingIndex = customTools.findIndex(
      (item) => item.id === state.editingToolId
    );
    if (existingIndex >= 0) customTools[existingIndex] = tool;
    else customTools.push(tool);
    state.toolState.customTools = customTools;
  }

  await api.storage.local.set({
    [TOOL_STORAGE_KEYS.custom]: state.toolState.customTools,
    [TOOL_STORAGE_KEYS.overrides]: state.toolState.overrides,
    [TOOL_STORAGE_KEYS.deleted]: state.toolState.deleted,
  });

  renderTools();
  dom.manageTool.value = state.editingToolId;
  appendSystemMessage(`Tool "${name}" saved.`);
}

async function deleteTool() {
  const toolId = state.editingToolId;
  if (!toolId) return;

  if (isBuiltInTool(toolId)) {
    if (!state.toolState.deleted.includes(toolId)) {
      state.toolState.deleted.push(toolId);
    }
    delete state.toolState.overrides[toolId];
  } else {
    state.toolState.customTools = state.toolState.customTools.filter(
      (item) => item.id !== toolId
    );
  }

  await api.storage.local.set({
    [TOOL_STORAGE_KEYS.custom]: state.toolState.customTools,
    [TOOL_STORAGE_KEYS.overrides]: state.toolState.overrides,
    [TOOL_STORAGE_KEYS.deleted]: state.toolState.deleted,
  });

  renderTools();
}

async function resetTools() {
  state.toolState.overrides = {};
  state.toolState.deleted = [];

  await api.storage.local.set({
    [TOOL_STORAGE_KEYS.custom]: state.toolState.customTools,
    [TOOL_STORAGE_KEYS.overrides]: {},
    [TOOL_STORAGE_KEYS.deleted]: [],
  });

  renderTools();
  appendSystemMessage("Default tools restored.");
}

// ---------- Selected text from page ----------

function showSelectedText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;

  state.selectedText = trimmed;
  dom.selectedTextPreview.textContent =
    trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
  dom.selectionPanel.hidden = false;
  renderSelectionTools();
}

function clearSelectedText() {
  state.selectedText = "";
  dom.selectionPanel.hidden = true;
  dom.selectedTextPreview.textContent = "";
  dom.selectionTools.innerHTML = "";
}

function renderSelectionTools() {
  dom.selectionTools.innerHTML = "";
  const tools = effectiveTools();
  for (const tool of tools) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tool-chip";
    button.textContent = tool.name;
    button.dataset.toolId = tool.id;
    dom.selectionTools.appendChild(button);
  }
}

function bindSelectionTools() {
  dom.selectionTools.addEventListener("click", (event) => {
    const button = event.target.closest(".tool-chip");
    if (!button || !dom.selectionPanel.contains(button)) return;
    const toolId = button.dataset.toolId;
    if (!toolId) return;
    runSelectedTool(toolId);
  });
}

async function processPendingSelectedText() {
  try {
    const result = await api.storage.local.get([SELECTED_TEXT_KEY]);
    const payload = result[SELECTED_TEXT_KEY];
    if (payload && payload.text) {
      showSelectedText(payload.text);
      await api.storage.local.remove([SELECTED_TEXT_KEY]);
    }
  } catch (error) {
    // No-op.
  }
}

// ---------- Chat rendering ----------

function appendSystemMessage(text) {
  setStatus(String(text || ""));
}

function collapsedUserPreview(text) {
  const full = String(text || "").replace(/\r\n/g, "\n");
  const lines = full.split("\n");
  const firstLine = lines.map((line) => line.trim()).find(Boolean) || "";
  const hasMore = full.trim().length > firstLine.length || lines.length > 1;
  return { text: firstLine, hasMore };
}

function toggleUserMessageCollapse(messageEl) {
  const bubble = messageEl.querySelector(".bubble");
  if (!bubble || !messageEl._rawText) return;
  const fullText = String(messageEl._rawText || "");

  if (messageEl._collapsed) {
    bubble.textContent = fullText;
    bubble.classList.remove("collapsed-quote");
    messageEl._collapsed = false;
    bubble.title = "Click to collapse";
  } else {
    const preview = collapsedUserPreview(fullText);
    bubble.textContent = preview.hasMore
      ? `${preview.text}…`
      : preview.text;
    bubble.classList.add("collapsed-quote");
    messageEl._collapsed = true;
    bubble.title = "Click to expand";
  }
}

function appendMessage(role, content, options = {}) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;
  messageEl._rawText = String(content || "");

  if (role !== "system") {
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent =
      role === "user"
        ? t("role.you")
        : options.label || t("role.assistant");
    messageEl.appendChild(label);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (role === "ai") {
    const contentEl = document.createElement("div");
    contentEl.className = "message-content";
    contentEl.innerHTML = renderMarkdown(content || t("msg.thinking"));
    decorateCodeBlocks(contentEl);
    bubble.appendChild(contentEl);
    messageEl._contentEl = contentEl;
  } else {
    bubble.textContent = content;

    if (options && options.collapseUserText && String(content || "").trim()) {
      const preview = collapsedUserPreview(content);
      bubble.textContent = preview.hasMore
        ? `${preview.text}…`
        : preview.text;
      bubble.classList.add("user-collapsible", "collapsed-quote");
      messageEl._collapsed = true;
      bubble.title = "Click to expand";
      bubble.addEventListener("click", () => {
        toggleUserMessageCollapse(messageEl);
      });
    }
  }

  messageEl.appendChild(bubble);

  if (role !== "system") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.appendChild(createCopyMessageButton(messageEl));
    actions.appendChild(createSpeakMessageButton(messageEl));
    messageEl.appendChild(actions);
  }

  dom.chat.appendChild(messageEl);
  scrollChatToBottom(true);
  return messageEl;
}

function updateAssistantContent(messageEl, rawText) {
  if (messageEl._contentEl) {
    messageEl._contentEl.innerHTML = renderMarkdown(rawText || "");
    decorateCodeBlocks(messageEl._contentEl);
    if (messageEl._answerBubble) {
      messageEl._answerBubble.hidden = !String(rawText || "").trim();
    }
    scrollStreamingMessageIntoView(messageEl);
  }
}

// In thinking mode the reasoning is shown in its own box; put the final
// answer into a separate bubble so it stands out from the reasoning.
function createAnswerBubble(messageEl) {
  if (messageEl._answerBubble) return messageEl._answerBubble;
  const bubble = messageEl.querySelector(".bubble");
  const contentEl = messageEl._contentEl;
  if (!bubble || !contentEl) return null;

  const answerBubble = document.createElement("div");
  answerBubble.className = "answer-bubble";
  answerBubble.hidden = !String(messageEl._rawText || "").trim();

  bubble.appendChild(answerBubble);
  answerBubble.appendChild(contentEl);
  bubble.classList.add("has-reasoning");

  messageEl._answerBubble = answerBubble;
  return answerBubble;
}

function createReasoningBox(messageEl) {
  const bubble = messageEl.querySelector(".bubble");
  const reasoningBox = document.createElement("div");
  reasoningBox.className = "reasoning-box";
  reasoningBox.hidden = true;

  const header = document.createElement("div");
  header.className = "reasoning-header";
  header.textContent = "Reasoning";
  reasoningBox.appendChild(header);

  const content = document.createElement("div");
  content.className = "reasoning-content";
  reasoningBox.appendChild(content);

  reasoningBox.addEventListener("click", () => {
    reasoningBox.classList.toggle("expanded");
  });

  if (bubble.firstChild) {
    bubble.insertBefore(reasoningBox, bubble.firstChild);
  } else {
    bubble.appendChild(reasoningBox);
  }

  messageEl._reasoningBox = reasoningBox;
  messageEl._reasoningContentEl = content;
  messageEl._rawReasoning = "";
}

function updateReasoningBox(messageEl, rawText) {
  if (!messageEl._reasoningBox) return;
  createAnswerBubble(messageEl);
  messageEl._reasoningBox.hidden = false;
  if (!messageEl._reasoningBox.classList.contains("expanded")) {
    messageEl._reasoningBox.classList.add("expanded");
  }
  messageEl._reasoningContentEl.textContent = rawText;
  scrollStreamingMessageIntoView(messageEl);
}

function isChatNearBottom(threshold = 48) {
  if (!dom.chat) return true;
  return dom.chat.scrollHeight - dom.chat.scrollTop - dom.chat.clientHeight < threshold;
}

// Show the floating button whenever the latest message is out of view.
function updateScrollToBottomButton() {
  if (!dom.scrollToBottomBtn) return;
  dom.scrollToBottomBtn.hidden = isChatNearBottom(80);
}

function scrollChatToBottom(force = false) {
  if (!dom.chat) return;
  if (!force && autoScrollMode === "off") return;
  dom.chat.scrollTop = dom.chat.scrollHeight;
  updateScrollToBottomButton();
}

// Keeps a streaming reply visible. In "top" mode it scrolls only until the
// pinned element's top edge is near the top of the viewport; in "bottom" mode
// it keeps chasing the newest text.
//
// The pin-and-stop behavior is reserved for the final answer bubble: while the
// model is still thinking (reasoning box visible, no answer text yet), the
// newest reasoning text is followed like in "bottom" mode so auto-scrolling
// does not stop on the reasoning bubble.
function scrollStreamingMessageIntoView(messageEl) {
  if (
    dom.chat &&
    messageEl &&
    messageEl.isConnected &&
    autoScrollMode !== "off"
  ) {
    const answerBubble = messageEl._answerBubble;
    const answerActive = Boolean(answerBubble) && !answerBubble.hidden;
    const reasoningActive =
      Boolean(messageEl._reasoningBox) && !messageEl._reasoningBox.hidden;

    if (autoScrollMode === "top" && reasoningActive && !answerActive) {
      dom.chat.scrollTo({ top: dom.chat.scrollHeight, behavior: "instant" });
    } else {
      const maxScroll = dom.chat.scrollHeight - dom.chat.clientHeight;
      let target = maxScroll;

      if (autoScrollMode === "top") {
        const anchor = answerActive ? answerBubble : messageEl;
        const chatRect = dom.chat.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const anchorTop = anchorRect.top - chatRect.top + dom.chat.scrollTop;
        target = Math.max(0, Math.min(maxScroll, anchorTop - STREAM_TOP_MARGIN));
      }

      // Never scroll up: the user may have moved ahead of the pinned position.
      if (target > dom.chat.scrollTop + 1) {
        dom.chat.scrollTo({ top: target, behavior: "instant" });
      }
    }
  }
  updateScrollToBottomButton();
}

// Jump to the latest message and switch to full bottom-following until the
// user scrolls away again.
function jumpToLatest() {
  if (!dom.chat) return;
  autoScrollMode = "bottom";
  dom.chat.scrollTop = dom.chat.scrollHeight;
  updateScrollToBottomButton();
}

function setStatus(text) {
  if (dom.chatStatus) {
    dom.chatStatus.textContent = text;
    dom.chatStatus.title = text;
  }
}

function plainTextFromMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();
}

function copyableMessageText(messageEl) {
  const raw = String(messageEl._rawText || "").trim();
  if (messageEl.classList.contains("ai")) {
    if (raw) return plainTextFromMarkdown(raw);
    const contentEl = messageEl._contentEl;
    return contentEl ? String(contentEl.textContent || "").trim() : "";
  }
  return raw;
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    // Fall back to execCommand below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch (error) {
    return false;
  }
}

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// Give every fenced code block in an assistant message its own copy button so
// users can copy a single snippet instead of the whole reply.
function decorateCodeBlocks(container) {
  if (!container || !container.querySelectorAll) return;
  const blocks = container.querySelectorAll("pre");
  for (const pre of blocks) {
    if (pre.parentElement && pre.parentElement.classList.contains("code-block")) {
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const header = document.createElement("div");
    header.className = "code-block-header";

    const langEl = pre.querySelector("code[class*='language-']");
    const lang = langEl
      ? (langEl.className.match(/language-([^\s]+)/) || [])[1] || ""
      : "";
    const label = document.createElement("span");
    label.className = "code-block-lang";
    label.textContent = lang;
    header.appendChild(label);

    header.appendChild(createCopyCodeButton(pre));
    wrapper.insertBefore(header, pre);
  }
}

function createCopyCodeButton(pre) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-code-btn";
  button.title = t("msg.copyCode", "Copy code");
  button.setAttribute("aria-label", "Copy code block");
  button.innerHTML = COPY_ICON;

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const codeEl = pre.querySelector("code");
    const text = codeEl ? String(codeEl.textContent || "") : "";
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    button.classList.add("copied");
    button.innerHTML = ok ? CHECK_ICON : COPY_ICON;
    button.title = ok ? t("msg.copied", "Copied!") : t("msg.copyFailed", "Copy failed");
    setTimeout(() => {
      button.classList.remove("copied");
      button.innerHTML = COPY_ICON;
      button.title = t("msg.copyCode", "Copy code");
    }, 1200);
  });

  return button;
}

function createCopyMessageButton(messageEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-message-btn";
  button.title = t("msg.copy", "Copy message");
  button.setAttribute("aria-label", "Copy message text");
  button.innerHTML = COPY_ICON;
  button.addEventListener("click", async () => {
    const text = copyableMessageText(messageEl);
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    button.classList.add("copied");
    button.innerHTML = ok ? CHECK_ICON : COPY_ICON;
    button.title = ok ? t("msg.copied", "Copied!") : t("msg.copyFailed", "Copy failed");
    setTimeout(() => {
      button.classList.remove("copied");
      button.innerHTML = COPY_ICON;
      button.title = t("msg.copy", "Copy message");
    }, 1200);
  });

  return button;
}

// ---------- Text to speech ----------

let activeSpeech = null;

// Guards against the very common "gpt-40" (zero) / "gpt-4o" (letter o) typo.
function normalizeTtsModelName(model) {
  return String(model || "")
    .trim()
    .replace(/^gpt-40(?=[-_]|$)/i, "gpt-4o");
}

function ttsModelValue() {
  return normalizeTtsModelName(dom.ttsModel ? dom.ttsModel.value : "");
}

function ttsVoiceValue() {
  const voice = dom.ttsVoice ? dom.ttsVoice.value.trim() : "";
  return voice || DEFAULT_TTS_VOICE;
}

function defaultTtsModel(provider) {
  return provider === "openai" ? "gpt-4o-mini-tts" : "tts-1";
}

// Decide whether the currently selected provider/model can speak. Only
// OpenAI-compatible endpoints expose the /v1/audio/speech route.
function getTtsConfig() {
  let baseUrl = "";
  let headers = { "Content-Type": "application/json" };

  // A dedicated TTS endpoint/provider is independent of the chat model, so a
  // user can chat with DeepSeek and speak with OpenAI at the same time.
  const dedicatedUrl = dom.ttsUrl ? dom.ttsUrl.value.trim() : "";
  const dedicatedKey = dom.ttsKey ? dom.ttsKey.value.trim() : "";
  const ttsProvider = dom.ttsProvider ? dom.ttsProvider.value : "";

  if (dedicatedUrl) {
    baseUrl = dedicatedUrl.replace(/\/+$/, "");
    if (dedicatedKey) {
      headers.Authorization = `Bearer ${dedicatedKey}`;
    }
  } else if (ttsProvider) {
    // Reuse the stored cloud credentials of the chosen TTS provider.
    const kind = cloudProviderKind(ttsProvider);
    if (kind !== "openai") {
      return {
        supported: false,
        reason: `${cloudProviderLabel(
          ttsProvider
        )} does not expose an OpenAI-compatible speech endpoint.`,
      };
    }
    const endpoint = cloudProviderDefaults(ttsProvider);
    const store = state.cloudStore || {};
    baseUrl = String(
      store[`cloud_api_url_${ttsProvider}`] || endpoint.url || ""
    ).replace(/\/+$/, "");
    const apiKey =
      dedicatedKey || String(store[`cloud_api_key_${ttsProvider}`] || "").trim();
    if (!baseUrl) {
      return {
        supported: false,
        reason: `Set the API URL for ${cloudProviderLabel(ttsProvider)}.`,
      };
    }
    if (!apiKey) {
      return {
        supported: false,
        reason: `Add an API key for ${cloudProviderLabel(
          ttsProvider
        )} in the Cloud Server tab, or paste it in the TTS API key field.`,
      };
    }
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  } else if (state.mode === "cloud") {
    const provider = dom.cloudProvider.value;
    const kind = cloudProviderKind(provider);
    if (kind !== "openai") {
      return {
        supported: false,
        reason: `${cloudProviderLabel(
          provider
        )} does not expose an OpenAI-compatible speech endpoint. Pick a TTS provider above or switch to an OpenAI-compatible chat provider.`,
      };
    }

    const endpoint = cloudProviderDefaults(provider);
    baseUrl = (dom.cloudApiUrl.value.trim() || endpoint.url || "").replace(
      /\/+$/,
      ""
    );
    const apiKey = dedicatedKey || dom.cloudApiKey.value.trim();
    if (!baseUrl || !apiKey) {
      return {
        supported: false,
        reason: "Set the cloud API URL and API key to use text-to-speech.",
      };
    }
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  } else {
    const type = dom.serverType.value;
    if (type === "ollama") {
      return {
        supported: false,
        reason: "Ollama does not expose a text-to-speech endpoint.",
      };
    }
    baseUrl = dom.serverUrl.value.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      return {
        supported: false,
        reason: "Set the local server URL to use text-to-speech.",
      };
    }
  }

  // Only recognized TTS models can speak through /v1/audio/speech.
  const model = effectiveTtsModel();
  if (!knownTtsVoices(model)) {
    return {
      supported: false,
      reason: `"${model}" is not recognized as a text-to-speech model.`,
    };
  }

  return {
    supported: true,
    url: `${baseUrl}/v1/audio/speech`,
    headers,
    model,
    voice: ttsVoiceValue(),
  };
}

function stopActiveSpeech() {
  if (!activeSpeech) return;
  const { controller, audio, url, restore } = activeSpeech;
  activeSpeech = null;

  if (controller) {
    try {
      controller.abort();
    } catch (error) {
      // No-op.
    }
  }
  if (audio) {
    try {
      audio.pause();
    } catch (error) {
      // No-op.
    }
  }
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      // No-op.
    }
  }
  if (restore) restore();
}

function updateSpeakButtonVisibility(button) {
  const config = getTtsConfig();
  button.hidden = !config.supported;
  button.title = config.supported
    ? t("msg.readAloud", "Read aloud")
    : config.reason || "Text-to-speech is not available.";
  if (!config.supported) button.disabled = true;
  else button.disabled = false;
}

function refreshSpeakButtons() {
  document
    .querySelectorAll(".speak-message-btn")
    .forEach(updateSpeakButtonVisibility);
}

// UI states shared by the message speaker button and the settings "Test"
// button. `restore` is called when playback stops or is aborted.
function messageSpeechUi(button, icons) {
  return {
    loading() {
      button.classList.add("loading");
      button.classList.remove("speaking");
      button.innerHTML = icons.speak;
      button.title = t("popup.generating", "Generating speech...");
      button.disabled = false;
    },
    speaking() {
      button.classList.remove("loading");
      button.classList.add("speaking");
      button.innerHTML = icons.stop;
      button.title = t("msg.stopReading", "Stop reading");
    },
    error() {
      button.classList.remove("loading", "speaking");
      button.innerHTML = icons.error;
      button.title = t("msg.ttsFailed", "Text-to-speech failed");
      button.disabled = false;
    },
    restore() {
      button.classList.remove("loading", "speaking");
      button.innerHTML = icons.speak;
      button.title = t("msg.readAloud", "Read aloud");
      button.disabled = false;
    },
  };
}

function textButtonSpeechUi(button, idleLabel) {
  return {
    loading() {
      button.classList.remove("speaking");
      button.disabled = true;
      button.textContent = "Loading...";
    },
    speaking() {
      button.classList.add("speaking");
      button.disabled = false;
      button.textContent = "Stop";
    },
    error() {
      button.classList.remove("speaking");
      button.disabled = false;
      button.textContent = "Failed";
    },
    restore() {
      button.classList.remove("speaking");
      button.disabled = false;
      button.textContent = idleLabel || "Test";
    },
  };
}

async function startSpeech(text, button, ui) {
  const value = String(text || "").trim();
  if (!value) return;

  const config = getTtsConfig();
  if (!config.supported) {
    appendSystemMessage(config.reason || "Text-to-speech is not available.");
    return;
  }

  if (!(await ensureDataConsent(config.url))) return;

  stopActiveSpeech();

  const controller = new AbortController();
  activeSpeech = { button, controller, audio: null, url: null, restore: ui.restore };
  ui.loading();

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        input: value,
        voice: config.voice,
        response_format: "mp3",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}${detail ? ` - ${detail.slice(0, 240)}` : ""}`
      );
    }

    const blob = await response.blob();
    if (!activeSpeech || activeSpeech.button !== button) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeSpeech.audio = audio;
    activeSpeech.url = url;
    ui.speaking();

    audio.addEventListener("ended", () => {
      if (activeSpeech && activeSpeech.audio === audio) stopActiveSpeech();
    });
    audio.addEventListener("error", () => {
      if (activeSpeech && activeSpeech.audio === audio) {
        stopActiveSpeech();
        appendSystemMessage("Audio playback failed.");
      }
    });

    await audio.play();
  } catch (error) {
    if (error && error.name === "AbortError") return;

    const wasActive = activeSpeech && activeSpeech.button === button;
    if (wasActive) activeSpeech = null;

    ui.error();

    const message = error && error.message ? error.message : String(error);
    appendSystemMessage(`Text-to-speech failed: ${message}`);

    setTimeout(() => {
      if (activeSpeech && activeSpeech.button === button) return;
      ui.restore();
    }, 1800);
  }
}

function speakMessage(messageEl, button, icons) {
  const text = copyableMessageText(messageEl);
  if (!text) return;
  startSpeech(text, button, messageSpeechUi(button, icons));
}

function testTtsVoice() {
  const config = getTtsConfig();
  if (!config.supported) {
    appendSystemMessage(config.reason || "Text-to-speech is not available.");
    return;
  }
  if (!dom.ttsVoice || !dom.ttsVoice.value) {
    appendSystemMessage("Load a TTS model and pick a voice first.");
    return;
  }
  const ui = textButtonSpeechUi(dom.ttsTestVoice, "Test");
  startSpeech(TTS_TEST_SENTENCE, dom.ttsTestVoice, ui);
}

function createSpeakMessageButton(messageEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "speak-message-btn";
  button.title = t("msg.readAloud", "Read aloud");
  button.setAttribute("aria-label", "Read message aloud");

  const icons = {
    speak:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
    stop:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  };

  button.innerHTML = icons.speak;
  updateSpeakButtonVisibility(button);

  button.addEventListener("click", () => {
    if (activeSpeech && activeSpeech.button === button) {
      stopActiveSpeech();
      return;
    }
    speakMessage(messageEl, button, icons);
  });

  return button;
}

// ---------- Chat actions ----------

function autoResizeInput() {
  dom.messageInput.style.height = "42px";
  dom.messageInput.style.height = `${Math.min(dom.messageInput.scrollHeight, 140)}px`;
}

function appendContextChip(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const chip = document.createElement("div");
  chip.className = "context-chip";
  chip.title = "Click to expand/collapse selected text";

  const content = document.createElement("div");
  content.className = "context-chip-text";
  content.textContent = trimmed;
  chip.appendChild(content);

  chip.addEventListener("click", () => {
    chip.classList.toggle("expanded");
  });

  dom.chat.appendChild(chip);
  scrollChatToBottom(true);
  return chip;
}

function updateSendButton() {
  const hasText = dom.messageInput.value.trim().length > 0;
  const hasAttachment = state.attachments.length > 0;
  if (state.generating) {
    dom.sendBtn.disabled = false;
    dom.sendBtn.classList.add("generating");
    dom.sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
    dom.sendBtn.title = "Stop generation";
  } else {
    dom.sendBtn.classList.remove("generating");
    dom.sendBtn.disabled = !hasText && !hasAttachment;
    dom.sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4z"></path></svg>';
    dom.sendBtn.title = "Send message";
  }
}

async function submit() {
  if (state.generating) {
    stopGenerating();
    return;
  }

  const userText = dom.messageInput.value.trim();
  if (!userText && !state.attachments.length) return;

  const selectedContext = state.selectedText.trim();
  if (selectedContext) {
    appendContextChip(selectedContext);
    clearSelectedText();
  }

  await runNormalChat({
    userText,
    clearComposer: true,
    selectedContext,
  });
}

async function runNormalChat({ userText, clearComposer, selectedContext }) {
  await runStreamedChat({
    userText,
    clearComposer,
    systemPrompt: "",
    labelName: "",
    selectedContext: selectedContext || state.selectedText,
  });
}

async function runSelectedTool(toolId) {
  const text = state.selectedText.trim();
  if (!text) return;

  if (state.generating) {
    appendSystemMessage("Wait for the current generation to finish first.");
    return;
  }

  const tool = effectiveTools().find((item) => item.id === toolId);
  if (!tool) {
    appendSystemMessage(`Tool "${toolId}" is no longer available.`);
    return;
  }

  await runToolRequest({ tool, userText: text, clearComposer: false });
}

async function runToolRequest({ tool, userText, clearComposer }) {
  await runStreamedChat({
    userText,
    clearComposer,
    systemPrompt: tool.prompt,
    labelName: tool.name,
    selectedContext: "",
    collapseUserText: true,
    modelRef: tool.modelRef || "",
  });
}

async function runStreamedChat({
  userText,
  clearComposer,
  systemPrompt,
  labelName,
  selectedContext,
  collapseUserText = false,
  modelRef = "",
}) {
  let override = null;
  if (modelRef) {
    override = await resolveToolConnection(modelRef);
    if (!override) {
      appendSystemMessage(
        "The model selected for this tool is no longer available. Pick another model in Settings > Tools."
      );
      return;
    }
  }

  const configError = validateConnection(override);
  if (configError) {
    appendSystemMessage(configError);
    return;
  }

  const effectiveMode = override ? override.mode : state.mode;
  if (effectiveMode === "cloud") {
    const config = buildRequestConfig([], override);
    if (!(await ensureDataConsent(config.url))) return;
  }

  const contextSize = parseInt(dom.contextSize.value || "8192", 10);
  const estimated = estimateTokens(userText);
  const available = contextSize - 800;
  if (estimated > available) {
    appendSystemMessage(
      `Your message is too large (~${estimated.toLocaleString()} tokens) for the selected context size (${contextSize.toLocaleString()}).`
    );
    return;
  }

  trimHistoryToFit(estimated, contextSize);

  const attachmentNames = state.attachments
    .map((a) => a.name)
    .join(", ");
  const displayUserText =
    userText ||
    (attachmentNames ? `[Attached: ${attachmentNames}]` : "");
  appendMessage("user", displayUserText, { collapseUserText });
  if (clearComposer) {
    dom.messageInput.value = "";
    dom.messageInput.style.height = "42px";
    const composerTab = getActiveTab();
    if (composerTab) composerTab.draft = "";
    autoResizeInput();
  }
  updateSendButton();

  // The selected text has now been placed into the chat, so the
  // "From your selected text" panel/tool buttons are no longer needed.
  clearSelectedText();

  const assistantEl = appendMessage("ai", "");
  const modelLabel = override ? displayModelName(override.model) : getModelLabel();
  const messageLabel =
    [labelName, modelLabel].filter(Boolean).join(" · ") ||
    t("role.assistant", "Assistant");
  const label = assistantEl.querySelector(".message-label");
  if (label) {
    label.textContent = messageLabel;
  }
  assistantEl._rawText = "";
  createReasoningBox(assistantEl);

  const userRequestMessage = buildUserRequestMessage(
    userText,
    selectedContext
  );
  const requestMessages = [];
  if (systemPrompt) {
    requestMessages.push({ role: "system", content: systemPrompt });
  }
  requestMessages.push(
    ...state.messages.map((item) => ({ role: item.role, content: item.content })),
    userRequestMessage
  );
  clearAttachments();

  // Start every reply in "top" mode: follow the new text until the reply's
  // top edge is pinned at the top of the viewport, then stop.
  autoScrollMode = "top";

  state.generating = true;
  updateSendButton();
  renderTabs();
  setStatus("Connecting...");

  const controller = new AbortController();
  state.abortController = controller;

  try {
    let fullText = "";
    await streamCompletion({
      messages: requestMessages,
      signal: controller.signal,
      override,
      onDelta: (delta) => {
        fullText += delta;
        assistantEl._rawText = fullText;
        updateAssistantContent(assistantEl, fullText);
        setStatus("Generating...");
      },
      onReasoning: (delta) => {
        assistantEl._rawReasoning += delta;
        updateReasoningBox(assistantEl, assistantEl._rawReasoning);
        setStatus("Reasoning...");
      },
    });

    const storedUserText = attachmentNames
      ? `${userText}\n\n[Attached: ${attachmentNames}]`
      : userText;
    state.messages.push({ role: "user", content: storedUserText });
    if (fullText.trim()) {
      state.messages.push({
        role: "assistant",
        content: fullText,
        label: messageLabel,
      });
      setStatus("Done");
    } else {
      assistantEl.remove();
      setStatus("No response content");
      appendSystemMessage("The model returned an empty response.");
    }
    await saveCurrentSession();
    renderTabs();
    scheduleTabsSave();
  } catch (error) {
    if (error && error.name === "AbortError") {
      const partial = assistantEl._rawText || "";
      if (partial) {
        assistantEl._rawText = partial + "\n\n[Generation stopped by user]";
        updateAssistantContent(assistantEl, assistantEl._rawText);
      } else {
        assistantEl.remove();
      }
      setStatus("Stopped");
      appendSystemMessage("Generation stopped.");
    } else {
      const message = error && error.message ? error.message : String(error);
      if (assistantEl._rawText) {
        updateAssistantContent(assistantEl, assistantEl._rawText);
      } else {
        assistantEl.remove();
      }
      setStatus("Error");
      appendSystemMessage(`Error: ${message}`);
    }
  } finally {
    state.generating = false;
    state.abortController = null;
    updateSendButton();
    renderTabs();
    scrollStreamingMessageIntoView(assistantEl);
  }
}

function stopGenerating() {
  if (state.abortController) state.abortController.abort();
}

// Resolves a tool's stored model reference ("server::<type>::<model>" or
// "cloud::<provider>::<model>") into a concrete connection. Returns null for
// an empty or invalid reference.
async function resolveToolConnection(modelRef) {
  const ref = String(modelRef || "").trim();
  if (!ref) return null;

  const [kind, key, ...modelParts] = ref.split("::");
  const model = modelParts.join("::");
  if (!kind || !key || !model) return null;

  if (kind === "cloud") {
    if (
      !isBuiltInCloudProvider(key) &&
      !(state.customCloudProviders || []).some((item) => item.id === key)
    ) {
      state.customCloudProviders = await getCustomCloudProviders();
    }
    const defaults = cloudProviderDefaults(key);
    const stored = await api.storage.local.get([
      `cloud_api_url_${key}`,
      `cloud_api_key_${key}`,
    ]);
    return {
      mode: "cloud",
      provider: key,
      model,
      baseUrl: String(stored[`cloud_api_url_${key}`] || defaults.url || "")
        .trim()
        .replace(/\/+$/, ""),
      apiKey: String(stored[`cloud_api_key_${key}`] || "").trim(),
    };
  }

  if (kind === "server") {
    const defaults = SERVER_DEFAULTS[key];
    if (!defaults) return null;
    const stored = await api.storage.local.get([`server_url_${key}`]);
    return {
      mode: "server",
      serverType: key,
      model,
      baseUrl: String(stored[`server_url_${key}`] || defaults.url || "")
        .trim()
        .replace(/\/+$/, ""),
    };
  }

  return null;
}

function validateConnection(override) {
  if (override) {
    if (override.mode === "cloud") {
      if (!override.baseUrl) {
        return `Cloud API URL is missing for ${cloudProviderLabel(
          override.provider
        )}. Open settings and enter it.`;
      }
      if (!override.apiKey) {
        return `Cloud API key is missing for ${cloudProviderLabel(
          override.provider
        )}. Open settings and paste your key.`;
      }
      return "";
    }
    if (!override.baseUrl) {
      return `${serverTypeLabel(
        override.serverType
      )} endpoint URL is missing. Open settings and enter it.`;
    }
    if (override.serverType === "ollama" && !override.model) {
      return "Model name is required for Ollama endpoints.";
    }
    return "";
  }

  if (state.mode === "server") {
    const url = dom.serverUrl.value.trim();
    if (!url) return "Server endpoint URL is missing. Open settings and enter it.";
    if (dom.serverType.value === "ollama" && !dom.serverModel.value.trim()) {
      return "Model name is required for Ollama endpoints.";
    }
  } else {
    const key = dom.cloudApiKey.value.trim();
    if (!key) return "Cloud API key is missing. Open settings and paste your key.";
  }
  return "";
}

function getModelLabel() {
  try {
    if (state.mode === "cloud") {
      return displayModelName(getCloudModelValue());
    }
    return displayModelName(dom.serverModel.value.trim());
  } catch (error) {
    return "";
  }
}

async function clearChat() {
  if (state.generating) stopGenerating();
  hideHistoryPanel();

  const tab = getActiveTab();
  if (tab && tab.messages.length > 0) {
    await saveTabSession(tab);
  }
  if (tab) {
    tab.sessionId = createSessionId();
    tab.messages = [];
    tab.attachments = [];
    tab.title = "";
    tab.draft = "";
  }
  dom.chat.innerHTML = "";
  dom.messageInput.value = "";
  dom.messageInput.style.height = "42px";
  autoResizeInput();
  renderAttachmentList();
  setStatus("Ready");
  appendSystemMessage("Chat cleared. Starting a new session.");
  updateSendButton();
  renderTabs();
  scheduleTabsSave();
}

// ---------- Chat tabs (multiple concurrent conversations) ----------

function createTabId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTabObject(modelId) {
  return {
    id: createTabId(),
    title: "",
    messages: [],
    attachments: [],
    draft: "",
    modelId: modelId || "",
    sessionId: createSessionId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function ensureFirstTab() {
  if (!state.tabs.length) {
    const tab = createTabObject(currentQuickModelId());
    state.tabs = [tab];
    state.activeTabId = tab.id;
  }
  if (!getActiveTab()) state.activeTabId = state.tabs[0].id;
}

function tabDisplayTitle(tab) {
  if (!tab) return t("tab.untitled", "New chat");
  if (tab.title) return tab.title;
  const first = tab.messages.find((item) => item.role === "user");
  const text = String((first && first.content) || "").trim();
  if (!text) return t("tab.untitled", "New chat");
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

async function loadTabs() {
  try {
    const result = await api.storage.local.get([CHAT_TABS_KEY]);
    const payload = result[CHAT_TABS_KEY];
    if (!payload || !Array.isArray(payload.tabs) || !payload.tabs.length) {
      return;
    }
    state.tabs = payload.tabs.map((tab) => ({
      id: typeof tab.id === "string" && tab.id ? tab.id : createTabId(),
      title: typeof tab.title === "string" ? tab.title : "",
      messages: Array.isArray(tab.messages)
        ? tab.messages.map((m) => ({
            role: m.role,
            content:
              typeof m.content === "string"
                ? m.content
                : String(m.content || ""),
            ...(m.label ? { label: m.label } : {}),
          }))
        : [],
      attachments: [],
      draft: "",
      modelId: typeof tab.modelId === "string" ? tab.modelId : "",
      sessionId:
        typeof tab.sessionId === "string" && tab.sessionId
          ? tab.sessionId
          : createSessionId(),
      createdAt: typeof tab.createdAt === "number" ? tab.createdAt : Date.now(),
      updatedAt: typeof tab.updatedAt === "number" ? tab.updatedAt : Date.now(),
    }));
    state.activeTabId = state.tabs.some((tab) => tab.id === payload.activeTabId)
      ? payload.activeTabId
      : state.tabs[0].id;
  } catch (error) {
    // No-op.
  }
}

async function saveTabs() {
  const payload = {
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      modelId: tab.modelId,
      sessionId: tab.sessionId,
      messages: tab.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string" ? m.content : String(m.content || ""),
        ...(m.label ? { label: m.label } : {}),
      })),
      createdAt: tab.createdAt,
      updatedAt: tab.updatedAt,
    })),
  };
  try {
    await api.storage.local.set({ [CHAT_TABS_KEY]: payload });
  } catch (error) {
    // No-op.
  }
}

let tabsSaveTimer = null;

function scheduleTabsSave() {
  if (tabsSaveTimer) clearTimeout(tabsSaveTimer);
  tabsSaveTimer = setTimeout(() => {
    tabsSaveTimer = null;
    saveTabs();
  }, 400);
}

function renderTabs() {
  if (!dom.chatTabs) return;
  dom.chatTabs.innerHTML = "";
  // The strip element always stays in the layout (it is the flexible spacer
  // that keeps the send button pinned to the right edge). Pills only appear
  // once there is more than one conversation.
  dom.chatTabs.hidden = false;

  if (state.tabs.length < 2) return;

  for (const tab of state.tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "chat-tab" + (tab.id === state.activeTabId ? " active" : "");
    button.disabled = state.generating;
    button.title = tabDisplayTitle(tab);

    const kind = quickModelKindFromId(tab.modelId || "");
    if (kind) button.appendChild(createModelIconElement(kind));

    const label = document.createElement("span");
    label.className = "chat-tab-title";
    label.textContent = tabDisplayTitle(tab);
    button.appendChild(label);

    const close = document.createElement("span");
    close.className = "chat-tab-close";
    close.title = t("tab.close", "Close tab");
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", t("tab.close", "Close tab"));
    close.innerHTML =
      '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg>';
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    button.appendChild(close);

    button.addEventListener("click", () => {
      activateTab(tab.id);
    });

    dom.chatTabs.appendChild(button);
  }
}

async function applyActiveTab() {
  const tab = getActiveTab();
  if (tab && tab.modelId && tab.modelId !== currentQuickModelId()) {
    await applyModelToConnection(tab.modelId, { silent: true });
  }
  renderChatFromState();
  renderAttachmentList();
  dom.messageInput.value = tab ? tab.draft || "" : "";
  autoResizeInput();
  updateSendButton();
  renderTabs();
  scrollChatToBottom(true);
}

function newTab() {
  if (state.generating) {
    appendSystemMessage("Wait for the current generation to finish first.");
    return;
  }
  const current = getActiveTab();
  const modelId =
    current && current.modelId ? current.modelId : currentQuickModelId();
  const tab = createTabObject(modelId);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  applyActiveTab();
  scheduleTabsSave();
  dom.messageInput.focus();
}

function activateTab(id) {
  if (id === state.activeTabId) return;
  if (state.generating) {
    setStatus("Wait for the current generation to finish.");
    return;
  }
  if (!state.tabs.some((tab) => tab.id === id)) return;
  state.activeTabId = id;
  applyActiveTab();
  scheduleTabsSave();
  dom.messageInput.focus();
}

async function closeTab(id) {
  if (state.generating) {
    appendSystemMessage("Wait for the current generation to finish first.");
    return;
  }
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const tab = state.tabs[index];
  await saveTabSession(tab);
  state.tabs.splice(index, 1);

  if (!state.tabs.length) {
    const fresh = createTabObject(tab.modelId || currentQuickModelId());
    state.tabs.push(fresh);
    state.activeTabId = fresh.id;
  } else if (state.activeTabId === id) {
    const next = state.tabs[Math.min(index, state.tabs.length - 1)];
    state.activeTabId = next.id;
  }

  applyActiveTab();
  scheduleTabsSave();
}

// ---------- Chat sessions ----------

function createSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sessionTitleFromMessages(messages) {
  const first = messages.find((item) => item.role === "user");
  const text = String((first && first.content) || "").trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text || "Untitled chat";
}

async function loadChatSessions() {
  try {
    const result = await api.storage.local.get([CHAT_SESSIONS_KEY]);
    state.sessions = Array.isArray(result[CHAT_SESSIONS_KEY])
      ? result[CHAT_SESSIONS_KEY]
      : [];
  } catch (error) {
    state.sessions = [];
  }
}

async function saveChatSessions() {
  try {
    await api.storage.local.set({ [CHAT_SESSIONS_KEY]: state.sessions });
  } catch (error) {
    // No-op.
  }
}

async function saveTabSession(tab) {
  if (!tab || !tab.messages.length) return;
  if (!tab.sessionId) tab.sessionId = createSessionId();

  const existing = state.sessions.find((s) => s.id === tab.sessionId);
  const title = existing ? existing.title : sessionTitleFromMessages(tab.messages);
  const session = {
    id: tab.sessionId,
    title,
    createdAt: existing ? existing.createdAt : tab.createdAt || Date.now(),
    updatedAt: Date.now(),
    messages: tab.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content || ""),
      ...(m.label ? { label: m.label } : {}),
    })),
  };

  tab.title = title;
  tab.updatedAt = Date.now();
  state.sessions = [session].concat(
    state.sessions.filter((s) => s.id !== session.id)
  );
  await saveChatSessions();
}

async function saveCurrentSession() {
  await saveTabSession(getActiveTab());
}

function renderChatFromState() {
  dom.chat.innerHTML = "";
  for (const item of state.messages) {
    // Stored messages use the API role "assistant"; the UI class is "ai".
    const role = item.role === "assistant" ? "ai" : item.role;
    appendMessage(role, item.content, { label: item.label });
  }
  scrollChatToBottom(true);
}

function renderHistoryList() {
  dom.historyList.innerHTML = "";

  if (!state.sessions.length) {
    dom.historyList.textContent = "No previous chat sessions yet.";
    return;
  }

  for (const session of state.sessions) {
    const item = document.createElement("div");
    item.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-item-main";

    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = session.title || "Untitled chat";
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    const date = new Date(session.updatedAt || session.createdAt || Date.now());
    meta.textContent = `${date.toLocaleString()} · ${(session.messages || []).length} messages`;
    main.appendChild(meta);

    item.appendChild(main);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-item-delete";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg>';
    deleteButton.title = "Delete this session";
    deleteButton.setAttribute("aria-label", "Delete this session");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSession(session.id);
    });
    item.appendChild(deleteButton);

    item.addEventListener("click", () => {
      openSession(session.id);
    });

    dom.historyList.appendChild(item);
  }
}

async function deleteSession(sessionId) {
  state.sessions = state.sessions.filter((s) => s.id !== sessionId);

  for (const tab of state.tabs) {
    if (tab.sessionId !== sessionId) continue;
    tab.sessionId = createSessionId();
    if (tab.id === state.activeTabId) {
      tab.messages = [];
      tab.attachments = [];
      tab.title = "";
      dom.chat.innerHTML = "";
      renderAttachmentList();
      setStatus("Ready");
      updateSendButton();
    }
  }

  await saveChatSessions();
  renderTabs();
  scheduleTabsSave();
  renderHistoryList();
}

async function deleteAllSessions() {
  state.sessions = [];

  for (const tab of state.tabs) {
    tab.sessionId = createSessionId();
    tab.messages = [];
    tab.attachments = [];
    tab.title = "";
  }

  dom.chat.innerHTML = "";
  renderAttachmentList();
  setStatus("Ready");
  updateSendButton();
  appendSystemMessage("All chat history deleted.");
  renderTabs();
  scheduleTabsSave();

  await saveChatSessions();
  renderHistoryList();
}

function toggleHistoryPanel() {
  if (dom.historyPanel.hidden) {
    showHistoryPanel();
  } else {
    hideHistoryPanel();
  }
}

async function showHistoryPanel() {
  // Flip the UI first so the button toggles immediately.
  dom.historyPanel.hidden = false;
  dom.historyBtn.classList.add("active");
  dom.historyBtn.setAttribute("aria-expanded", "true");
  await saveCurrentSession();
  renderHistoryList();
}

function hideHistoryPanel() {
  dom.historyPanel.hidden = true;
  dom.historyBtn.classList.remove("active");
  dom.historyBtn.setAttribute("aria-expanded", "false");
}

function openSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  if (state.generating) stopGenerating();

  const tab = getActiveTab();
  if (tab) {
    tab.sessionId = session.id;
    tab.title = session.title || "";
    tab.messages = (session.messages || []).map((m) => ({ ...m }));
    tab.attachments = [];
    tab.draft = "";
  }
  renderAttachmentList();
  renderChatFromState();
  hideHistoryPanel();
  setStatus("Ready");
  updateSendButton();
  renderTabs();
  scheduleTabsSave();
}

// ---------- Quick model selection ----------

function serverTypeLabel(type) {
  return (
    {
      ollama: "Ollama",
      koboldcpp: "kobold.cpp",
      llamacpp: "llama.cpp",
      other: "Other",
    }[type] || "Server"
  );
}

function cloudProviderLabel(provider) {
  const builtInLabels = {
    deepseek: "DeepSeek",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    gemini: "Google Gemini",
    mistral: "Mistral",
    cohere: "Cohere",
  };
  if (builtInLabels[provider]) return builtInLabels[provider];
  const custom = (state.customCloudProviders || []).find(
    (item) => item.id === provider
  );
  return custom ? custom.name : provider;
}

function displayModelName(model) {
  const raw = String(model || "").trim();
  if (!raw) return "";
  const parts = raw.split("/");
  let name = parts[parts.length - 1] || raw;
  name = name.replace(/\.(gguf|ggml|bin|safetensors)$/i, "");
  return name || raw;
}

function currentQuickModelId() {
  if (state.mode === "cloud") {
    const model = getCloudModelValue();
    return model
      ? `cloud::${dom.cloudProvider.value}::${model}`
      : "";
  }
  const model = dom.serverModel.value.trim();
  return model ? `server::${dom.serverType.value}::${model}` : "";
}

async function processRestoredActiveModel() {
  const raw = localStorage.getItem(RESTORED_MODEL_KEY);
  localStorage.removeItem(RESTORED_MODEL_KEY);
  if (!raw) return;

  const [kind, key, ...modelParts] = raw.split("::");
  const model = modelParts.join("::");
  if ((kind !== "server" && kind !== "cloud") || !key || !model) return;

  try {
    const readinessError = await getQuickModelReadinessError(kind, key, model);
    if (readinessError) {
      if (kind === "server") {
        dom.serverModel.value = "";
        await api.storage.local.remove([`server_model_${key}`]);
      } else {
        syncHiddenCloudModelSelect([], "");
        await api.storage.local.remove([`cloud_model_${key}`]);
      }
      await refreshUnifiedModelSelect();
      return;
    }

    await switchQuickModel(raw);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(`Could not restore model: ${message}`);
    await refreshUnifiedModelSelect();
  }
}

// Collects every fetched/custom model that is currently usable, in the same
// "server::<type>::<model>" / "cloud::<provider>::<model>" form used by the
// composer picker and by per-tool model overrides.
async function collectModelOptions() {
  const options = [];
  const seen = new Set();

  function addOption(id, label, group) {
    if (seen.has(id)) return;
    seen.add(id);
    options.push({ id, label, group: group || "Models" });
  }

  const serverTypes = ["ollama", "koboldcpp", "llamacpp", "other"];
  const serverKeys = [];
  for (const type of serverTypes) {
    serverKeys.push(
      `server_url_${type}`,
      `server_model_${type}`,
      `server_model_list_${type}`,
      `server_model_disabled_${type}`,
      `server_custom_models_${type}`
    );
  }
  const serverStore = await api.storage.local.get(serverKeys);

  for (const type of serverTypes) {
    const defaults = SERVER_DEFAULTS[type];
    const baseUrl = String(
      serverStore[`server_url_${type}`] || defaults.url || ""
    ).trim();

    // Fetched models and manually added custom models are both usable.
    // Defaults/placeholders like "local-model" are hidden until the user
    // connects/fetches or explicitly adds a custom model.
    const fetchedModels = Array.isArray(
      serverStore[`server_model_list_${type}`]
    )
      ? uniqueModels(serverStore[`server_model_list_${type}`])
      : [];
    const customModels = uniqueModels(
      serverStore[`server_custom_models_${type}`] || []
    );
    const modelList = uniqueModels([...fetchedModels, ...customModels]);
    const disabled = uniqueModels(
      serverStore[`server_model_disabled_${type}`] || []
    );
    if (!baseUrl || modelList.length === 0) continue;

    for (const model of modelList) {
      if (disabled.includes(model)) continue;
      addOption(
        `server::${type}::${model}`,
        `[L] ${displayModelName(model)}`,
        serverTypeLabel(type)
      );
    }
  }

  state.customCloudProviders = await getCustomCloudProviders();
  const cloudProviders = [
    ...BUILT_IN_CLOUD_PROVIDERS,
    ...(state.customCloudProviders || []).map((item) => item.id),
  ];
  const cloudKeys = [];
  for (const provider of cloudProviders) {
    cloudKeys.push(
      `cloud_api_url_${provider}`,
      `cloud_api_key_${provider}`,
      `cloud_model_${provider}`,
      `cloud_model_list_${provider}`,
      `cloud_model_disabled_${provider}`,
      `cloud_custom_models_${provider}`
    );
  }
  const cloudStore = await api.storage.local.get(cloudKeys);
  state.cloudStore = cloudStore;

  for (const provider of cloudProviders) {
    const defaults = cloudProviderDefaults(provider);
    const baseUrl = String(
      cloudStore[`cloud_api_url_${provider}`] || defaults.url || ""
    ).trim();
    const apiKey = String(
      cloudStore[`cloud_api_key_${provider}`] || ""
    ).trim();

    // A cloud provider is usable only when its API URL and API key are set.
    if (!baseUrl || !apiKey) continue;

    const fetchedModels = Array.isArray(
      cloudStore[`cloud_model_list_${provider}`]
    )
      ? uniqueModels(cloudStore[`cloud_model_list_${provider}`])
      : [];
    const customModels = uniqueModels(
      cloudStore[`cloud_custom_models_${provider}`] || []
    );
    const disabled = uniqueModels(
      cloudStore[`cloud_model_disabled_${provider}`] || []
    );

    // DeepSeek always exposes deepseek-chat once DeepSeek is connected,
    // even if the server model list has not been fetched yet.
    if (provider === "deepseek" && !fetchedModels.includes("deepseek-chat")) {
      fetchedModels.unshift("deepseek-chat");
    }
    const modelList = uniqueModels([...fetchedModels, ...customModels]);

    for (const model of modelList) {
      if (disabled.includes(model)) continue;
      addOption(
        `cloud::${provider}::${model}`,
        displayModelName(model),
        cloudProviderLabel(provider)
      );
    }
  }

  return options;
}

async function refreshUnifiedModelSelect() {
  const options = await collectModelOptions();
  renderTtsProviderOptions();
  applyTtsModel({ persist: false });
  state.modelOptions = options;

  const current = currentQuickModelId();

  // Keep the active tab's remembered model in sync with the connection the
  // user actually sees in the picker (settings changes included).
  const activeTabForModel = getActiveTab();
  if (activeTabForModel) activeTabForModel.modelId = current;

  dom.quickModelSelect.innerHTML = "";
  dom.quickModelMenu.innerHTML = "";

  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("composer.noModel", "No model selected");
    dom.quickModelSelect.appendChild(option);

    const empty = document.createElement("div");
    empty.className = "quick-model-empty";
    empty.textContent = t("composer.noModel", "No model selected");
    dom.quickModelMenu.appendChild(empty);
    updateQuickModelTrigger();
    renderToolModelMenu();
    updateToolModelTrigger();
    return;
  }

  let currentGroup = null;
  let groupEl = null;
  for (const item of options) {
    if (item.group !== currentGroup) {
      groupEl = document.createElement("optgroup");
      groupEl.label = item.group;
      dom.quickModelSelect.appendChild(groupEl);
      currentGroup = item.group;
    }
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    if (groupEl) groupEl.appendChild(option);
  }

  if (current && options.some((item) => item.id === current)) {
    dom.quickModelSelect.value = current;
  } else {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("composer.noModel", "No model selected");
    dom.quickModelSelect.appendChild(placeholder);
    dom.quickModelSelect.value = "";
  }

  updateQuickModelTrigger();
  renderQuickModelMenu(options, current);
  renderToolModelMenu();
  updateToolModelTrigger();
}

function quickModelKindFromId(id) {
  if (String(id).startsWith("server::")) return "local";
  if (String(id).startsWith("cloud::")) return "cloud";
  return "";
}

function cleanModelLabel(label) {
  return String(label || "").replace(/^\[L\]\s*/, "").trim();
}

function createModelIconElement(kind) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "quick-model-option-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (kind === "cloud") {
    const path = document.createElementNS(NS, "path");
    path.setAttribute(
      "d",
      "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
    );
    svg.appendChild(path);
  } else if (kind === "local") {
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", "2");
    rect.setAttribute("y", "4");
    rect.setAttribute("width", "20");
    rect.setAttribute("height", "12");
    rect.setAttribute("rx", "2");
    svg.appendChild(rect);
    const base = document.createElementNS(NS, "path");
    base.setAttribute("d", "M8 20h8M12 16v4");
    svg.appendChild(base);
  }

  return svg;
}

function updateQuickModelTrigger() {
  const selected = dom.quickModelSelect.selectedOptions[0];
  const value = selected && selected.value ? selected.value : "";
  const label = cleanModelLabel(
    selected && selected.value ? selected.textContent : ""
  );

  dom.quickModelLabel.textContent = "";
  const kind = quickModelKindFromId(value);
  if (kind) dom.quickModelLabel.appendChild(createModelIconElement(kind));

  const text = document.createElement("span");
  text.textContent = label || t("composer.noModel", "No model selected");
  dom.quickModelLabel.appendChild(text);
  dom.quickModelTrigger.title = label || "Switch model";
}

function renderQuickModelMenu(options, current) {
  dom.quickModelMenu.innerHTML = "";

  let currentGroup = null;
  for (const item of options) {
    if (item.group !== currentGroup) {
      const title = document.createElement("div");
      title.className = "quick-model-group-title";
      title.textContent = item.group;
      dom.quickModelMenu.appendChild(title);
      currentGroup = item.group;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "quick-model-option" + (item.id === current ? " active" : "");
    button.dataset.value = item.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(item.id === current));

    const kind = quickModelKindFromId(item.id);
    if (kind) button.appendChild(createModelIconElement(kind));

    const text = document.createElement("span");
    text.textContent = cleanModelLabel(item.label);
    button.appendChild(text);

    button.addEventListener("click", () => {
      selectQuickModelOption(item.id);
    });

    dom.quickModelMenu.appendChild(button);
  }
}

function selectQuickModelOption(value) {
  closeQuickModelMenu();
  if (!value) return;
  switchQuickModel(value);
}

function toggleQuickModelMenu() {
  if (dom.quickModelMenu.hidden) openQuickModelMenu();
  else closeQuickModelMenu();
}

function openQuickModelMenu() {
  dom.quickModelMenu.hidden = false;
  dom.quickModelTrigger.setAttribute("aria-expanded", "true");
}

function closeQuickModelMenu() {
  dom.quickModelMenu.hidden = true;
  dom.quickModelTrigger.setAttribute("aria-expanded", "false");
}

async function getQuickModelReadinessError(kind, key, model) {
  if (kind === "server") {
    const defaults = SERVER_DEFAULTS[key];
    if (!defaults) return "Unknown local server type.";
    const stored = await api.storage.local.get([`server_url_${key}`]);
    const baseUrl = (stored[`server_url_${key}`] || defaults.url).trim();
    if (!baseUrl) {
      return `${serverTypeLabel(key)} is not connected: endpoint URL is empty. Configure it in settings first.`;
    }
    return "";
  }

  if (kind === "cloud") {
    if (!isBuiltInCloudProvider(key)) {
      state.customCloudProviders = await getCustomCloudProviders();
    }
    const defaults = cloudProviderDefaults(key);
    const stored = await api.storage.local.get([
      `cloud_api_url_${key}`,
      `cloud_api_key_${key}`,
    ]);
    const baseUrl = (stored[`cloud_api_url_${key}`] || defaults.url).trim();
    const apiKey = String(stored[`cloud_api_key_${key}`] || "").trim();
    if (!baseUrl) {
      return `${cloudProviderLabel(key)} is not connected: API URL is empty. Configure it in settings first.`;
    }
    if (!apiKey) {
      return `${cloudProviderLabel(key)} is not ready: API key is missing. Add it in settings first.`;
    }
    return "";
  }

  return "Unknown model source.";
}

async function applyModelToConnection(value, options = {}) {
  const silent = !!options.silent;
  if (!value) return false;
  const [kind, key, ...modelParts] = value.split("::");
  const model = modelParts.join("::");
  if (!key || !model) return false;

  const modelLabel = displayModelName(model);

  try {
    const readinessError = await getQuickModelReadinessError(kind, key, model);
    if (readinessError) {
      if (!silent) {
        appendSystemMessage(`Cannot switch to ${modelLabel}: ${readinessError}`);
        await refreshUnifiedModelSelect();
      }
      return false;
    }

    if (kind === "server") {
      state.mode = "server";
      state.serverType = key;
      dom.serverType.value = key;
      localStorage.setItem("penguin_mode", "server");
      localStorage.setItem("penguin_server_type", key);
      await api.storage.local.set({
        penguin_mode: "server",
        penguin_server_type: key,
      });

      await setMode("server");
      dom.serverModel.value = model;
      await api.storage.local.set({ [`server_model_${key}`]: model });
      if (!silent) setStatus(`Model: ${displayModelName(model)}`);
    } else if (kind === "cloud") {
      state.mode = "cloud";
      dom.cloudProvider.value = key;
      localStorage.setItem("penguin_mode", "cloud");
      await api.storage.local.set({
        penguin_mode: "cloud",
        cloud_provider: key,
      });

      await setMode("cloud");

      const optionExists = [...dom.cloudModelSelect.options].some(
        (option) => option.value === model
      );
      if (!optionExists) {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        dom.cloudModelSelect.appendChild(option);
      }
      dom.cloudModelSelect.value = model;
      await api.storage.local.set({
        cloud_provider: key,
        [`cloud_model_${key}`]: model,
      });
      if (!silent) setStatus(`Model: ${displayModelName(model)}`);
    }

    await refreshUnifiedModelSelect();
    return true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (!silent) {
      appendSystemMessage(`Failed to switch model: ${message}`);
      await refreshUnifiedModelSelect();
    }
    return false;
  }
}

async function switchQuickModel(value) {
  const ok = await applyModelToConnection(value, { silent: false });
  if (!ok) return;
  const tab = getActiveTab();
  if (tab) {
    tab.modelId = value;
    scheduleTabsSave();
    renderTabs();
  }
}

// ---------- File/image attachments ----------

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

const TEXT_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "mdx", "json", "jsonl", "ndjson", "csv",
  "tsv", "log", "rst", "tex", "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue",
  "svelte", "py", "rb", "php", "java", "kt", "kts", "scala", "c", "h", "cc",
  "cpp", "cxx", "hpp", "hh", "cs", "go", "rs", "swift", "dart", "pl", "pm",
  "lua", "r", "jl", "html", "htm", "xhtml", "css", "scss", "sass", "less",
  "styl", "xml", "svg", "yaml", "yml", "toml", "ini", "cfg", "conf", "config",
  "env", "properties", "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1", "sql",
  "graphql", "gql", "proto", "diff", "patch", "srt", "vtt", "rtf", "gitignore",
  "editorconfig",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json", "application/ld+json", "application/xml",
  "application/xhtml+xml", "application/javascript", "application/x-javascript",
  "application/ecmascript", "application/x-sh", "application/x-shellscript",
  "application/x-yaml", "application/yaml", "application/toml", "application/sql",
  "application/graphql", "application/x-ndjson", "application/x-httpd-php",
  "application/rtf", "application/x-tex",
]);

// Restricts the OS file picker to formats the attachment pipeline understands.
function applyFileInputAccept() {
  if (!dom.fileInput) return;
  const extensions = new Set([...TEXT_EXTENSIONS, ...ZIP_DOCUMENT_EXTENSIONS]);
  dom.fileInput.accept = [
    "image/*",
    ...TEXT_MIME_TYPES,
    ...[...extensions].sort().map((ext) => `.${ext}`),
  ].join(",");
}

const PICKER_IMAGE_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif",
  "heic", "heif", "tif", "tiff",
];

// File System Access API types. Unlike the <input accept> attribute, these
// carry a label, so the native dialog shows proper filter names instead of the
// browser's generic "Custom Files" filter name.
function buildFilePickerTypes() {
  const imageExtensions = new Set(PICKER_IMAGE_EXTENSIONS);
  const textExtensions = [...new Set([...TEXT_EXTENSIONS, ...ZIP_DOCUMENT_EXTENSIONS])]
    .filter((ext) => !imageExtensions.has(ext))
    .map((ext) => `.${ext}`);
  // Note: a "*/*" accept entry is dropped by Chromium (it maps to no
  // extensions), so the all-files option comes from
  // excludeAcceptAllOption: false in openAttachmentPicker().
  return [
    {
      description: "Supported File Types",
      accept: {
        "image/*": PICKER_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
        "text/plain": textExtensions,
      },
    },
  ];
}

// Opens the native picker. Chromium exposes showOpenFilePicker(), whose custom
// types give us a proper filter label; Firefox lacks it, so fall back to the
// hidden <input accept> element.
async function openAttachmentPicker() {
  if (typeof window.showOpenFilePicker !== "function") {
    dom.fileInput.click();
    return;
  }
  let handles;
  try {
    handles = await window.showOpenFilePicker({
      multiple: true,
      // Keep the browser's "All Files" option available alongside our filter.
      excludeAcceptAllOption: false,
      types: buildFilePickerTypes(),
    });
  } catch (error) {
    if (error && error.name === "AbortError") return;
    dom.fileInput.click();
    return;
  }
  const files = [];
  for (const handle of handles) {
    try {
      files.push(await handle.getFile());
    } catch (error) {
      // Ignore handles the page can't read.
    }
  }
  if (files.length) await handleSelectedFiles(files);
}

function isTextFile(file) {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("text/")) return true;
  if (TEXT_MIME_TYPES.has(type)) return true;
  const name = String(file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : name;
  return TEXT_EXTENSIONS.has(ext);
}

// Reads the first few KB so unknown files can be sniffed for text content.
function readFileSample(file, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file.slice(0, maxBytes));
  });
}

function looksLikeText(sample) {
  if (!sample) return false;
  if (sample.includes("\u0000")) return false;
  const replacement = (sample.match(/\uFFFD/g) || []).length;
  if (replacement > sample.length * 0.02) return false;
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code < 9 || (code > 13 && code < 32)) control++;
  }
  return control <= sample.length * 0.05;
}

// ---------- Office / OpenDocument text extraction (ZIP-based, no deps) ----------

const ZIP_DOCUMENT_EXTENSIONS = new Set([
  "docx", "docm", "dotx", "xlsx", "xlsm", "xltx", "pptx", "pptm", "potx",
  "odt", "ods", "odp", "odg",
]);

function isZipDocument(file) {
  const name = String(file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : name;
  return ZIP_DOCUMENT_EXTENSIONS.has(ext);
}

// Minimal ZIP reader: walks the central directory and inflates each entry.
async function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  const limit = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= limit; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < count && offset + 46 <= bytes.length; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength)
    );

    if (localOffset + 30 <= bytes.length && view.getUint32(localOffset, true) === 0x04034b50) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      entries.set(name, {
        method,
        data: bytes.subarray(dataStart, dataStart + compressedSize),
      });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateZipEntry(entry) {
  if (!entry) return null;
  if (entry.method === 0) return entry.data;
  if (entry.method === 8 && typeof DecompressionStream !== "undefined") {
    try {
      const stream = new Blob([entry.data])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      return null;
    }
  }
  return null;
}

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlToPlainText(xml) {
  if (!xml) return "";
  return decodeXmlEntities(
    xml
      .replace(/<(\/w:p|\/a:p|\/text:p|\/text:h|\/text:list-item)>/g, "\n")
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<(w:br|a:br|text:line-break)\b[^>]*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function extractSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = re.exec(xml))) {
    const texts = match[1].match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || [];
    out.push(
      texts.map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))).join("")
    );
  }
  return out;
}

function xlsxSheetToText(xml, sharedStrings) {
  if (!xml) return "";
  const lines = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let row;
  while ((row = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cell;
    while ((cell = cellRe.exec(row[1]))) {
      const attrs = cell[1] || cell[2] || "";
      const inner = cell[3] || "";
      const type = (/t="([^"]+)"/.exec(attrs) || [])[1] || "";
      const value = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      const inline = (/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner) || [])[1];
      let text = "";
      if (type === "s" && value !== undefined) {
        text = sharedStrings[parseInt(value, 10)] || "";
      } else if (inline !== undefined) {
        text = decodeXmlEntities(inline);
      } else if (value !== undefined) {
        text = decodeXmlEntities(value);
      }
      cells.push(text);
    }
    const line = cells.join("\t").replace(/\t+$/, "");
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}

async function extractDocumentText(file) {
  const name = String(file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : name;
  const buffer = await file.arrayBuffer();
  const entries = await readZipEntries(buffer);
  if (!entries || !entries.size) return "";

  const readXml = async (entryName) => {
    const entry = entries.get(entryName);
    if (!entry) return "";
    const bytes = await inflateZipEntry(entry);
    return bytes ? new TextDecoder("utf-8").decode(bytes) : "";
  };

  const textParts = [];
  const addXmlText = async (entryName) => {
    const xml = await readXml(entryName);
    if (xml) textParts.push(xmlToPlainText(xml));
  };
  if (["docx", "docm", "dotx"].includes(ext)) {
    await addXmlText("word/document.xml");
    for (const entryName of [...entries.keys()].sort()) {
      if (/^word\/(header|footer)\d+\.xml$/.test(entryName)) {
        await addXmlText(entryName);
      }
    }
  } else if (["xlsx", "xlsm", "xltx"].includes(ext)) {
    const sharedStrings = extractSharedStrings(await readXml("xl/sharedStrings.xml"));
    for (const entryName of [...entries.keys()].sort()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entryName)) {
        const sheetText = xlsxSheetToText(await readXml(entryName), sharedStrings);
        if (sheetText) textParts.push(sheetText);
      }
    }
  } else if (["pptx", "pptm", "potx"].includes(ext)) {
    for (const entryName of [...entries.keys()].sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(entryName)) {
        await addXmlText(entryName);
      }
    }
  } else if (["odt", "ods", "odp", "odg"].includes(ext)) {
    await addXmlText("content.xml");
  } else {
    return "";
  }

  return textParts
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function handleSelectedFiles(pickedFiles) {
  const fromPicker = Array.isArray(pickedFiles);
  const files = fromPicker
    ? pickedFiles
    : Array.from(dom.fileInput.files || []);
  if (!fromPicker) dom.fileInput.value = "";

  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      appendSystemMessage(`"${file.name}" is too large. Maximum size is 8 MB.`);
      continue;
    }

    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataUrl(file);
        state.attachments.push({
          id: createSessionId(),
          name: file.name,
          kind: "image",
          dataUrl,
          size: file.size,
        });
        continue;
      }

      let content = null;
      if (isTextFile(file)) {
        content = await readFileAsText(file);
      } else if (isZipDocument(file)) {
        content = await extractDocumentText(file);
      } else {
        const sample = await readFileSample(file);
        if (looksLikeText(sample)) content = await readFileAsText(file);
      }

      if (content === null) {
        appendSystemMessage(
          `Unsupported file type: ${file.name}. Attach images, text/code files, or documents (DOCX, XLSX, PPTX, ODT, ODS, ODP).`
        );
        continue;
      }

      if (!content.trim()) {
        appendSystemMessage(`Could not read any text from "${file.name}".`);
        continue;
      }

      if (content.length > 200000) {
        appendSystemMessage(
          `"${file.name}" is too long. Maximum text length is 200 KB.`
        );
        continue;
      }

      state.attachments.push({
        id: createSessionId(),
        name: file.name,
        kind: "text",
        content,
        size: file.size,
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      appendSystemMessage(`Failed to attach "${file.name}": ${message}`);
    }
  }

  renderAttachmentList();
  updateSendButton();
}

function renderAttachmentList() {
  dom.attachmentList.innerHTML = "";

  if (!state.attachments.length) {
    dom.attachmentList.hidden = true;
    return;
  }

  dom.attachmentList.hidden = false;
  for (const attachment of state.attachments) {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const name = document.createElement("span");
    name.className = "attachment-chip-name";
    name.textContent =
      attachment.kind === "image"
        ? `Image: ${attachment.name}`
        : `File: ${attachment.name}`;
    chip.appendChild(name);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-chip-remove";
    remove.textContent = "×";
    remove.title = "Remove attachment";
    remove.addEventListener("click", () => {
      removeAttachment(attachment.id);
    });
    chip.appendChild(remove);

    dom.attachmentList.appendChild(chip);
  }
}

function removeAttachment(id) {
  state.attachments = state.attachments.filter((a) => a.id !== id);
  renderAttachmentList();
  updateSendButton();
}

function clearAttachments() {
  state.attachments = [];
  renderAttachmentList();
}

function buildUserRequestMessage(userText, selectedContext) {
  const textAttachments = state.attachments.filter((a) => a.kind === "text");
  const imageAttachments = state.attachments.filter((a) => a.kind === "image");

  const contextText = String(selectedContext || "").trim();
  let contentText = userText;
  if (contextText) {
    contentText = `[Selected text from the page]\n${contextText}\n\n${contentText}`;
  }
  for (const attachment of textAttachments) {
    contentText += `\n\n[Attached file: ${attachment.name}]\n${attachment.content}`;
  }

  if (!imageAttachments.length) {
    return { role: "user", content: contentText };
  }

  if (state.mode === "server" && dom.serverType.value === "ollama") {
    return {
      role: "user",
      content: contentText,
      images: imageAttachments.map((a) =>
        String(a.dataUrl).replace(/^data:[^;]+;base64,/, "")
      ),
    };
  }

  return {
    role: "user",
    content: [
      { type: "text", text: contentText },
      ...imageAttachments.map((a) => ({
        type: "image_url",
        image_url: { url: a.dataUrl },
      })),
    ],
  };
}

// ---------- History trimming ----------

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 3.7);
}

function messagesTokens(messages) {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 8, 0);
}

function trimHistoryToFit(newMessageTokens, contextSize) {
  const available = contextSize - 800;
  let history = [...state.messages];
  let removed = 0;

  while (history.length > 0 && messagesTokens(history) + newMessageTokens > available) {
    if (history[0].role === "user" && history[1] && history[1].role === "assistant") {
      history.splice(0, 2);
    } else {
      history.splice(0, 1);
    }
    removed += 1;
  }

  if (removed > 0) {
    state.messages = history;
    appendSystemMessage(
      "Older messages were trimmed to keep this conversation within the selected context size."
    );
  }
}

// ---------- Streaming ----------

async function streamCompletion({ messages, signal, onDelta, onReasoning, override }) {
  const config = buildRequestConfig(messages, override);
  const response = await fetch(config.url, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(config.body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} - ${text || response.statusText}`);
  }

  await consumeStream(response, config.streamKind, onDelta, onReasoning);
}

function buildRequestConfig(messages, override) {
  const bodyMessages = Array.isArray(messages) ? messages : [];
  const useCloud = override ? override.mode === "cloud" : state.mode === "cloud";

  if (useCloud) {
    const provider = override ? override.provider : dom.cloudProvider.value;
    const endpoint = cloudProviderDefaults(provider);
    const kind = cloudProviderKind(provider);
    const baseUrl = String(
      override ? override.baseUrl : dom.cloudApiUrl.value.trim() || endpoint.url
    ).replace(/\/+$/, "");
    const model = override ? override.model : getCloudModelValue() || endpoint.model;
    const apiKey = override ? override.apiKey : dom.cloudApiKey.value.trim();

    if (kind === "anthropic") {
      const system = bodyMessages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean)
        .join("\n\n");
      const anthropicMessages = bodyMessages
        .filter((item) => item.role !== "system")
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content || ""),
        }));
      return {
        url: `${baseUrl}/v1/messages`,
        streamKind: "anthropic-sse",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: {
          model,
          max_tokens: 4096,
          stream: true,
          ...(system ? { system } : {}),
          messages: anthropicMessages,
        },
      };
    }

    if (kind === "gemini") {
      const systemParts = bodyMessages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean);
      const contents = bodyMessages
        .filter((item) => item.role !== "system")
        .map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: String(item.content || "") }],
        }));
      return {
        url: `${baseUrl}/v1beta/models/${encodeURIComponent(
          model
        )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        streamKind: "gemini-sse",
        headers: { "Content-Type": "application/json" },
        body: {
          contents,
          ...(systemParts.length
            ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } }
            : {}),
        },
      };
    }

    if (kind === "cohere") {
      const historyMessages = bodyMessages.filter(
        (item) => item.role !== "system"
      );
      const chatHistory = historyMessages.slice(0, -1).map((item) => ({
        role: item.role === "assistant" ? "CHATBOT" : "USER",
        message: String(item.content || ""),
      }));
      const lastMessage = historyMessages.length
        ? historyMessages[historyMessages.length - 1]
        : { role: "user", content: "" };
      const preamble = bodyMessages
        .filter((item) => item.role === "system")
        .map((item) => String(item.content || ""))
        .filter(Boolean)
        .join("\n\n");
      return {
        url: `${baseUrl}/v1/chat`,
        streamKind: "cohere-sse",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          message: String(lastMessage.content || ""),
          chat_history: chatHistory,
          ...(preamble ? { preamble } : {}),
          stream: true,
        },
      };
    }

    // OpenAI-compatible: OpenAI, DeepSeek, Mistral, custom servers.
    return {
      url: `${baseUrl}/v1/chat/completions`,
      streamKind: "sse",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
        messages: bodyMessages,
        stream: true,
      },
    };
  }

  const type = override ? override.serverType : dom.serverType.value;
  const baseUrl = String(
    override ? override.baseUrl : dom.serverUrl.value.trim()
  ).replace(/\/+$/, "");
  const model =
    (override ? override.model : dom.serverModel.value.trim()) || "local-model";

  if (type === "ollama") {
    return {
      url: `${baseUrl}/api/chat`,
      streamKind: "ndjson",
      headers: { "Content-Type": "application/json" },
      body: {
        model,
        messages: bodyMessages,
        stream: true,
      },
    };
  }

  return {
    url: `${baseUrl}/v1/chat/completions`,
    streamKind: "sse",
    headers: { "Content-Type": "application/json" },
    body: {
      model,
      messages: bodyMessages,
      stream: true,
    },
  };
}

async function consumeStream(response, kind, onDelta, onReasoning) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleNdjsonLine = (line) => {
    if (!line.trim()) return false;
    let data;
    try {
      data = JSON.parse(line);
    } catch (error) {
      return false;
    }
    const message = data.message || {};
    if (message.reasoning_content || message.reasoning) {
      if (onReasoning) onReasoning(message.reasoning_content || message.reasoning);
    }
    const delta = message.content ? message.content : "";
    if (delta) onDelta(delta);
    return !!data.done;
  };

  const handleSseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const data = JSON.parse(payload);
      const delta = (data.choices &&
        data.choices[0] &&
        data.choices[0].delta) || {};
      if ((delta.reasoning_content || delta.reasoning) && onReasoning) {
        onReasoning(delta.reasoning_content || delta.reasoning);
      }
      if (delta.content) onDelta(delta.content);
    } catch (error) {
      // Ignore malformed SSE chunks.
    }
    return false;
  };

  const handleAnthropicSseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const data = JSON.parse(payload);
      if (data.type === "content_block_delta" && data.delta) {
        if (data.delta.type === "text_delta" && data.delta.text) {
          onDelta(data.delta.text);
        } else if (
          data.delta.type === "thinking_delta" &&
          data.delta.thinking &&
          onReasoning
        ) {
          onReasoning(data.delta.thinking);
        }
      }
    } catch (error) {
      // Ignore malformed SSE chunks.
    }
    return false;
  };

  const handleGeminiSseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const data = JSON.parse(payload);
      const parts =
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts;
      if (Array.isArray(parts)) {
        const text = parts.map((part) => part.text || "").join("");
        if (text) onDelta(text);
      }
    } catch (error) {
      // Ignore malformed SSE chunks.
    }
    return false;
  };

  const handleCohereSseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return true;
    try {
      const data = JSON.parse(payload);
      if (data.text) onDelta(data.text);
      if (data.event_type === "stream-end") return true;
    } catch (error) {
      // Ignore malformed SSE chunks.
    }
    return false;
  };

  const getHandler = () => {
    if (kind === "ndjson") return handleNdjsonLine;
    if (kind === "anthropic-sse") return handleAnthropicSseLine;
    if (kind === "gemini-sse") return handleGeminiSseLine;
    if (kind === "cohere-sse") return handleCohereSseLine;
    return handleSseLine;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n");
    buffer = parts.pop();
    const handler = getHandler();

    for (const part of parts) {
      if (handler(part)) return;
    }
  }

  if (buffer.trim()) {
    getHandler()(buffer);
  }
}

// ---------- External run support (context menu / Alt+select) ----------

function handlePendingRun(payload) {
  if (!payload || !payload.toolId || !payload.text) return false;

  const tool = effectiveTools().find((item) => item.id === payload.toolId);
  if (!tool) {
    appendSystemMessage(`Tool "${payload.toolId}" is no longer available.`);
    return false;
  }

  const key = `${payload.toolId}|${payload.text}`;
  const now = Date.now();
  if (key === state.lastRunKey && now - state.lastRunAt < 3000) return true;
  state.lastRunKey = key;
  state.lastRunAt = now;

  if (state.generating) {
    appendSystemMessage("Wait for the current generation to finish first.");
    return true;
  }

  runToolRequest({ tool, userText: payload.text, clearComposer: false });
  return true;
}

async function processPendingRun() {
  try {
    const result = await api.storage.local.get([PENDING_KEY]);
    if (result && result[PENDING_KEY]) {
      handlePendingRun(result[PENDING_KEY]);
      await api.storage.local.remove([PENDING_KEY]);
    }
  } catch (error) {
    // No-op.
  }
}

// ---------- Panel state reporter ----------

function setupPanelStateReporter() {
  const KEY = "penguin_panel_state";

  function report(open) {
    try {
      api.runtime
        .sendMessage({
          type: open ? "penguin_panel_opened" : "penguin_panel_closed",
        })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }
    try {
      api.storage.local.set({ [KEY]: { open, ts: Date.now() } });
    } catch (error) {
      // No-op.
    }
  }

  function reportCurrentVisibility() {
    let hidden = false;
    try {
      hidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";
    } catch (error) {
      // No-op.
    }
    report(!hidden);
  }

  reportCurrentVisibility();
  document.addEventListener("visibilitychange", reportCurrentVisibility);
  window.addEventListener("pagehide", () => report(false));
  window.addEventListener("unload", () => report(false));
}
