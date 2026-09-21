# TuxAI

TuxAI is an open-source AI assistant browser extension for Chrome, Vivaldi, and Firefox.

It provides:

- A sidebar chat interface with streaming responses, Markdown rendering, and collapsible reasoning output
- Local LLM server support (Ollama, kobold.cpp, llama.cpp, or any OpenAI-compatible server)
- Cloud API support (DeepSeek, OpenAI, Anthropic Claude, Google Gemini, Mistral, Cohere, plus custom OpenAI-compatible providers)
- Plain text selection that automatically sends selected text to the sidebar
- A configurable quick-select shortcut that opens a floating popup with tool buttons
- Right-click context menu for running tools on selected text
- Reusable tools (system-prompt presets) with built-in defaults and full create/edit/delete support
- Text-to-speech (read assistant replies aloud, in the sidebar or the page popup)
- Chat history (previous sessions are saved locally and can be reopened or deleted)
- File and image attachments
- Backup/restore of all settings (including API keys, models, tools, and chat history) as a JSON file
- Bilingual UI (English / 中文)
- Light/dark theme, adjustable text size, interface scale, and context size

## Requirements

- Chrome, Chromium, Vivaldi, Edge, or another Chromium browser
- Firefox 140+ (for the Firefox build; required for Firefox's built-in data-collection consent)
- For local-server mode: a running LLM server such as Ollama, kobold.cpp, llama.cpp, or another OpenAI-compatible server
- For cloud mode: an API key for one of the supported providers or another OpenAI-compatible cloud endpoint
- For text-to-speech: an OpenAI-compatible speech endpoint (for example OpenAI with `gpt-4o-mini-tts`)

## Install

### Chrome / Vivaldi / Chromium

#### Option A: Load the built folder

1. Open `dist/chrome` from this project.
2. Open the extension page:
   - Chrome: `chrome://extensions`
   - Vivaldi: `vivaldi://extensions`
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `dist/chrome` folder.

#### Option B: Load the source folder directly

The project root itself is also a valid Chrome/Vivaldi MV3 extension:

1. Open the extension page.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project root folder:
   ```
   /path/to/tuxai
   ```

### Firefox

1. Open `dist/firefox` after building (or use the included build output).
2. In Firefox open:
   ```
   about:debugging#/runtime/this-firefox
   ```
3. Click **Load Temporary Add-on**.
4. Select `dist/firefox/manifest.json`.

To create a permanent installable `.xpi`, you can package the `dist/firefox` folder with `web-ext`:

```bash
cd dist/firefox
web-ext build
```

You can also build an installable `.crx` / `.xpi` in one step from the repo:

```bash
npm run package
```

This writes `dist/tuxai.crx` and `dist/tuxai.xpi`.

#### Live-reload while developing

[`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
loads the extension as a temporary add-on (no signing needed) and reloads it
whenever the built files change. The repo ships a helper:

```bash
npm run dev:firefox              # opens Firefox, loads dist/firefox
HEADLESS=1 npm run dev:firefox   # no window
URL=https://example.com npm run dev:firefox
```

It prefers Playwright's Firefox when present, otherwise the `firefox` on your
`PATH`. To use a specific binary:

```bash
FIREFOX=/path/to/firefox npm run dev:firefox
```

If `web-ext` is missing:

```bash
npm install -g --prefix "$HOME/.local" web-ext
```

> Note: Playwright's Firefox **cannot** sideload unsigned extensions (its
> signature requirement is compiled in), so `web-ext run` is the reliable way
> to load the real extension. For automated UI checks of the sidebar/popup in
> Firefox you can serve the `*_harness.html` pages and drive them with
> Playwright's Firefox (`playwright install firefox`).

#### Firefox smoke test

The repo includes a Playwright-Firefox smoke test for the sidebar and the page
popup:

```bash
npm run test:firefox
```

It serves the source over HTTP with a stubbed browser API, checks that the
sidebar boots (tabs, i18n, TTS providers/voices) and that the Alt+select popup
appears with a speaker button, and fails on any page JS error. Use
`FIREFOX_PORT=9000` to change the port, or `FIREFOX_HEADED=1` to watch it run
(needs a display).

#### Persistent Playwright Firefox profile

`pwff` (the Firefox variant of `pw`) supports a persistent profile so storage
and logins survive between runs:

```bash
pwff eval "https://example.com" '() => document.cookie' --profile /tmp/ffprof
PW_PROFILE=/tmp/ffprof pwff shot "https://example.com" /tmp/x.png
```

## Build from source

```bash
# Build both Chrome and Firefox packages
node scripts/build.mjs

# Build only Chrome/Vivaldi
node scripts/build.mjs --chrome

# Build only Firefox
node scripts/build.mjs --firefox
```

The generated packages are written to:

```
dist/chrome/
dist/firefox/
```

Or use npm:

```bash
npm run build
npm run build:chrome
npm run build:firefox
```

## Usage

Open the TuxAI sidebar, then click the settings (gear) icon in the header. Settings are organized into six tabs: **Cloud Server**, **Local Server**, **UI**, **Sound**, **Tools**, and **Misc**.

### 1. Choose a connection

#### Local Server mode

1. Open the **Local Server** tab.
2. Choose a backend:
   - **Ollama**
   - **kobold.cpp**
   - **llama.cpp**
   - **Other** (OpenAI-compatible server)
3. Enter the endpoint URL, or use the default shown for the selected backend.
4. Click **Fetch** to load available models, or add a custom model with the **+** button.
5. Enable/disable models in the model manager; the selected model appears in the composer dropdown.

#### Cloud API mode

1. Open the **Cloud Server** tab.
2. Select a provider:
   - **DeepSeek**
   - **OpenAI**
   - **Anthropic Claude**
   - **Google Gemini**
   - **Mistral**
   - **Cohere**
   - Any custom provider you add with the **+** button (name + OpenAI-compatible URL)
3. Enter the API URL and API key.
4. Fetch the model list or add models manually.
5. Pick the model from the composer dropdown.

API keys are stored only in the extension's local browser storage. Each provider keeps its own URL, key, and model selection.

### 2. Chat normally

- Type a message in the sidebar and press **Enter** (or click send). Use **Shift+Enter** for a new line.
- The input box grows to show at least three lines.
- Attach images, text/code files, or documents (DOCX, XLSX, PPTX, ODT, ODS, ODP) with the **attach** (paperclip) button. The file picker offers a **Supported File Types** filter plus the browser's **All Files** option so you can still pick anything; text is extracted in the browser before sending. Supported types are detected by MIME type, extension, or content for unknown text files.
- Responses stream in; Markdown is rendered live, and reasoning output is shown in a collapsible box when the model provides it.
- While a reply streams, the chat auto-scrolls until the top of the reply (model label included) is pinned at the top of the view. It then stops so you can read from the beginning; click the floating **↓** button to jump to the newest text and follow the rest of the stream. Scrolling up pauses auto-scroll.
- Click the copy icon under any message to copy its full text.
- Click the speaker icon under an assistant message to read it aloud (see [Text-to-speech](#7-text-to-speech)).
- Use the **+** button to start a new chat, and the **history** button to toggle the previous-sessions panel (click it again, press **Back**, or press **Esc** to return to the chat). Chat sessions are saved in local browser storage.

### 3. Send selected text to the sidebar

1. Select any text on a webpage normally, without holding a modifier key.
2. The selected text is delivered to the TuxAI sidebar (open the sidebar if it is not already open).
3. The selected text appears in the **"From your selected text"** card.
4. Click one of the tool buttons to run an action on that text, or type a follow-up question.

### 4. Use the floating quick popup

By default, holding **Alt** while selecting text opens a small popup:

1. Select text while holding **Alt** (or another configured shortcut).
2. The TuxAI popup appears.
3. Click a tool, for example **translate** or **summarize**.
4. The result is shown directly in the popup. The popup can be dragged by its title bar, and the result can be selected and copied.

You can change the shortcut (Alt, Ctrl, Shift, and combinations) or disable the popup under:

```
Settings → UI → Popup shortcut
```

### 5. Use the right-click menu

1. Select text on a page.
2. Right-click it.
3. Choose **TuxAI**.
4. Select a tool.

The selected text is sent to the sidebar and the tool runs there.

### 6. Manage tools

Open:

```
Settings → Tools
```

- Create new tools with a name and system prompt.
- Edit existing tools.
- Delete tools.
- Reset to the default tools:
  - **translate** → `translate to english`
  - **summarize** → `summarize`
  - **fix grammar** → correct grammar, spelling, punctuation, and word usage without rewriting
  - **improve sentences** → improve clarity, flow, and naturalness without changing the meaning

Tools are applied to selected text through the selection panel, the floating quick popup, and the right-click menu.

### 7. Text-to-speech

Open:

```
Settings → Sound
```

- Choose a **TTS provider**. It is independent of the chat provider, so you can chat with one provider and speak with another. Leave it as **Same as chat provider** to reuse the chat connection, or pick a cloud provider (for example OpenAI) to reuse that provider's stored key.
- Enter a **TTS model** and click **Use** to load its voices. If the model does not support text-to-speech, the Voice field shows **TTS not supported**.
- The **TTS API URL** and **TTS API key** fields are optional overrides.
- Pick a **Voice** and click **Test** to preview it.
- Click the speaker icon under an assistant message, or the speaker button in the quick popup, to read the text aloud. Click it again to stop.

For example, chat with DeepSeek while speaking with OpenAI: set the TTS provider to **OpenAI**, the TTS model to `gpt-4o-mini-tts`, and choose a voice.

### 8. UI settings

Open:

```
Settings → UI
```

- **Theme**: use the theme button in the top-right corner to switch between light and dark mode.
- **Text size (px)**: default `14px`, range `10–24px`.
- **Context size**: history trimming budget (`4096`, `8192`, `16384`, `32768`).
- **Interface size**: scales the whole sidebar (80%–150%, default 100%).
- **Language**: Auto (follow browser), English, or 中文. Applies to the sidebar and the page popup.
- **Popup shortcut**: the modifier used to open the floating quick popup.

### 9. Backup and restore

Open:

```
Settings → Misc
```

- **Export settings backup** saves all settings — including API keys, models, tools, theme, selected-text preferences, and chat history — to a JSON file.
- **Import settings backup** restores a previously exported file and reloads the sidebar.

## Project structure

```
background.js              # Background service worker / event page
content/quickselect.js     # Page selection + quick popup behavior
sidebar/sidebar.html       # Sidebar UI
sidebar/sidebar.css        # Sidebar styles
sidebar/sidebar.js         # Sidebar logic
lib/tools.js               # Shared tool definitions and storage helpers
lib/i18n.js                # English/Chinese UI strings
lib/markdown.js            # Small Markdown renderer
manifest.json              # Chrome/Vivaldi manifest
manifest.firefox.json      # Firefox manifest template
scripts/build.mjs          # Build script
scripts/package.mjs        # CRX/XPI packaging
scripts/run-firefox.sh     # web-ext live-reload helper
scripts/test-firefox.mjs   # Playwright-Firefox smoke test
Documents/                 # Bilingual developer/user documentation (ODT + Markdown)
dist/chrome                # Generated Chrome/Vivaldi package
dist/firefox               # Generated Firefox package
```

## Privacy

> **Important:** These privacy statements apply when you use TuxAI with **your own local server**. They **do not apply when you use cloud services** such as OpenAI or DeepSeek. If you connect to a cloud provider, your data is sent to that provider and their terms/privacy policy apply.

TuxAI has no central server and does not track, store telemetry, or use analytics.

See the full [PRIVACY.md](PRIVACY.md) for details.

- Local-server requests go directly to the LLM server you configure.
- Cloud requests go directly from your browser to the cloud provider you select.
- API keys are stored only in the extension's local browser storage.
- Chat sessions, settings, and attachments are stored in the extension's local browser storage, not in the cloud.

## Credits

This add-on was created with the help of **DeepSeek DeepCode** (AI-assisted development).

TuxAI is an independent open-source project.

## License

TuxAI is released into the public domain under **The Unlicense**.

You can use, modify, distribute, sell, or embed it for any purpose,
commercial or non-commercial, without limitation.

See the [LICENSE](LICENSE) file for details.
