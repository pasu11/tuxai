// TuxAI - page selection content script.
// - Plain text selection automatically sends the selection to the side panel.
// - The configured shortcut (Alt+select etc.) shows the quick tool popup.
//   Tool clicks are handled here and the result is shown directly in the popup.

(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

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
    popupDrag = null;
    if (popupEl && popupEl.parentNode) {
      popupEl.parentNode.removeChild(popupEl);
    }
    popupEl = null;
    popupContent = null;
    popupTitle = null;
    popupToolList = [];
    popupSelectedText = "";
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
      background: "#0f172a",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "12px",
      boxShadow: "0 10px 28px rgba(2, 6, 23, 0.45)",
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
    popupTitle.textContent = "TuxAI · pick a tool";
    popupContent.innerHTML = "";

    if (!tools.length) {
      popupContent.textContent = "No tools available.";
      return;
    }

    for (const tool of tools) {
      const item = document.createElement("div");
      item.textContent = tool.name;
      Object.assign(item.style, {
        padding: "8px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: "#f1f5f9",
      });
      item.addEventListener("mouseenter", () => {
        item.style.background = "#1e293b";
        item.style.color = "#5eead4";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
        item.style.color = "#f1f5f9";
      });
      item.addEventListener("click", () => {
        runToolInPopup(tool.id);
      });
      popupContent.appendChild(item);
    }

    clampPopupToViewport();
  }

  function showToolPicker(tools, x, y, text) {
    createPopup(x, y, "TuxAI · pick a tool");
    renderToolList(tools, text);
  }

  function renderPopupActionRow() {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "6px",
      marginTop: "10px",
    });

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.textContent = "Back";
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
    closeButton.textContent = "Close";
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
    popupTitle.textContent = titleText || "TuxAI · result";
    popupContent.innerHTML = "";

    const result = document.createElement("div");
    result.textContent = text;
    Object.assign(result.style, {
      maxHeight: "280px",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      color: "#f1f5f9",
      background: "#0b1220",
      border: "1px solid #1e293b",
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
    popupTitle.textContent = titleText || "TuxAI · error";
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
    popupTitle.textContent = titleText || "TuxAI · working...";
    popupContent.innerHTML = "";
    const loading = document.createElement("div");
    loading.textContent = message || "Processing...";
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

    showPopupLoading("Running...", toolTitle);

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
            createPopup(x, y, "TuxAI · error");
            showPopupError("No tools available.");
            return;
          }
          showToolPicker(tools, x, y, text);
        })
        .catch(() => {});
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
})();
