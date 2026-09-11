// Shared tool-preset model for TuxAI.
// A tool is a reusable system-prompt preset.

const api = typeof browser !== "undefined" ? browser : chrome;

export const DEFAULT_TOOL_ID = "translate";

export const TOOL_STORAGE_KEYS = {
  custom: "penguin_custom_tools",
  overrides: "penguin_tool_overrides",
  deleted: "penguin_tool_deleted",
};

export const BUILTIN_TOOLS = [
  {
    id: "translate",
    name: "翻译",
    prompt: "翻译成中文",
  },
  {
    id: "summarize",
    name: "总结",
    prompt: "用中文精简总结",
  },
  {
    id: "grammar",
    name: "修正语法",
    prompt: "请纠正文本中的语法、拼写、标点和用词错误，保留原意，不要改写。",
  },
  {
    id: "polish",
    name: "优化表达",
    prompt: "请改善文本的表达，使其更清晰、流畅、自然，但不要改变原意。",
  },
];

export async function getToolState() {
  const keys = Object.values(TOOL_STORAGE_KEYS);
  const stored = await api.storage.local.get(keys);
  return {
    customTools: Array.isArray(stored[TOOL_STORAGE_KEYS.custom])
      ? stored[TOOL_STORAGE_KEYS.custom]
      : [],
    overrides:
      stored[TOOL_STORAGE_KEYS.overrides] &&
      typeof stored[TOOL_STORAGE_KEYS.overrides] === "object"
        ? stored[TOOL_STORAGE_KEYS.overrides]
        : {},
    deleted: Array.isArray(stored[TOOL_STORAGE_KEYS.deleted])
      ? stored[TOOL_STORAGE_KEYS.deleted]
      : [],
  };
}

export function isBuiltInTool(id) {
  return BUILTIN_TOOLS.some((tool) => tool.id === id);
}

// Applies deletions + overrides to built-ins, then appends custom tools.
export function effectiveToolsFromState(state) {
  const builtins = [];
  for (const tool of BUILTIN_TOOLS) {
    if (state.deleted.includes(tool.id)) continue;
    builtins.push(state.overrides[tool.id] || tool);
  }
  return builtins.concat(state.customTools);
}

export async function getEffectiveTools() {
  return effectiveToolsFromState(await getToolState());
}
