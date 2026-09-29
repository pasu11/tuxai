// Shared tool-preset model for TuxAI.
// A tool is a reusable system-prompt preset.

const api = typeof browser !== "undefined" ? browser : chrome;

export const DEFAULT_TOOL_ID = "translate";

export const TOOL_STORAGE_KEYS = {
  custom: "penguin_custom_tools",
  overrides: "penguin_tool_overrides",
  deleted: "penguin_tool_deleted",
  order: "penguin_tool_order",
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
    order: Array.isArray(stored[TOOL_STORAGE_KEYS.order])
      ? stored[TOOL_STORAGE_KEYS.order].filter(
          (id) => typeof id === "string"
        )
      : [],
  };
}

export function isBuiltInTool(id) {
  return BUILTIN_TOOLS.some((tool) => tool.id === id);
}

// Applies deletions + overrides to built-ins, then appends custom tools, and
// finally applies the user-defined order. Ids that are not in the order list
// (new tools, tools from an older backup) keep their default relative order and
// go last; ids in the order list that no longer exist are ignored.
export function effectiveToolsFromState(state) {
  const builtins = [];
  for (const tool of BUILTIN_TOOLS) {
    if (state.deleted.includes(tool.id)) continue;
    builtins.push(state.overrides[tool.id] || tool);
  }
  const tools = builtins.concat(state.customTools);
  const order = Array.isArray(state.order) ? state.order : [];
  if (!order.length) return tools;

  const rank = new Map();
  for (const id of order) {
    if (!rank.has(id)) rank.set(id, rank.size);
  }
  if (!rank.size) return tools;

  const unranked = rank.size;
  return tools
    .map((tool, index) => ({
      tool,
      index,
      rank: rank.has(tool.id) ? rank.get(tool.id) : unranked,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.tool);
}

export async function getEffectiveTools() {
  return effectiveToolsFromState(await getToolState());
}

// Returns a new id list with `id` moved by `delta` positions, or null when the
// move is impossible (unknown id, or already at the top/bottom). Kept pure so
// the Tools-tab move buttons have no DOM/storage logic of their own.
export function moveToolId(orderIds, id, delta) {
  const index = orderIds.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= orderIds.length) return null;
  const ids = orderIds.slice();
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}
