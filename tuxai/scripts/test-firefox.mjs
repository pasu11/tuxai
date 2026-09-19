// Firefox smoke test for the TuxAI sidebar and page popup.
//
// Serves the repo over HTTP, drives it with Playwright's Firefox and checks
// that the UI boots, i18n loads and the TTS settings populate. Run with:
//
//   npm run test:firefox
//
// Requires Playwright + Firefox:  playwright install firefox
// Env: FIREFOX_PORT (default 8791), FIREFOX_HEADED=1 (not recommended here).

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.FIREFOX_PORT || 8791);

// Browsers live in ~/.local/share (persistent), not ~/.cache (disposable). The
// `pw` helper sets this fallback too; non-interactive shells don't source
// ~/.bashrc, so do it here as well. An explicit env var still wins.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const fallback = path.join(
    process.env.HOME || "",
    ".local",
    "share",
    "ms-playwright"
  );
  if (fs.existsSync(fallback)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = fallback;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const tried = [
    "playwright",
    path.join(process.env.HOME || "", ".local", "lib", "node_modules", "playwright"),
    "/usr/lib/node_modules/playwright",
    "/usr/local/lib/node_modules/playwright",
  ];
  for (const candidate of tried) {
    try {
      return require(candidate);
    } catch (error) {
      // try next
    }
  }
  throw new Error(
    "Playwright not found. Install it and Firefox:\n" +
      "  npm i -g playwright && playwright install firefox"
  );
}

// Injected before page scripts: a minimal chrome/browser stub.
const SIDEBAR_STUB = `
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + String((e.reason && e.reason.message) || e.reason)));
(function () {
  try { localStorage.setItem("penguin_mode", "cloud"); } catch (e) {}
  const store = {
    penguin_mode: "cloud",
    cloud_provider: "openai",
    cloud_api_url_openai: location.origin,
    cloud_api_key_openai: "test-key",
    cloud_model_openai: "gpt-4o-mini",
  };
  window.__store = store;
  window.chrome = {
    __store: store,
    storage: {
      local: {
        get(keys) {
          if (keys == null) return Promise.resolve(Object.assign({}, store));
          const arr = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const key of arr) if (key in store) out[key] = store[key];
          return Promise.resolve(out);
        },
        set(obj) { Object.assign(store, obj); return Promise.resolve(); },
        remove(keys) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const key of arr) delete store[key];
          return Promise.resolve();
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      onMessage: { addListener() {} },
      sendMessage() { return Promise.resolve({}); },
    },
  };
})();
`;

