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
    name: "translate",
    prompt: "translate to english",
  },
  {
    id: "summarize",
    name: "summarize",
    prompt: "summarize",
  },
  {
    id: "grammar",
    name: "fix grammar",
    prompt: "Please correct grammar, spelling, punctuation, and word usage errors in the text, retain the original meaning, and do not rewrite it.",
  },
  {
    id: "polish",
    name: "improve sentences",
    prompt: "Please improve the expression of the text to make it clearer, smoother, and more natural, but do not change the original meaning.",
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
