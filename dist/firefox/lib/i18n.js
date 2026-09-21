// TuxAI - tiny shared i18n helper (English / Chinese).
// Loaded as a classic script so both the sidebar and the content script can
// use it through the global `TuxAIi18n`.
(function (root) {
  "use strict";

  const LANG_KEY = "penguin_language";

  const MESSAGES = {
    en: {
      "app.title": "Tux AI Sidebar",
      "status.ready": "Ready",
      "header.toggleTheme": "Toggle theme",
      "header.toggleSettings": "Toggle settings",

      "tab.cloud": "Cloud Server",
      "tab.local": "Local Server",
      "tab.ui": "UI",
      "tab.sound": "Sound",
      "tab.tools": "Tools",
      "tab.misc": "Misc",

      "cloud.provider": "Provider",
      "cloud.addServer": "Add server",
      "cloud.remove": "Remove",
      "cloud.serverNamePlaceholder": "Server name, e.g. Groq",
      "cloud.add": "Add",
      "cloud.cancel": "Cancel",
      "cloud.apiUrl": "API URL",
      "cloud.apiKey": "API key",
      "cloud.models": "Models",
      "cloud.addCustomModel": "Add custom model",
      "cloud.fetch": "Fetch",
      "cloud.customModelPlaceholder": "Custom model name",
      "cloud.modelsHint":
        "Fetched models are enabled by default. Disable any model you don't want in the model dropdown above the chat box. Custom models are kept when you Fetch again.",
      "cloud.keyHint":
        "Your key is stored only in this extension's local browser storage.",

      "local.backend": "Backend",
      "local.endpointUrl": "Endpoint URL",
      "local.privacyHint":
        "Requests go directly to the local server you configure. Nothing is sent to TuxAI servers.",

      "ui.display": "Display",
      "ui.textSize": "Text size (px)",
      "ui.reset": "Reset",
      "ui.textSizeHint": "Default: 14px. Range: 10–24px.",
      "ui.contextSize": "Context size",
      "ui.contextSizeHint": "Used for history trimming.",
      "ui.interfaceSize": "Interface size",
      "ui.interfaceSizeHint":
        "Scales the whole sidebar interface. Default: 100%.",
      "ui.language": "Language",
      "ui.langAuto": "Auto (follow browser)",
      "ui.langEn": "English",
      "ui.langZh": "中文",
      "ui.languageHint": "Language of the sidebar and page popup.",
      "ui.popupShortcut": "Popup shortcut",
      "ui.shortcutDisabled": "Disabled",
      "ui.shortcutHint":
        "Plain text selection is automatically sent to the TuxAI sidebar. The shortcut above shows the quick tool popup on the page instead.",

      "sound.title": "Text to speech",
      "sound.provider": "TTS provider",
      "sound.sameAsChat": "Same as chat provider",
      "sound.model": "TTS model",
      "sound.use": "Use",
      "sound.apiUrl": "TTS API URL",
      "sound.apiKey": "TTS API key",
      "sound.optionalOverride": "(optional override)",
      "sound.voice": "Voice",
      "sound.test": "Test",
      "sound.notSupported": "TTS not supported",
      "sound.hint":
        "The TTS provider/model is independent of the chat model, so you can chat with DeepSeek and speak with OpenAI at the same time: pick OpenAI as the TTS provider (it reuses the OpenAI key stored in the Cloud Server tab), then set the TTS model to gpt-4o-mini-tts. Leave the provider as “Same as chat provider” to reuse the chat connection. The URL/key fields are optional overrides. Enter a TTS model and click Use to load its voices; if the model has no text-to-speech support, the Voice field shows “TTS not supported”. Use Test to preview the selected voice.",

      "tools.title": "Manage Tools",
      "tools.new": "New tool",
      "tools.resetDefaults": "Reset defaults",
      "tools.tool": "Tool",
      "tools.name": "Name",
      "tools.namePlaceholder": "Tool name",
      "tools.systemPrompt": "System prompt",
      "tools.promptPlaceholder": "Describe what this tool should do...",
      "tools.save": "Save tool",
      "tools.delete": "Delete",

      "misc.title": "Backup/Restore settings",
      "misc.export": "Export settings backup",
      "misc.import": "Import settings backup",
      "misc.hint":
        "Export saves all settings, including API keys, models, and every tool (name and prompt). Chat history is not included. Import restores them and reloads the sidebar.",
      "misc.historyTitle": "Backup/Restore chat history",
      "misc.historyExport": "Export chat history",
      "misc.historyImport": "Import chat history",
      "misc.historyHint":
        "Export saves every chat session and open tab. Import replaces the current chat history and reloads the sidebar.",

      "selection.from": "From your selected text",
      "selection.clear": "Clear selected text",

      "composer.noModel": "No model selected",
      "composer.switchModel": "Switch model",
      "composer.attach": "Attach file/image",
      "composer.history": "Previous chat sessions",
      "composer.newChat": "New chat",
      "composer.newTab": "New tab",
      "composer.ask": "Ask TuxAI...",
      "composer.message": "Message",
      "composer.send": "Send message",
      "composer.scrollToBottom": "Scroll to latest",

      "tab.untitled": "New chat",
      "tab.close": "Close tab",

      "history.title": "Previous chat sessions",
      "history.deleteAll": "Delete all",
      "history.close": "Close history",
      "history.back": "Back",

      "role.you": "You",
      "role.assistant": "Assistant",
      "msg.thinking": "Thinking...",
      "msg.copy": "Copy message",
      "msg.copyCode": "Copy code",
      "msg.copied": "Copied!",
      "msg.copyFailed": "Copy failed",
      "msg.readAloud": "Read aloud",
      "msg.stopReading": "Stop reading",
      "msg.ttsFailed": "Text-to-speech failed",
      "msg.audioFailed": "Audio playback failed",
      "msg.clickExpand": "Click to expand",
      "msg.clickCollapse": "Click to collapse",
      "msg.nothingToSpeak": "There is nothing to read aloud.",

      "status.connecting": "Connecting...",
      "status.generating": "Generating...",
      "status.reasoning": "Reasoning...",
      "status.done": "Done",
      "status.stopped": "Stopped",
      "status.error": "Error",
      "status.noResponse": "No response content",

      "popup.pickTool": "Pick a tool",
      "popup.result": "Result",
      "popup.error": "Error",
      "popup.working": "Working...",
      "popup.back": "Back",
      "popup.close": "Close",
      "popup.more": "More",
      "popup.less": "Less",
      "popup.generating": "Generating speech...",
      "popup.stopReading": "Stop reading",
      "popup.failed": "Text-to-speech failed",
      "popup.noTools": "No tools available.",
      "popup.pin": "Pin",
      "popup.unpin": "Unpin",
      "popup.noText": "No text to speak.",
      "popup.ttsNotSupported": "TTS not supported",
    },

    zh: {
      "app.title": "Tux AI 侧边栏",
      "status.ready": "就绪",
      "header.toggleTheme": "切换主题",
      "header.toggleSettings": "切换设置",

      "tab.cloud": "云端服务",
      "tab.local": "本地服务",
      "tab.ui": "界面",
      "tab.sound": "声音",
      "tab.tools": "工具",
      "tab.misc": "其他",

      "cloud.provider": "服务商",
      "cloud.addServer": "添加服务商",
      "cloud.remove": "移除",
      "cloud.serverNamePlaceholder": "服务商名称，例如 Groq",
      "cloud.add": "添加",
      "cloud.cancel": "取消",
      "cloud.apiUrl": "API 地址",
      "cloud.apiKey": "API 密钥",
      "cloud.models": "模型",
      "cloud.addCustomModel": "添加自定义模型",
      "cloud.fetch": "获取",
      "cloud.customModelPlaceholder": "自定义模型名称",
      "cloud.modelsHint":
        "获取到的模型默认启用。可在聊天框上方的模型下拉里禁用不需要的模型。再次获取会保留自定义模型。",
      "cloud.keyHint": "密钥只保存在此扩展的本地浏览器存储中。",

      "local.backend": "后端",
      "local.endpointUrl": "服务地址",
      "local.privacyHint":
        "请求直接发往你配置的本地服务，不会发送到 TuxAI 服务器。",

      "ui.display": "显示",
      "ui.textSize": "文字大小 (px)",
      "ui.reset": "重置",
      "ui.textSizeHint": "默认 14px，范围 10–24px。",
      "ui.contextSize": "上下文长度",
      "ui.contextSizeHint": "用于历史记录裁剪。",
      "ui.interfaceSize": "界面缩放",
      "ui.interfaceSizeHint": "缩放整个侧边栏界面，默认 100%。",
      "ui.language": "语言",
      "ui.langAuto": "自动（跟随浏览器）",
      "ui.langEn": "English",
      "ui.langZh": "中文",
      "ui.languageHint": "侧边栏和页面弹窗的语言。",
      "ui.popupShortcut": "弹窗快捷键",
      "ui.shortcutDisabled": "禁用",
      "ui.shortcutHint":
        "选中纯文本时会自动发送到 TuxAI 侧边栏。上面的快捷键则会在页面上弹出快捷工具窗口。",

      "sound.title": "语音朗读",
      "sound.provider": "TTS 服务商",
      "sound.sameAsChat": "与聊天服务商相同",
      "sound.model": "TTS 模型",
      "sound.use": "使用",
      "sound.apiUrl": "TTS API 地址",
      "sound.apiKey": "TTS API 密钥",
      "sound.optionalOverride": "（可选覆盖）",
      "sound.voice": "音色",
      "sound.test": "测试",
      "sound.notSupported": "不支持 TTS",
      "sound.hint":
        "TTS 的服务商/模型与聊天模型相互独立，所以可以一边用 DeepSeek 聊天、一边用 OpenAI 朗读：把 TTS 服务商选为 OpenAI（复用它存在云端服务里的密钥），再把 TTS 模型设为 gpt-4o-mini-tts。服务商保持“与聊天服务商相同”则沿用聊天连接。URL/密钥是可选的覆盖项。输入 TTS 模型后点“使用”加载音色；若模型不支持语音，音色处会显示“不支持 TTS”。点“测试”可试听选中的音色。",

      "tools.title": "管理工具",
      "tools.new": "新建工具",
      "tools.resetDefaults": "恢复默认",
      "tools.tool": "工具",
      "tools.name": "名称",
      "tools.namePlaceholder": "工具名称",
      "tools.systemPrompt": "系统提示词",
      "tools.promptPlaceholder": "描述这个工具应该做什么……",
      "tools.save": "保存工具",
      "tools.delete": "删除",

      "misc.title": "备份 / 恢复设置",
      "misc.export": "导出设置备份",
      "misc.import": "导入设置备份",
      "misc.hint":
        "导出会保存所有设置（含 API 密钥、模型，以及每个工具的名称和提示词），但不包含聊天记录。导入会恢复这些设置并重新加载侧边栏。",
      "misc.historyTitle": "备份 / 恢复聊天记录",
      "misc.historyExport": "导出聊天记录",
      "misc.historyImport": "导入聊天记录",
      "misc.historyHint":
        "导出会保存全部聊天会话和当前打开的标签页。导入会替换现有聊天记录并重新加载侧边栏。",

      "selection.from": "来自你选中的文本",
      "selection.clear": "清除选中的文本",

      "composer.noModel": "未选择模型",
      "composer.switchModel": "切换模型",
      "composer.attach": "附加文件/图片",
      "composer.history": "历史会话",
      "composer.newChat": "新对话",
      "composer.newTab": "新标签页",
      "composer.ask": "向 TuxAI 提问……",
      "composer.message": "消息",
      "composer.send": "发送消息",
      "composer.scrollToBottom": "滚动到最新",

      "tab.untitled": "新对话",
      "tab.close": "关闭标签页",

      "history.title": "历史会话",
      "history.deleteAll": "全部删除",
      "history.close": "关闭历史",
      "history.back": "返回",

      "role.you": "你",
      "role.assistant": "助手",
      "msg.thinking": "思考中……",
      "msg.copy": "复制消息",
      "msg.copyCode": "复制代码",
      "msg.copied": "已复制！",
      "msg.copyFailed": "复制失败",
      "msg.readAloud": "朗读",
      "msg.stopReading": "停止朗读",
      "msg.ttsFailed": "语音朗读失败",
      "msg.audioFailed": "音频播放失败",
      "msg.clickExpand": "点击展开",
      "msg.clickCollapse": "点击收起",
      "msg.nothingToSpeak": "没有可朗读的内容。",

      "status.connecting": "连接中……",
      "status.generating": "生成中……",
      "status.reasoning": "推理中……",
      "status.done": "完成",
      "status.stopped": "已停止",
      "status.error": "错误",
      "status.noResponse": "无回复内容",

      "popup.pickTool": "选择工具",
      "popup.result": "结果",
      "popup.error": "错误",
      "popup.working": "处理中……",
      "popup.back": "返回",
      "popup.close": "关闭",
      "popup.more": "更多",
      "popup.less": "收起",
      "popup.generating": "正在生成语音……",
      "popup.stopReading": "停止朗读",
      "popup.failed": "语音朗读失败",
      "popup.noTools": "没有可用的工具。",
      "popup.pin": "固定",
      "popup.unpin": "取消固定",
      "popup.noText": "没有可朗读的内容。",
      "popup.ttsNotSupported": "不支持 TTS",
    },
  };

  function detectLang() {
    try {
      const nav = (root.navigator && root.navigator.language) || "en";
      return String(nav).toLowerCase().startsWith("zh") ? "zh" : "en";
    } catch (error) {
      return "en";
    }
  }

  function resolveLang(pref) {
    if (pref === "zh" || pref === "en") return pref;
    return detectLang();
  }

  function translate(lang, key, fallback) {
    const table = MESSAGES[lang] || MESSAGES.en;
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    if (Object.prototype.hasOwnProperty.call(MESSAGES.en, key)) {
      return MESSAGES.en[key];
    }
    return fallback !== undefined ? fallback : key;
  }

  // Translates every element under `root` carrying data-i18n* attributes.
  function apply(lang, root) {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = translate(lang, key, el.textContent);
    });
    doc.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.setAttribute("placeholder", translate(lang, key));
    });
    doc.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", translate(lang, key));
    });
    doc.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", translate(lang, key));
    });
  }

  const api = {
    LANG_KEY,
    MESSAGES,
    detectLang,
    resolveLang,
    t: translate,
    apply,
  };

  // Expose as a sandbox global. Content scripts share `globalThis`/`self`
  // across files in both Chrome and Firefox, whereas `window` differs in
  // Firefox content scripts (it is the page's Xray-wrapped window).
  root.TuxAIi18n = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
      ? self
      : this
);
