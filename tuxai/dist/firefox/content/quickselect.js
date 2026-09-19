// TuxAI - page selection content script.
// - Plain text selection automatically sends the selection to the side panel.
// - The configured shortcut (Alt+select etc.) shows the quick tool popup.
//   Tool clicks are handled here and the result is shown directly in the popup.

(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const i18n =
    (typeof globalThis !== "undefined" && globalThis.TuxAIi18n) ||
    (typeof self !== "undefined" && self.TuxAIi18n) ||
    (typeof window !== "undefined" && window.TuxAIi18n) ||
    null;
  const LANGUAGE_KEY = (i18n && i18n.LANG_KEY) || "penguin_language";
  let uiLang = "en";

  function t(key, fallback) {
    if (i18n && typeof i18n.t === "function") {
      return i18n.t(uiLang, key, fallback);
    }
    return fallback !== undefined ? fallback : key;
  }

  const QUICK_SHORTCUT_KEY = "penguin_quick_shortcut";
  const SHORTCUT_MODES = new Set([
    "disabled",
    "alt",
    "ctrl",
    "shift",
    "alt-shift",
    "ctrl-shift",
    "ctrl-alt",
    "ctrl-alt-shift",
  ]);

  let shortcutMode = "alt";
  let popupEl = null;
  let popupContent = null;
  let popupTitle = null;
  let popupToolList = [];
  let popupSelectedText = "";
  let lastAutoSentKey = "";
  let lastAutoSentAt = 0;
  let autoSentActive = false;
  let popupDrag = null;
  let popupResultText = "";
  let popupAudio = null;
  let popupAudioUrl = null;
  let popupAudioCtx = null;
  let popupSource = null;
  let popupSpeakButton = null;

  function normalizeShortcut(value) {
    return SHORTCUT_MODES.has(value) ? value : "alt";
  }

  function applyShortcutMode(value) {
    shortcutMode = normalizeShortcut(value);
  }

  function matchesShortcut(event, mode) {
    const { altKey, ctrlKey, shiftKey, metaKey } = event;

    switch (mode) {
      case "disabled":
        return false;
      case "alt":
        return altKey && !ctrlKey && !shiftKey && !metaKey;
      case "ctrl":
        return ctrlKey && !altKey && !shiftKey && !metaKey;
      case "shift":
        return shiftKey && !altKey && !ctrlKey && !metaKey;
      case "alt-shift":
        return altKey && shiftKey && !ctrlKey && !metaKey;
      case "ctrl-shift":
        return ctrlKey && shiftKey && !altKey && !metaKey;
      case "ctrl-alt":
        return ctrlKey && altKey && !shiftKey && !metaKey;
      case "ctrl-alt-shift":
        return ctrlKey && altKey && shiftKey && !metaKey;
      default:
        return false;
    }
  }

  function hasAnyModifier(event) {
    return event.altKey || event.ctrlKey || event.shiftKey || event.metaKey;
  }

  function getSelectionText(target) {
    try {
      const targetEl =
        target && target.nodeType === 1
          ? target
          : target && target.parentElement
            ? target.parentElement
            : null;

      // Prefer a selection inside the element the user interacted with.
      const targetField =
        targetEl &&
        (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA")
          ? targetEl
          : null;

      // For text inputs/text areas, window.getSelection() is empty, so read
      // the field's native selection range instead. Fall back to the focused
      // field in case the mouse button was released just outside the field.
      const field =
        targetField ||
        (document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA")
          ? document.activeElement
          : null);

      if (field) {
        if (
          field.tagName === "INPUT" &&
          String(field.type).toLowerCase() === "password"
        ) {
          return "";
        }
        const start = field.selectionStart;
        const end = field.selectionEnd;
        if (typeof start === "number" && typeof end === "number" && start !== end) {
          const value = typeof field.value === "string" ? field.value : "";
          return value
            .slice(Math.min(start, end), Math.max(start, end))
            .trim();
        }
        return "";
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return "";
      return selection.toString().trim();
    } catch (error) {
      return "";
    }
  }

  function sendSelectedText(text) {
    const now = Date.now();
    if (text === lastAutoSentKey && now - lastAutoSentAt < 3000) return;
    lastAutoSentKey = text;
    lastAutoSentAt = now;
    autoSentActive = true;

    try {
      api.runtime
        .sendMessage({ type: "penguin_selected_text", text })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }
  }

  function clearSidebarSelection() {
    if (!autoSentActive) return;
    autoSentActive = false;
    lastAutoSentKey = "";
    try {
      api.runtime
        .sendMessage({ type: "penguin_clear_selected_text" })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }
  }

  function closePopup() {
    stopPopupSpeech();
    popupDrag = null;
    if (popupEl && popupEl.parentNode) {
      popupEl.parentNode.removeChild(popupEl);
    }
    popupEl = null;
    popupContent = null;
    popupTitle = null;
    popupToolList = [];
    popupSelectedText = "";
    popupResultText = "";
  }

  const SPEAK_ICONS = {
    speak:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
    stop:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  };

  function speakButtonIdle(button) {
    button.disabled = false;
    button.style.color = "#ffffff";
    button.style.background = "#0d9488";
    button.innerHTML = SPEAK_ICONS.speak;
    button.title = t("msg.readAloud", "Read aloud");
  }

  function stopPopupSpeech() {
    if (popupSource) {
      try {
        popupSource.stop();
      } catch (error) {
        // No-op.
      }
      popupSource = null;
    }
    if (popupAudioCtx) {
      try {
        popupAudioCtx.close();
      } catch (error) {
        // No-op.
      }
      popupAudioCtx = null;
    }
    if (popupAudio) {
      try {
        popupAudio.pause();
      } catch (error) {
        // No-op.
      }
      popupAudio = null;
    }
    if (popupAudioUrl) {
      try {
        URL.revokeObjectURL(popupAudioUrl);
      } catch (error) {
        // No-op.
      }
      popupAudioUrl = null;
    }
    if (popupSpeakButton) {
      speakButtonIdle(popupSpeakButton);
      popupSpeakButton = null;
    }
  }

  // Converts a base64 data URL into an ArrayBuffer for Web Audio decoding.
  function audioDataToArrayBuffer(src) {
    const value = String(src || "");
    const comma = value.indexOf(",");
    if (!value.startsWith("data:") || comma < 0) return null;
    try {
      const binary = atob(value.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      return null;
    }
  }

  // Firefox is stricter about data: audio under a page's CSP, so convert the
  // base64 data URL returned by the background into a blob: URL.
  function toAudioObjectUrl(src) {
    const value = String(src || "");
    if (!value.startsWith("data:")) return value;
    try {
      const comma = value.indexOf(",");
      const meta = value.slice(5, comma);
      const mime = meta.split(";")[0] || "audio/mpeg";
      const binary = atob(value.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch (error) {
      return value;
    }
  }

  function createSpeakIconButton(getText) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-tuxai-speak", "1");
    button.title = t("msg.readAloud", "Read aloud");
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      background: "#0d9488",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxSizing: "border-box",
    });
    button.innerHTML = SPEAK_ICONS.speak;
    button.addEventListener("click", (event) => {
      // Do not let the parent bubble toggle when the speaker is clicked.
      event.stopPropagation();
      if (popupSpeakButton === button) {
        stopPopupSpeech();
        return;
      }
      speakPopupText(getText(), button);
    });
    return button;
  }

  function createSpeakRow(getText) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginTop: "10px",
    });
    row.appendChild(createSpeakIconButton(getText));
    return row;
  }

  async function speakPopupText(text, button) {
    const value = String(text || "").trim();
    if (!value) return;

    stopPopupSpeech();
    popupSpeakButton = button;

    // Create the AudioContext synchronously inside the click gesture so
    // Firefox unlocks audio; it stays usable across the async round-trip.
    const AudioCtx =
      (typeof globalThis !== "undefined" &&
        (globalThis.AudioContext || globalThis.webkitAudioContext)) ||
      (typeof window !== "undefined" &&
        (window.AudioContext || window.webkitAudioContext)) ||
      null;
    let ctx = null;
    if (AudioCtx) {
      try {
        ctx = new AudioCtx();
      } catch (error) {
        ctx = null;
      }
    }

    button.disabled = true;
    button.title = t("popup.generating", "Generating speech...");

    const startUi = () => {
      button.disabled = false;
      button.style.background = "#0f766e";
      button.style.color = "#ffffff";
      button.innerHTML = SPEAK_ICONS.stop;
      button.title = t("msg.stopReading", "Stop reading");
    };
    const reset = () => {
      if (popupSpeakButton === button) {
        popupSpeakButton = null;
        popupAudio = null;
        popupSource = null;
        popupAudioCtx = null;
        if (popupAudioUrl) {
          try {
            URL.revokeObjectURL(popupAudioUrl);
          } catch (error) {
            // No-op.
          }
          popupAudioUrl = null;
        }
        speakButtonIdle(button);
      }
    };
    const discardCtx = () => {
      if (ctx) {
        try {
          ctx.close();
        } catch (error) {
          // No-op.
        }
        ctx = null;
      }
    };

    try {
      const response = await api.runtime.sendMessage({
        type: "penguin_popup_speak",
        text: value,
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || t("popup.failed", "Text-to-speech failed.")
        );
      }
      if (popupSpeakButton !== button) {
        discardCtx();
        return;
      }

      const arrayBuffer = audioDataToArrayBuffer(response.audio);
      if (ctx && arrayBuffer) {
        // Preferred path: decode + play through Web Audio. This avoids the
        // autoplay/user-activation and blob/CSP issues of <audio> in a
        // Firefox content script.
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        if (popupSpeakButton !== button) {
          discardCtx();
          return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        popupAudioCtx = ctx;
        popupSource = source;
        ctx = null;
        startUi();
        source.onended = reset;
        if (popupAudioCtx.state === "suspended") {
          try {
            await popupAudioCtx.resume();
          } catch (error) {
            // No-op.
          }
        }
        source.start(0);
      } else {
        // Fallback: <audio> element with a blob URL.
        discardCtx();
        popupAudioUrl = toAudioObjectUrl(response.audio);
        const audio = new Audio(popupAudioUrl);
        popupAudio = audio;
        startUi();
        audio.addEventListener("ended", reset);
        audio.addEventListener("error", reset);
        await audio.play();
      }
    } catch (error) {
      if (popupSpeakButton === button) {
        popupSpeakButton = null;
        popupAudio = null;
        popupSource = null;
      }
      discardCtx();
      if (popupAudioCtx) {
        try {
          popupAudioCtx.close();
        } catch (closeError) {
          // No-op.
        }
        popupAudioCtx = null;
      }
      button.disabled = false;
      button.innerHTML = SPEAK_ICONS.error;
      button.title = (error && error.message) || t("popup.failed", "Text-to-speech failed.");
      setTimeout(() => {
        if (popupSpeakButton === button) return;
        speakButtonIdle(button);
      }, 1800);
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createPopup(x, y, titleText) {
    closePopup();

    const el = document.createElement("div");
    el.setAttribute("data-tuxai-quick", "1");
    Object.assign(el.style, {
      position: "fixed",
      zIndex: "2147483647",
      background: "#000000",
      color: "#e2e8f0",
      border: "1px solid #333333",
      borderRadius: "12px",
      boxShadow: "0 10px 28px rgba(0, 0, 0, 0.6)",
      padding: "10px",
      minWidth: "210px",
      maxWidth: "360px",
      maxHeight: "75vh",
      overflowY: "auto",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: "13px",
      lineHeight: "1.45",
      userSelect: "none",
      boxSizing: "border-box",
    });

    popupTitle = document.createElement("div");
    popupTitle.textContent = titleText;
    popupTitle.title = "Drag to move";
    Object.assign(popupTitle.style, {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.4px",
      color: "#5eead4",
      textTransform: "uppercase",
      marginBottom: "8px",
      cursor: "move",
    });
    popupTitle.addEventListener("mousedown", popupDragStart);
    el.appendChild(popupTitle);

    popupContent = document.createElement("div");
    el.appendChild(popupContent);

    (document.body || document.documentElement).appendChild(el);

    try {
      const rect = el.getBoundingClientRect();
      const left = clamp(
        x + 12,
        4,
        Math.max(4, window.innerWidth - rect.width - 4)
      );
      const top = clamp(
        y + 12,
        4,
        Math.max(4, window.innerHeight - rect.height - 4)
      );
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    } catch (error) {
      el.style.left = "16px";
      el.style.top = "16px";
    }

    popupEl = el;
  }

  function clampPopupToViewport() {
    if (!popupEl) return;
    const rect = popupEl.getBoundingClientRect();
    const left = clamp(
      rect.left,
      4,
      Math.max(4, window.innerWidth - rect.width - 4)
    );
    const top = clamp(
      rect.top,
      4,
      Math.max(4, window.innerHeight - rect.height - 4)
    );
    popupEl.style.left = `${left}px`;
    popupEl.style.top = `${top}px`;
  }

  function popupDragStart(event) {
    if (!popupEl || event.button !== 0) return;
    const rect = popupEl.getBoundingClientRect();
    popupDrag = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    event.preventDefault();
  }

  function movePopupWithDrag(event) {
    if (!popupDrag || !popupEl) return;
    const rect = popupEl.getBoundingClientRect();
    const left = clamp(
      popupDrag.startLeft + (event.clientX - popupDrag.startX),
      4,
      Math.max(4, window.innerWidth - rect.width - 4)
    );
    const top = clamp(
      popupDrag.startTop + (event.clientY - popupDrag.startY),
      4,
      Math.max(4, window.innerHeight - rect.height - 4)
    );
    popupEl.style.left = `${left}px`;
    popupEl.style.top = `${top}px`;
  }

  function renderToolList(tools, text) {
    popupToolList = tools;
    popupSelectedText = text;
    popupTitle.textContent = t("popup.pickTool", "TuxAI · pick a tool");
    popupContent.innerHTML = "";

    if (!tools.length) {
      popupContent.textContent = t("popup.noTools", "No tools available.");
      return;
    }

    // Show the selected text as a truncated bubble (no scrolling) with the
    // speaker icon in its bottom-right corner. Clicking the bubble expands it
    // to reveal everything, and only then does it scroll.
    const selected = String(text || "").trim();
    if (selected) {
      const preview = document.createElement("div");
      preview.setAttribute("data-tuxai-preview", "1");
      preview.setAttribute("data-tuxai-preview-expanded", "0");
      preview.title = "Click to expand";
      Object.assign(preview.style, {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        background: "#111827",
        border: "1px solid #ffffff",
        borderRadius: "8px",
        padding: "8px 10px",
        marginBottom: "8px",
        overflow: "hidden",
        cursor: "pointer",
      });

      // Clamp to three lines so long selections never add a scrollbar.
      const previewText = document.createElement("div");
      previewText.setAttribute("data-tuxai-preview-text", "1");
      previewText.textContent = selected;
      Object.assign(previewText.style, {
        color: "#ffffff",
        fontSize: "12.5px",
        lineHeight: "1.45",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: "3",
        WebkitBoxOrient: "vertical",
      });
      preview.appendChild(previewText);

      // A small hint in the empty space under the text makes it clear the
      // content is truncated and can be expanded.
      const hint = document.createElement("span");
      hint.setAttribute("data-tuxai-preview-hint", "1");
      hint.hidden = true;
      Object.assign(hint.style, {
        marginRight: "auto",
        fontSize: "11px",
        color: "#cbd5e1",
        userSelect: "none",
      });

      const updateHint = () => {
        const expanded =
          preview.getAttribute("data-tuxai-preview-expanded") === "1";
        const clamped = previewText.scrollHeight > previewText.clientHeight + 1;
        if (expanded) {
          hint.textContent = `\u25b4 ${t("popup.less", "Less")}`;
          hint.hidden = false;
        } else if (clamped) {
          hint.textContent = `\u25be ${t("popup.more", "More")}`;
          hint.hidden = false;
        } else {
          hint.hidden = true;
        }
      };

      const setExpanded = (expanded) => {
        preview.setAttribute(
          "data-tuxai-preview-expanded",
          expanded ? "1" : "0"
        );
        preview.title = expanded ? "Click to collapse" : "Click to expand";
        if (expanded) {
          previewText.style.display = "block";
          previewText.style.WebkitLineClamp = "unset";
          previewText.style.maxHeight = "240px";
          previewText.style.overflowY = "auto";
        } else {
          previewText.style.display = "-webkit-box";
          previewText.style.WebkitLineClamp = "3";
          previewText.style.maxHeight = "";
          previewText.style.overflowY = "hidden";
        }
        updateHint();
        clampPopupToViewport();
      };

      preview.addEventListener("click", (event) => {
        // Let the speaker button handle its own clicks.
        if (event.target.closest("[data-tuxai-speak]")) return;
        setExpanded(preview.getAttribute("data-tuxai-preview-expanded") !== "1");
      });

      const speakRow = document.createElement("div");
      Object.assign(speakRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "0",
        justifyContent: "flex-end",
      });
      speakRow.appendChild(hint);
      speakRow.appendChild(createSpeakIconButton(() => popupSelectedText));
      preview.appendChild(speakRow);

      popupContent.appendChild(preview);
      updateHint();
    }

    const toolRow = document.createElement("div");
    Object.assign(toolRow.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
    });

    for (const tool of tools) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = tool.name;
      Object.assign(item.style, {
        background: "#1e293b",
        color: "#e2e8f0",
        border: "1px solid #334155",
        borderRadius: "8px",
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: "12px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      });
      item.addEventListener("mouseenter", () => {
        item.style.background = "#334155";
        item.style.borderColor = "#14b8a6";
        item.style.color = "#5eead4";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "#1e293b";
        item.style.borderColor = "#334155";
        item.style.color = "#e2e8f0";
      });
      item.addEventListener("click", () => {
        runToolInPopup(tool.id);
      });
      toolRow.appendChild(item);
    }
    popupContent.appendChild(toolRow);

    clampPopupToViewport();
  }

  function showToolPicker(tools, x, y, text) {
    createPopup(x, y, t("popup.pickTool", "TuxAI · pick a tool"));
    renderToolList(tools, text);
  }

  function renderPopupActionRow() {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "6px",
      marginTop: "10px",
    });

    if (popupResultText.trim()) {
      const speakButton = createSpeakIconButton(() => popupResultText);
      speakButton.style.marginRight = "auto";
      row.appendChild(speakButton);
    }

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.textContent = t("popup.back", "Back");
    Object.assign(backButton.style, {
      background: "#1e293b",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "8px",
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: "12px",
    });
    backButton.addEventListener("click", () => {
      if (popupToolList.length) renderToolList(popupToolList, popupSelectedText);
    });
    row.appendChild(backButton);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = t("popup.close", "Close");
    Object.assign(closeButton.style, {
      background: "#0f766e",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: "12px",
    });
    closeButton.addEventListener("click", closePopup);
    row.appendChild(closeButton);

    return row;
  }

  function showPopupResult(text, titleText) {
    popupResultText = String(text || "");
    popupTitle.textContent = titleText || t("popup.result", "TuxAI · result");
    popupContent.innerHTML = "";

    const result = document.createElement("div");
    result.textContent = text;
    Object.assign(result.style, {
      maxHeight: "280px",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      color: "#ffffff",
      background: "#111827",
      border: "1px solid #ffffff",
      borderRadius: "8px",
      padding: "10px",
      userSelect: "text",
      WebkitUserSelect: "text",
      cursor: "text",
    });
    popupContent.appendChild(result);
    popupContent.appendChild(renderPopupActionRow());
    clampPopupToViewport();
  }

  function showPopupError(error, titleText) {
    stopPopupSpeech();
    popupResultText = "";
    popupTitle.textContent = titleText || t("popup.error", "TuxAI · error");
    popupContent.innerHTML = "";

    const message = document.createElement("div");
    message.textContent = error || "Unknown error.";
    Object.assign(message.style, {
      color: "#fca5a5",
      background: "rgba(220, 38, 38, 0.12)",
      border: "1px solid rgba(220, 38, 38, 0.35)",
      borderRadius: "8px",
      padding: "10px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "200px",
      overflowY: "auto",
    });
    popupContent.appendChild(message);
    popupContent.appendChild(renderPopupActionRow());
    clampPopupToViewport();
  }

  function showPopupLoading(message, titleText) {
    stopPopupSpeech();
    popupResultText = "";
    popupTitle.textContent = titleText || t("popup.working", "TuxAI · working...");
    popupContent.innerHTML = "";
    const loading = document.createElement("div");
    loading.textContent = message || t("popup.working", "Processing...");
    Object.assign(loading.style, {
      color: "#94a3b8",
      padding: "8px 4px",
    });
    popupContent.appendChild(loading);
    clampPopupToViewport();
  }

  async function runToolInPopup(toolId) {
    const text = popupSelectedText.trim();
    if (!text) return;

    const tool = popupToolList.find((item) => item.id === toolId);
    const toolName = tool ? tool.name : toolId;
    const toolTitle = `TuxAI · ${toolName}`;

    showPopupLoading(t("popup.working", "Running..."), toolTitle);

    try {
      const response = await api.runtime.sendMessage({
        type: "penguin_popup_run_tool",
        toolId,
        text,
      });

      if (response && response.ok) {
        const label = response.label || "";
        showPopupResult(
          response.text,
          label ? `${toolTitle} · ${label}` : toolTitle
        );
      } else {
        showPopupError(
          (response && response.error) || "Failed to get a result.",
          toolTitle
        );
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      showPopupError(message, toolTitle);
    }
  }

  function showQuickPopup(x, y, text) {
    try {
      api.runtime
        .sendMessage({ type: "penguin_get_tools" })
        .then((tools) => {
          if (!tools || !tools.length) {
            createPopup(x, y, t("popup.error", "TuxAI · error"));
            showPopupError(t("popup.noTools", "No tools available."));
            return;
          }
          showToolPicker(tools, x, y, text);
        })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }
  }

  function initLanguage() {
    try {
      api.storage.local
        .get([LANGUAGE_KEY])
        .then((result) => {
          uiLang = i18n ? i18n.resolveLang(result[LANGUAGE_KEY]) : "en";
        })
        .catch(() => {});
    } catch (error) {
      // No-op.
    }

    try {
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes[LANGUAGE_KEY]) {
          uiLang = i18n
            ? i18n.resolveLang(changes[LANGUAGE_KEY].newValue)
            : "en";
        }
      });
    } catch (error) {
      // No-op.
    }
  }

  function initShortcutSettings() {
    try {
      api.storage.local.get([QUICK_SHORTCUT_KEY]).then((result) => {
        applyShortcutMode(result[QUICK_SHORTCUT_KEY]);
      }).catch(() => {});
    } catch (error) {
      // No-op.
    }

    try {
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes[QUICK_SHORTCUT_KEY]) {
          applyShortcutMode(changes[QUICK_SHORTCUT_KEY].newValue);
        }
      });
    } catch (error) {
      // No-op.
    }
  }

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!popupDrag || !popupEl) return;
      event.preventDefault();
      movePopupWithDrag(event);
    },
    true
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (popupEl && !popupEl.contains(event.target)) closePopup();
    },
    true
  );

  document.addEventListener(
    "mouseup",
    (event) => {
      if (popupDrag) {
        popupDrag = null;
        return;
      }
      if (popupEl && popupEl.contains(event.target)) return;
      if (popupEl && !matchesShortcut(event, shortcutMode)) {
        closePopup();
      }

      const text = getSelectionText(event.target);

      if (!text) {
        closePopup();
        clearSidebarSelection();
      } else if (matchesShortcut(event, shortcutMode)) {
        if (popupEl) return;
        showQuickPopup(event.clientX, event.clientY, text);
        return;
      } else if (!hasAnyModifier(event)) {
        // Plain selection with no modifier → send to the side panel.
        sendSelectedText(text);
      }

      // The browser may collapse the selection just after mouseup.
      // Check again shortly after so the sidebar cancels on the first click.
      setTimeout(() => {
        if (autoSentActive && !getSelectionText(document.activeElement)) {
          clearSidebarSelection();
        }
      }, 50);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closePopup();
    },
    true
  );

  window.addEventListener("blur", closePopup);

  initShortcutSettings();
  initLanguage();
})();