function qsPage(audioB64) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>qs test</title>
<script>
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + String((e.reason && e.reason.message) || e.reason)));
const calls = [];
window.__calls = calls;
window.chrome = {
  storage: {
    local: { get: async () => ({ penguin_language: "en" }), set: async () => {}, remove: async () => {} },
    onChanged: { addListener() {} },
  },
  runtime: {
    onMessage: { addListener() {} },
    sendMessage(msg) {
      calls.push({ type: msg.type, text: msg.text || "" });
      if (msg.type === "penguin_get_tools") {
        return Promise.resolve([{ id: "translate", name: "Translate" }]);
      }
      if (msg.type === "penguin_popup_run_tool") {
        return Promise.resolve({ ok: true, text: "Result text", label: "Translate" });
      }
      if (msg.type === "penguin_popup_speak") {
        return Promise.resolve({ ok: true, audio: "data:audio/wav;base64,${audioB64}" });
      }
      return Promise.resolve({});
    },
  },
};
</script></head>
<body><p id="p">Hello plain selection</p>
<script src="/lib/i18n.js"></script>
<script src="/content/quickselect.js"></script>
</body></html>`;
}

function silentWav() {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * 2);
  const dataSize = numSamples;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) buffer[44 + i] = 128;
  return buffer;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/__qs_test.html") {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(qsPage(silentWav().toString("base64")));
      return;
    }
    if (pathname === "/__silent.wav") {
      const wav = silentWav();
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length });
      res.end(wav);
      return;
    }

    const filePath = path.join(ROOT, decodeURIComponent(pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    } catch (error) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

async function main() {
  const { firefox } = loadPlaywright();
  const server = await startServer();
  const browser = await firefox.launch({ headless: !process.env.FIREFOX_HEADED });
  const base = `http://127.0.0.1:${PORT}`;

  try {
    // ---- sidebar ----
    const ctx = await browser.newContext();
    await ctx.addInitScript(SIDEBAR_STUB);
    const page = await ctx.newPage();
    await page.goto(`${base}/sidebar/sidebar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#message-input", { timeout: 15000 });
    await page.waitForTimeout(1200);

    const sidebar = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll(".settings-tab")].map((b) => b.textContent);
      return {
        tabs,
        i18n: typeof (globalThis.TuxAIi18n || window.TuxAIi18n),
        providerOptions: [...document.getElementById("tts-provider").options].map((o) => o.textContent),
        voiceCount: document.getElementById("tts-voice").options.length,
        errors: window.__errors || [],
      };
    });

    check("sidebar: settings tabs rendered", sidebar.tabs.length === 6, sidebar.tabs.join(" / "));
    check("sidebar: i18n module loaded", sidebar.i18n === "object", sidebar.i18n);
    check(
      "sidebar: TTS providers populated",
      sidebar.providerOptions.length >= 2,
      sidebar.providerOptions.join(", ")
    );
    check("sidebar: voices loaded", sidebar.voiceCount >= 9, `count=${sidebar.voiceCount}`);
    check("sidebar: no JS errors", sidebar.errors.length === 0, sidebar.errors.join(" | "));
    await ctx.close();

    // ---- page popup ----
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/__qs_test.html`, { waitUntil: "domcontentloaded" });
    await page2.waitForSelector("#p");
    await page2.waitForTimeout(300);

    await page2.evaluate(() => {
      const p = document.getElementById("p");
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const rect = p.getBoundingClientRect();
      p.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          altKey: true,
          clientX: rect.left + 5,
          clientY: rect.bottom,
        })
      );
    });
    await page2.waitForTimeout(900);

    const popup = await page2.evaluate(() => {
      const el = document.querySelector('[data-tuxai-quick="1"]');
      if (!el) return { exists: false, errors: window.__errors || [] };
      return {
        exists: true,
        title: el.querySelector("div") ? el.querySelector("div").textContent : "",
        hasSpeak: !!el.querySelector('[data-tuxai-speak="1"]'),
        hasCopy: !!el.querySelector('[data-tuxai-copy="1"]'),
        errors: window.__errors || [],
      };
    });

    check("popup: appears on Alt+select", popup.exists, popup.title || "");
    check("popup: speaker button present", !!popup.hasSpeak);
    check("popup: copy button present", !!popup.hasCopy);
    check("popup: no JS errors", (popup.errors || []).length === 0, (popup.errors || []).join(" | "));

    if (popup.exists && popup.hasSpeak) {
      await page2.click('[data-tuxai-speak="1"]');
      await page2.waitForTimeout(900);
      const speaking = await page2.evaluate(() => {
        const b = document.querySelector('[data-tuxai-speak="1"]');
        const anims = b && b.getAnimations ? b.getAnimations() : [];
        return {
          title: b ? b.title : "",
          animated: anims.length > 0,
          calls: window.__calls || [],
          errors: window.__errors || [],
        };
      });
      check(
        "popup: speaker starts playback",
        /stop/i.test(speaking.title || ""),
        speaking.title || ""
      );
      check(
        "popup: speaker pulses while speaking",
        !!speaking.animated,
        `animations=${speaking.animated}`
      );
      check(
        "popup: speak message sent",
        (speaking.calls || []).some((c) => c.type === "penguin_popup_speak"),
        JSON.stringify(speaking.calls || [])
      );
      check(
        "popup: no errors during playback",
        (speaking.errors || []).length === 0,
        (speaking.errors || []).join(" | ")
      );

      // Run a tool and verify the result bubble keeps the copy/speaker strip
      // inside it and that Back is placed to the left of Close.
      await page2.click(
        '[data-tuxai-quick="1"] button:not([data-tuxai-speak]):not([data-tuxai-copy])'
      );
      await page2.waitForTimeout(700);
      const result = await page2.evaluate(() => {
        const el = document.querySelector('[data-tuxai-quick="1"]');
        if (!el) return { exists: false };
        const labels = [...el.querySelectorAll("button")].map((b) =>
          (b.textContent || "").trim()
        );
        return {
          exists: true,
          hasCopy: !!el.querySelector('[data-tuxai-copy="1"]'),
          hasSpeak: !!el.querySelector('[data-tuxai-speak="1"]'),
          backIndex: labels.indexOf("Back"),
          closeIndex: labels.indexOf("Close"),
          errors: window.__errors || [],
        };
      });
      check(
        "popup: result keeps copy + speaker inside bubble",
        result.exists && result.hasCopy && result.hasSpeak
      );
      check(
        "popup: Back is left of Close",
        result.backIndex >= 0 &&
          result.closeIndex >= 0 &&
          result.backIndex < result.closeIndex,
        `back=${result.backIndex} close=${result.closeIndex}`
      );
      check(
        "popup: no errors after running a tool",
        (result.errors || []).length === 0,
        (result.errors || []).join(" | ")
      );
    }
    await ctx2.close();
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("test:firefox failed:", error && error.message ? error.message : error);
  process.exit(1);
});
