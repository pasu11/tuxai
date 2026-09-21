# TuxAI Privacy Notes

TuxAI is designed to be privacy-friendly.

> **Important:** These privacy statements apply when you use TuxAI with **your own local server**.
> They **do not apply when you use cloud services** such as OpenAI or DeepSeek.
> If you connect to a cloud provider, your chat content and selected text are sent to that provider, and that provider's own terms and privacy policy apply.

Short version:

- No tracking
- No analytics
- No telemetry
- No cookies
- No hidden third-party servers
- No advertising
- No remote logging
- No fingerprinting

## What TuxAI does

TuxAI is an AI chat sidebar. It sends chat messages only to the AI endpoint that **you** configure.

There is no TuxAI backend, no DeepSeek/OpenAI middleware, and no central relay. Requests go directly from your browser to the endpoint you choose.

## Data stored locally

TuxAI stores data only in your browser's extension-local storage.

This includes:

- Selected connection mode (Local Server or Cloud API)
- Backend/server type
- Endpoint URLs you enter
- Model names you enter or fetch
- API keys you enter for cloud providers
- Saved tools/presets you create
- UI preferences such as theme, text size, interface size, context size, and language
- Chat sessions (message text) used by the history panel
- Text-to-speech settings (provider, model, voice, and optional URL/key override)
- Temporary delivery data used to send a selected text or context-menu run from a webpage to the sidebar

These values stay in your browser's extension storage. They are not sent anywhere except when a request is needed for the configured AI provider.

## What is removed automatically

Temporary selected-text and pending-run data is removed after the sidebar handles it.

## Chat history

Chat sessions are saved in extension-local storage so the history panel survives restarts. Use the history panel to delete individual sessions, or **Delete all** to clear them. The **Settings → Misc** backup file includes chat history along with the rest of your settings, so keep any exported backup file safe.

## What leaves your browser

Only user-triggered requests:

1. **Model list fetch** — when you click a Fetch button, TuxAI asks your configured server for its model list.
2. **AI chat/action request** — when you send a message or run a tool, TuxAI sends your message/selected text, any attachments, and the tool instruction to the configured AI server.
3. **Text-to-speech request** — when you click a speaker button (or **Test** in the Sound settings), TuxAI sends the text to be spoken to the configured TTS endpoint.

File and image attachments are read in the browser and included only in the request to the configured AI provider. They are not uploaded to any TuxAI server.

If you use a local server such as Ollama, kobold.cpp, or llama.cpp on `localhost`, your data stays on your computer (this includes a local TTS endpoint).

If you use a cloud provider such as OpenAI, DeepSeek, Anthropic, Gemini, Mistral, or Cohere, your requests go to that provider using the API key you supplied. The provider's own privacy policy then applies.

## Data collection consent

On Firefox 140+ the extension declares `personalCommunications` and
`websiteContent` as *optional* data-collection permissions. Firefox therefore
asks for your consent the first time you switch to the Cloud Server settings;
the choice is remembered and can be changed at any time in `about:addons` →
**Permissions and data**. Local-server usage never triggers this prompt.

## Permissions

TuxAI asks for `http://*/*` and `https://*/*` host permissions so its content script can detect text selection on webpages.

TuxAI does not scrape or read pages. It only reacts when you:

- Select text normally (to show it in the sidebar), or
- Select text with the configured shortcut (to show the quick popup), or
- Use the TuxAI right-click context menu

## API keys

Cloud API keys are stored in the extension's local browser storage.

TuxAI does not sync them to the cloud and does not send them to any TuxAI-managed server. They are sent only to the provider endpoint you configure, as the standard authorization header.

## Deleting data

To remove all TuxAI data:

- Remove/disable the extension in your browser's extension manager, or
- Clear the extension's storage from your browser's site/extension data settings

Because TuxAI has no server, there is no remote data to delete.

## Recommendations

- For maximum privacy, use a local LLM server.
- If you use a cloud provider, review that provider's privacy policy.
- Do not paste highly sensitive personal data into any AI service unless you are sure of its data-handling policy.

## Source code

TuxAI is fully open source. Anyone can inspect the code to verify these claims.

See the [LICENSE](LICENSE) file.
