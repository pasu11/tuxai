# TuxAI

TuxAI is an open-source AI assistant browser extension for Chrome and Firefox.

It provides:

- A sidebar chat interface
- Local LLM server support (Ollama, kobold.cpp, llama.cpp, or OpenAI-compatible servers)
- Cloud API support (OpenAI, DeepSeek)
- Plain text selection that automatically sends selected text to the sidebar
- Configurable quick-select shortcut that opens a floating popup
- Tool/action buttons that run selected text through AI directly in the popup
- Right-click context menu for running tools on selected text
- Light/dark theme
- Adjustable text size

## Requirements

- Chrome, Firefox, Chromium, Vivaldi, or another Chromium/Firefox based browser
- Firefox 115+ (for the Firefox build)
- For local-server mode: a running LLM server such as Ollama, kobold.cpp, llama.cpp, or another OpenAI-compatible server
- For cloud mode: an API key for OpenAI, DeepSeek, or another OpenAI-compatible cloud endpoint

## Install

### Chrome / Firefox

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

### 1. Choose a connection

Open the TuxAI sidebar and click the settings icon.

#### Local Server mode

1. Choose a backend:
   - **Ollama**
   - **kobold.cpp**
   - **llama.cpp**
   - **Other** (OpenAI-compatible server)
2. Enter the endpoint URL, or use the default shown for the selected backend.
3. Click **Fetch** to load available models, or enter the model name manually.

#### Cloud API mode

1. Choose **Cloud API**.
2. Select a provider:
   - **OpenAI**
   - **DeepSeek**
3. Enter the API key.
4. Fetch the model list or use the preset model list.

### 2. Chat normally

- Type a message in the sidebar and press **Enter** or click the send button.
- Select an **Active tool** under **Settings → Chat options**.
- The active tool provides the system prompt for normal chat.

### 3. Send selected text to the sidebar

1. Select any text on a webpage normally, without holding a modifier key.
2. The sidebar opens automatically.
3. The selected text appears in the **"From your selected text"** card.
4. Click one of the tool buttons to run an action on that text.

### 4. Use the floating quick popup

By default, holding **Alt** while selecting text opens a small popup:

1. Select text while holding **Alt** (or another configured shortcut).
2. The TuxAI popup appears.
3. Click a tool, for example **翻译** or **总结**.
4. The result is shown directly in the popup.

You can change the shortcut or disable the popup under:

```
Settings → Quick select popup
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
Settings → Manage tools
```

- Create new tools with a name and system prompt.
- Edit existing tools.
- Delete tools.
- Reset to the default tools:
  - **翻译** → `翻译成中文`
  - **总结** → `用中文精简总结`

### 7. Theme and text size

- Use the theme button in the top-right corner to switch between light and dark mode.
- Adjust the text size under:
  ```
  Settings → Chat options → Text size (px)
  ```
  The default is `14px`; the accepted range is `10–24px`.

## Project structure

```
background.js              # Background service worker / event page
content/quickselect.js     # Page selection + quick popup behavior
sidebar/sidebar.html       # Sidebar UI
sidebar/sidebar.css        # Sidebar styles
sidebar/sidebar.js         # Sidebar logic
lib/tools.js               # Shared tool definitions and storage helpers
lib/markdown.js            # Small Markdown renderer
manifest.json              # Chrome/Vivaldi manifest
manifest.firefox.json      # Firefox manifest template
scripts/build.mjs          # Build script
dist/chrome                # Generated Chrome/Vivaldi package
dist/firefox               # Generated Firefox package
```

#Screenshots
![alt text]([https://github.com/pasu11/tuxai/main/screenshots/01_70.jpg](https://github.com/pasu11/tuxai/blob/main/screenshots/01_70.jpg?raw=true)


## Privacy

> **Important:** These privacy statements apply when you use TuxAI with **your own local server**. They **do not apply when you use cloud services** such as OpenAI or DeepSeek. If you connect to a cloud provider, your data is sent to that provider and their terms/privacy policy apply.

TuxAI has no central server and does not track, store telemetry, or use analytics.

See the full [PRIVACY.md](PRIVACY.md) for details.

- Local-server requests go directly to the LLM server you configure.
- Cloud requests go directly from your browser to the cloud provider you select.
- API keys are stored only in the extension's local browser storage.
- Chat history is kept in memory only while the sidebar is open.

## Credits

This add-on was created with the help of **DeepSeek DeepCode** (AI-assisted development).

TuxAI is an independent open-source project.

## License

TuxAI is released into the public domain under **The Unlicense**.

You can use, modify, distribute, sell, or embed it for any purpose,
commercial or non-commercial, without limitation.

See the [LICENSE](LICENSE) file for details.
