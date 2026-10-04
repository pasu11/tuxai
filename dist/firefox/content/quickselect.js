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
  // Where an editable selection came from, so a tool result can be written
  // back over the exact original range. Set only for the quick popup flow.
  let popupSelectionSource = null;
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
  let popupSpeakAnimation = null;
  let popupPinned = false;
  let popupAnchorRect = null;
  let popupAutoPosition = true;
  let popupSourceReplaced = false;

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

  // Resolve the real event target, unwrapping open shadow roots so editable
  // fields inside web components can be detected.
  function resolveEventTarget(event) {
    try {
      if (event && typeof event.composedPath === "function") {
        const path = event.composedPath();
        if (path && path.length && path[0] && path[0].nodeType === 1) {
          return path[0];
        }
      }
    } catch (error) {
      // Fall through to the retargeted target.
    }
    return event ? event.target : null;
  }

  function findContentEditableHost(el) {
    if (!el || !el.isContentEditable) return null;
    let host = el;
    try {
      while (host.parentElement && host.parentElement.isContentEditable) {
        host = host.parentElement;
      }
    } catch (error) {
      // Keep the deepest host found so far.
    }
    return host;
  }

  // Remember where an editable selection came from. Plain page text returns
  // `{ kind: "none" }`, so the replace action stays hidden for it.
  function captureSelectionSource(target) {
    try {
      const targetEl =
        target && target.nodeType === 1
          ? target
          : target && target.parentElement
            ? target.parentElement
            : null;

      const targetField =
        targetEl &&
        (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA")
          ? targetEl
          : null;

      const activeEl = document.activeElement;
      const field =
        targetField ||
        (activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
          ? activeEl
          : null);

      if (field) {
        if (
          field.tagName === "INPUT" &&
          String(field.type).toLowerCase() === "password"
        ) {
          return { kind: "none" };
        }
        const start = field.selectionStart;
        const end = field.selectionEnd;
        if (
          typeof start !== "number" ||
          typeof end !== "number" ||
          start === end
        ) {
          return { kind: "none" };
        }
        const value = typeof field.value === "string" ? field.value : "";
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        const raw = value.slice(from, to);
        if (!raw.trim()) return { kind: "none" };
        return { kind: "field", element: field, start: from, end: to, raw };
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount < 1) {
        return { kind: "none" };
      }
      // Anchor the rich-text source to the selection itself, so a leftover
      // focused contenteditable can never claim a plain page selection.
      const anchor =
        selection.anchorNode || selection.getRangeAt(0).commonAncestorContainer;
      const anchorEl =
        anchor && anchor.nodeType === 1
          ? anchor
          : anchor
            ? anchor.parentElement
            : null;
      const host =
        anchorEl && anchorEl.isContentEditable
          ? findContentEditableHost(anchorEl)
          : null;

      if (host) {
        const range = selection.getRangeAt(0).cloneRange();
        const raw = range.toString();
        if (!raw.trim()) return { kind: "none" };
        return { kind: "richtext", element: host, range, raw };
      }

      return { kind: "none" };
    } catch (error) {
      return { kind: "none" };
    }
  }

  // A viewport rect for the current selection, used to keep the popup off the
  // selected text. Field selections use the field box; everything else uses
  // the range box. Returns null when no rect can be measured.
  function captureSelectionRect(target, source) {
    try {
      if (source && source.kind === "field" && source.element) {
        return source.element.getBoundingClientRect();
      }
      if (source && source.kind === "richtext" && source.range) {
        const rect = source.range.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) return rect;
      }
      const targetEl =
        target && target.nodeType === 1
          ? target
          : target && target.parentElement
            ? target.parentElement
            : null;
      const field =
        targetEl &&
        (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA")
          ? targetEl
          : null;
      if (field) {
        const rect = field.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) return rect;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount && !selection.isCollapsed) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (rect && (rect.width || rect.height)) return rect;
      }
    } catch (error) {
      // No-op.
    }
    return null;
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
    popupPinned = false;
    if (popupEl && popupEl.parentNode) {
      popupEl.parentNode.removeChild(popupEl);
    }
    popupEl = null;
    popupContent = null;
    popupTitle = null;
    popupToolList = [];
    popupSelectedText = "";
    popupResultText = "";
    popupSelectionSource = null;
    popupAnchorRect = null;
    popupAutoPosition = true;
    popupSourceReplaced = false;
  }

  // Auto-dismiss (outside click, Escape, window blur) is suppressed while the
  // popup is pinned; only the explicit Close button may then remove it.
  function closePopupIfUnpinned() {
    if (popupPinned) return;
    closePopup();
  }

  const SPEAK_ICONS = {
    speak:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
    stop:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  };

  const COPY_ICONS = {
    copy:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    copied:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  };

  const REPLACE_ICONS = {
    replace:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>',
    replaced:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    failed:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
    undo: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>',
  };

  const PIN_PATH =
    '<path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>';
  const PIN_ICONS = {
    unpinned: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PIN_PATH}</svg>`,
    pinned: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PIN_PATH}</svg>`,
  };

  // Same pulse the sidebar's `.speak-message-btn.speaking` uses: opacity
  // 1 -> 0.45 -> 1 on a 1.2s loop. Content scripts have no stylesheet, so
  // drive it with the Web Animations API instead of a CSS class.
  function startSpeakPulse(button) {
    stopSpeakPulse();
    if (!button || typeof button.animate !== "function") return;
    try {
      popupSpeakAnimation = button.animate(
        [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }],
        { duration: 1200, iterations: Infinity, easing: "ease-in-out" }
      );
    } catch (error) {
      popupSpeakAnimation = null;
    }
  }

  function stopSpeakPulse() {
    if (!popupSpeakAnimation) return;
    try {
      popupSpeakAnimation.cancel();
    } catch (error) {
      // No-op.
    }
    popupSpeakAnimation = null;
  }

  function speakButtonIdle(button) {
    stopSpeakPulse();
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

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    // Preferred path. In a content script this can be rejected by the page
    // CSP or a missing permissions policy, so fall back to execCommand.
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (error) {
      // Fall through.
    }
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "1");
      Object.assign(area.style, {
        position: "fixed",
        top: "0",
        left: "-9999px",
        opacity: "0",
      });
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch (error) {
      return false;
    }
  }

  // The replace action is offered only for an editable source that is still
  // connected and still holds the original text.
  function isSourceUsable(source) {
    if (!source || source.kind === "none") return false;
    if (source.kind === "field") {
      const field = source.element;
      if (!field || !field.isConnected) return false;
      const value = typeof field.value === "string" ? field.value : "";
      if (value.slice(source.start, source.end) === source.raw) return true;
      return value.indexOf(source.raw) >= 0;
    }
    if (source.kind === "richtext") {
      const range = source.range;
      return Boolean(
        source.element &&
          source.element.isConnected &&
          range &&
          range.startContainer &&
          range.endContainer &&
          range.startContainer.isConnected &&
          range.endContainer.isConnected
      );
    }
    return false;
  }

  // Focus the field and take over its native selection so the browser edit
  // lands in the original range. execCommand keeps the native undo stack and
  // fires an input event; the value-setter fallback keeps frameworks
  // (React/Vue) in sync and is used when execCommand is unavailable.
  function insertIntoField(field, start, end, text) {
    if (!field || !field.isConnected) return false;
    try {
      field.focus({ preventScroll: true });
    } catch (error) {
      try {
        field.focus();
      } catch (inner) {
        return false;
      }
    }
    try {
      field.setSelectionRange(start, end);
    } catch (error) {
      return false;
    }

    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (error) {
      ok = false;
    }
    if (ok) return true;

    try {
      const proto =
        field.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      const value = typeof field.value === "string" ? field.value : "";
      const next = value.slice(0, start) + text + value.slice(end);
      if (descriptor && descriptor.set) {
        descriptor.set.call(field, next);
      } else {
        field.value = next;
      }
      try {
        field.setSelectionRange(start, start + text.length);
      } catch (error) {
        // No-op.
      }
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertReplacementText",
          data: text,
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  // Insert `text` over `range` in a contenteditable host. Returns true on
  // success. Restore is intentionally not supported for rich text: editors
  // with their own selection model can ignore a programmatic selection and
  // append instead of replacing, which is what made the old undo corrupt text.
  function insertIntoRichText(host, range, text) {
    if (!range || !range.startContainer || !range.startContainer.isConnected) {
      return false;
    }
    try {
      host.focus({ preventScroll: true });
    } catch (error) {
      // No-op.
    }
    const selection = window.getSelection();
    if (!selection) return false;
    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      return false;
    }

    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (error) {
      ok = false;
    }
    if (ok) return true;

    try {
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        host.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertReplacementText",
            data: text,
          })
        );
      } catch (error) {
        // No-op.
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // Write a tool result over the captured selection. Returns an undo handle on
  // success, or `null` when the source is gone or no longer matches.
  function applyResultToSource(source, text) {
    const value = String(text || "");
    if (!isSourceUsable(source) || !value) return null;

    if (source.kind === "field") {
      const field = source.element;
      const current = typeof field.value === "string" ? field.value : "";
      let start = source.start;
      let end = source.end;
      if (current.slice(start, end) !== source.raw) {
        const found = current.indexOf(source.raw);
        if (found < 0) return null;
        start = found;
        end = found + source.raw.length;
      }
      if (!insertIntoField(field, start, end, value)) return null;
      return {
        kind: "field",
        element: field,
        originalRaw: source.raw,
        start,
        insertedText: value,
      };
    }

    if (source.kind === "richtext") {
      if (!insertIntoRichText(source.element, source.range, value)) return null;
      return {
        kind: "richtext",
        element: source.element,
        originalRaw: source.raw,
      };
    }

    return null;
  }

  function revertAppliedResult(handle) {
    if (!handle) return false;

    if (handle.kind === "field") {
      const field = handle.element;
      if (!field || !field.isConnected) return false;
      const current = typeof field.value === "string" ? field.value : "";
      const start = handle.start;
      const end = start + handle.insertedText.length;
      if (current.slice(start, end) !== handle.insertedText) return false;
      return insertIntoField(field, start, end, handle.originalRaw);
    }

    // Restore is only reliable for plain input/textarea fields. A rich text
    // editor can ignore a programmatic selection and insert at its own caret.
    return false;
  }

  function createReplaceIconButton(getText, getSource) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-tuxai-replace", "1");
    button.title = t("popup.replace", "Replace original");
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      background: "#1e293b",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "8px",
      cursor: "pointer",
      boxSizing: "border-box",
    });
    button.innerHTML = REPLACE_ICONS.replace;

    let handle = null;
    let timer = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const showIdle = () => {
      button.disabled = false;
      button.style.cursor = "pointer";
      button.style.background = "#1e293b";
      button.style.borderColor = "#334155";
      button.style.color = "#e2e8f0";
      button.innerHTML = REPLACE_ICONS.replace;
      button.title = t("popup.replace", "Replace original");
    };

    const showUndo = () => {
      button.style.background = "#0f766e";
      button.style.borderColor = "#0f766e";
      button.style.color = "#ffffff";
      button.innerHTML = REPLACE_ICONS.undo;
      button.title = t("popup.undoReplace", "Restore original");
    };

    const showSuccess = (titleKey, fallback) => {
      button.style.background = "#0f766e";
      button.style.borderColor = "#0f766e";
      button.style.color = "#ffffff";
      button.innerHTML = REPLACE_ICONS.replaced;
      button.title = t(titleKey, fallback);
    };

    const showFailure = (titleKey, fallback) => {
      button.style.background = "#7f1d1d";
      button.style.borderColor = "#7f1d1d";
      button.style.color = "#ffffff";
      button.innerHTML = REPLACE_ICONS.failed;
      button.title = t(titleKey, fallback);
      clearTimer();
      timer = setTimeout(() => {
        if (handle) showUndo();
        else showIdle();
      }, 1400);
    };

    // Once the (unrestorable) rich-text source has been applied, the action is
    // spent: show it greyed out instead of letting it write a second time.
    const showDisabled = () => {
      button.disabled = true;
      button.style.background = "#1e293b";
      button.style.borderColor = "#334155";
      button.style.color = "#475569";
      button.style.cursor = "default";
      button.innerHTML = REPLACE_ICONS.replace;
      button.title = t("popup.alreadyReplaced", "Already replaced");
    };

    button.addEventListener("click", (event) => {
      // Do not let the parent bubble toggle when the replace button is clicked.
      event.stopPropagation();
      clearTimer();

      if (handle) {
        const reverted = revertAppliedResult(handle);
        handle = null;
        if (reverted) {
          popupSourceReplaced = false;
          showSuccess("popup.restored", "Restored");
          timer = setTimeout(showIdle, 1400);
        } else {
          showFailure("popup.restoreFailed", "Restore failed");
        }
        return;
      }

      const applied = applyResultToSource(getSource(), getText());
      if (!applied) {
        showFailure("popup.replaceFailed", "Replace failed");
        return;
      }

      popupSourceReplaced = true;

      if (applied.kind === "field") {
        handle = applied;
        showSuccess("popup.replaced", "Replaced!");
        timer = setTimeout(showUndo, 700);
      } else {
        // Restore is only reliable for input/textarea sources. Rich text shows
        // the plain "replaced" state and then goes inactive, so the stale
        // source is never applied a second time.
        showSuccess("popup.replaced", "Replaced!");
        timer = setTimeout(showDisabled, 1400);
      }
    });

    return button;
  }

  function createCopyIconButton(getText) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-tuxai-copy", "1");
    button.title = t("msg.copy", "Copy");
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      background: "#1e293b",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "8px",
      cursor: "pointer",
      boxSizing: "border-box",
    });
    button.innerHTML = COPY_ICONS.copy;

    let resetTimer = null;
    const reset = () => {
      resetTimer = null;
      button.style.background = "#1e293b";
      button.style.borderColor = "#334155";
      button.style.color = "#e2e8f0";
      button.innerHTML = COPY_ICONS.copy;
      button.title = t("msg.copy", "Copy");
    };

    button.addEventListener("click", async (event) => {
      // Do not let the parent bubble toggle when the copy button is clicked.
      event.stopPropagation();
      const ok = await copyTextToClipboard(getText());
      if (resetTimer) clearTimeout(resetTimer);
      if (ok) {
        button.style.background = "#0f766e";
        button.style.borderColor = "#0f766e";
        button.style.color = "#ffffff";
        button.innerHTML = COPY_ICONS.copied;
        button.title = t("msg.copied", "Copied!");
      } else {
        button.style.background = "#7f1d1d";
        button.style.borderColor = "#7f1d1d";
        button.style.color = "#ffffff";
        button.title = t("msg.copyFailed", "Copy failed");
      }
      resetTimer = setTimeout(reset, 1400);
    });

    return button;
  }

  // A right-aligned action strip that lives *inside* a text bubble: the copy
  // button on the left, the speaker on the right.
  function createBubbleActionRow(children) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginTop: "0",
      justifyContent: "flex-end",
    });
    for (const child of children) row.appendChild(child);
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
    startSpeakPulse(button);

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
      stopSpeakPulse();
      setTimeout(() => {
        if (popupSpeakButton === button) return;
        speakButtonIdle(button);
      }, 1800);
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createPopup(x, y, titleText, anchorRect) {
    closePopup();
    popupAnchorRect = anchorRect || null;
    popupAutoPosition = true;

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

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "8px",
    });

    popupTitle = document.createElement("div");
    popupTitle.textContent = titleText;
    popupTitle.title = "Drag to move";
    Object.assign(popupTitle.style, {
      flex: "1 1 auto",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.4px",
      color: "#5eead4",
      textTransform: "uppercase",
      cursor: "move",
    });
    popupTitle.addEventListener("mousedown", popupDragStart);
    header.appendChild(popupTitle);

    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.setAttribute("data-tuxai-pin", "1");
    Object.assign(pinButton.style, {
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      height: "22px",
      padding: "0",
      border: "1px solid transparent",
      borderRadius: "6px",
      background: "transparent",
      color: "#94a3b8",
      cursor: "pointer",
      lineHeight: "0",
    });
    const updatePinButton = () => {
      pinButton.innerHTML = popupPinned
        ? PIN_ICONS.pinned
        : PIN_ICONS.unpinned;
      pinButton.title = popupPinned
        ? t("popup.unpin", "Unpin")
        : t("popup.pin", "Pin");
      pinButton.style.color = popupPinned ? "#5eead4" : "#94a3b8";
      pinButton.style.borderColor = popupPinned ? "#14b8a6" : "transparent";
      pinButton.style.background = popupPinned
        ? "rgba(20, 184, 166, 0.15)"
        : "transparent";
    };
    pinButton.addEventListener("mousedown", (event) => {
      // Never start a drag while toggling the pin.
      event.stopPropagation();
    });
    pinButton.addEventListener("click", (event) => {
      event.stopPropagation();
      popupPinned = !popupPinned;
      updatePinButton();
    });
    updatePinButton();
    header.appendChild(pinButton);

    el.appendChild(header);

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
    clampPopupToViewport();
  }

  // Keep the popup off the selected text: prefer the space below the selection,
  // flip above when there is not enough room, and align to the selection's left
  // edge. After a manual drag (`popupAutoPosition === false`) it only clamps.
  function clampPopupToViewport() {
    if (!popupEl) return;
    const rect = popupEl.getBoundingClientRect();
    const margin = 4;
    const gap = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    let left;
    let top;
    if (popupAutoPosition && popupAnchorRect) {
      const anchor = popupAnchorRect;
      left = anchor.left;
      const spaceBelow = window.innerHeight - anchor.bottom;
      if (spaceBelow >= rect.height + gap || spaceBelow >= anchor.top) {
        top = anchor.bottom + gap;
      } else {
        top = anchor.top - rect.height - gap;
      }
    } else {
      left = rect.left;
      top = rect.top;
    }

    popupEl.style.left = `${clamp(left, margin, maxLeft)}px`;
    popupEl.style.top = `${clamp(top, margin, maxTop)}px`;
  }

  function popupDragStart(event) {
    if (!popupEl || event.button !== 0) return;
    popupAutoPosition = false;
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

  function renderToolList(tools, text, source) {
    popupToolList = tools;
    popupSelectedText = text;
    if (source) {
      popupSelectionSource = source;
      popupSourceReplaced = false;
    }
    popupTitle.textContent = t("popup.pickTool", "Pick a tool");
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

      const speakRow = createBubbleActionRow([
        hint,
        createCopyIconButton(() => popupSelectedText),
        createSpeakIconButton(() => popupSelectedText),
      ]);
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

  function showToolPicker(tools, x, y, text, source, anchorRect) {
    createPopup(x, y, t("popup.pickTool", "Pick a tool"), anchorRect);
    renderToolList(tools, text, source);
  }

  function renderPopupActionRow() {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "6px",
      marginTop: "10px",
    });

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
    popupTitle.textContent = titleText || t("popup.result", "Result");
    popupContent.innerHTML = "";

    const result = document.createElement("div");
    Object.assign(result.style, {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      background: "#111827",
      border: "1px solid #ffffff",
      borderRadius: "8px",
      padding: "10px",
      userSelect: "text",
      WebkitUserSelect: "text",
    });

    // The text scrolls on its own so the copy/speaker strip stays parked in the
    // bottom-right corner of the bubble no matter how long the reply is.
    const resultText = document.createElement("div");
    resultText.textContent = popupResultText;
    Object.assign(resultText.style, {
      maxHeight: "280px",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      color: "#ffffff",
      cursor: "text",
    });
    result.appendChild(resultText);
    // Replace is offered only on a successful tool result whose selection came
    // from an editable target that is still present in the page.
    const actions = [];
    if (!popupSourceReplaced && isSourceUsable(popupSelectionSource)) {
      actions.push(
        createReplaceIconButton(
          () => popupResultText,
          () => popupSelectionSource
        )
      );
    }
    actions.push(createCopyIconButton(() => popupResultText));
    actions.push(createSpeakIconButton(() => popupResultText));
    result.appendChild(createBubbleActionRow(actions));
    popupContent.appendChild(result);
    popupContent.appendChild(renderPopupActionRow());
    clampPopupToViewport();
  }

  function showPopupError(error, titleText) {
    stopPopupSpeech();
    popupResultText = "";
    popupTitle.textContent = titleText || t("popup.error", "Error");
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
    popupTitle.textContent = titleText || t("popup.working", "Working...");
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
    const toolTitle = toolName;

    showPopupLoading(t("popup.working", "Running..."), toolTitle);

    try {
      const response = await api.runtime.sendMessage({
        type: "penguin_popup_run_tool",
        toolId,
        text,
      });

      if (response && response.ok) {
        const model = response.model || "";
        showPopupResult(
          response.text,
          model ? `${toolTitle} · ${model}` : toolTitle
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

  function showQuickPopup(x, y, text, source, anchorRect) {
    try {
      api.runtime
        .sendMessage({ type: "penguin_get_tools" })
        .then((tools) => {
          if (!tools || !tools.length) {
            createPopup(x, y, t("popup.error", "Error"), anchorRect);
            showPopupError(t("popup.noTools", "No tools available."));
            return;
          }
          showToolPicker(tools, x, y, text, source, anchorRect);
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
      if (popupEl && !popupEl.contains(event.target)) closePopupIfUnpinned();
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
      // A pinned popup ignores every click outside of itself so it stays put
      // until the user explicitly closes it.
      if (popupPinned && popupEl) return;
      if (popupEl && !matchesShortcut(event, shortcutMode)) {
        closePopupIfUnpinned();
      }

      const targetEl = resolveEventTarget(event);
      const text = getSelectionText(targetEl);

      if (!text) {
        closePopupIfUnpinned();
        clearSidebarSelection();
      } else if (matchesShortcut(event, shortcutMode)) {
        if (popupEl) return;
        const source = captureSelectionSource(targetEl);
        showQuickPopup(
          event.clientX,
          event.clientY,
          text,
          source,
          captureSelectionRect(targetEl, source)
        );
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
      if (event.key === "Escape") closePopupIfUnpinned();
    },
    true
  );

  window.addEventListener("blur", closePopupIfUnpinned);

  initShortcutSettings();
  initLanguage();
})();
