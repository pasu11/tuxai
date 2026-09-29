// Tiny dependency-free Markdown renderer used only to make chat output readable.
// It intentionally supports a small subset: code blocks, inline code, bold,
// italic, links, headings, GFM tables, bullet lists, and paragraphs.

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(text) {
  let out = escapeHtml(text);

  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return out;
}

function splitTableRow(line) {
  let text = String(line).trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

// A GFM separator row such as "|---|:---:|---|".
function isTableSeparator(line) {
  const text = String(line).trim();
  if (!text.includes("|") || !text.includes("-")) return false;
  const cells = splitTableRow(text);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

function tableAlign(cell) {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

function alignStyle(align) {
  return align ? ` style="text-align:${align}"` : "";
}

function renderTable(header, aligns, rows) {
  const head = header
    .map((cell, index) => `<th${alignStyle(aligns[index])}>${formatInline(cell)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${header
          .map(
            (_, index) =>
              `<td${alignStyle(aligns[index])}>${formatInline(row[index] || "")}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead>${
    body ? `<tbody>${body}</tbody>` : ""
  }</table></div>`;
}

export function renderMarkdown(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let listLines = [];
  let paragraphLines = [];

  const flushList = () => {
    if (!listLines.length) return;
    const items = listLines
      .map((line) => `<li>${formatInline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`)
      .join("");
    html.push(`<ul>${items}</ul>`);
    listLines = [];
  };

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    html.push(`<p>${formatInline(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushAll = () => {
    flushList();
    flushParagraph();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (line.trim().startsWith("```")) {
      if (!inCode) {
        flushAll();
        inCode = true;
        codeLang = line.trim().slice(3).trim();
        codeLines = [];
      } else {
        flushList();
        flushParagraph();
        const language = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
        const code = codeLines
          .map((codeLine) => escapeHtml(codeLine))
          .join("\n");
        html.push(`<pre><code${language}>${code}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      flushParagraph();
      continue;
    }

    if (/^#{1,4}\s/.test(trimmed)) {
      flushAll();
      const level = Math.min(trimmed.match(/^#+/)[0].length, 4);
      const content = trimmed.replace(/^#+\s+/, "");
      html.push(`<h${level}>${formatInline(content)}</h${level}>`);
      continue;
    }

    // GFM table: a header row followed by a "|---|" separator row.
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      flushAll();
      const header = splitTableRow(trimmed);
      const aligns = splitTableRow(lines[i + 1]).map(tableAlign);
      const rows = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j].trim();
        if (!rowLine || !rowLine.includes("|")) break;
        rows.push(splitTableRow(rowLine));
        j += 1;
      }
      html.push(renderTable(header, aligns, rows));
      i = j - 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      listLines.push(line);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  if (inCode) {
    const code = codeLines.map((codeLine) => escapeHtml(codeLine)).join("\n");
    html.push(`<pre><code>${code}</code></pre>`);
  } else {
    flushList();
    flushParagraph();
  }

  return html.join("\n");
}
