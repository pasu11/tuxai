// Tiny dependency-free Markdown renderer used only to make chat output readable.
// It intentionally supports a small subset: code blocks, inline code, bold,
// italic, links, headings, bullet lists, and paragraphs.

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

  for (const rawLine of lines) {
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
