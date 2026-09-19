#!/usr/bin/env bash
# Build the Firefox extension and launch it in Firefox for live testing.
#
# Uses web-ext, which loads the extension as a temporary add-on (no signing
# required). This is the reliable way to run the real TuxAI extension in
# Firefox; Playwright's Firefox cannot sideload unsigned extensions because
# its signature requirement is compiled in.
#
# Usage:
#   bash scripts/run-firefox.sh                # interactive, opens Firefox
#   HEADLESS=1 bash scripts/run-firefox.sh     # headless (no window)
#   URL=https://example.com bash scripts/run-firefox.sh
#   FIREFOX=/path/to/firefox bash scripts/run-firefox.sh
#
# The browser reloads the extension automatically whenever files under
# dist/firefox change (use `npm run build:firefox` in another terminal).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WEB_EXT="${WEB_EXT:-web-ext}"
if ! command -v "$WEB_EXT" >/dev/null 2>&1; then
  echo "web-ext not found. Install it with:" >&2
  echo "  npm install -g --prefix \"\$HOME/.local\" web-ext" >&2
  exit 1
fi

# Prefer Playwright's Firefox when no FIREFOX is given.
FIREFOX="${FIREFOX:-}"
if [ -z "$FIREFOX" ]; then
  for candidate in "$HOME"/.cache/ms-playwright/firefox-*/firefox/firefox; do
    if [ -x "$candidate" ]; then
      FIREFOX="$candidate"
      break
    fi
  done
fi

echo "Building Firefox extension..."
node scripts/build.mjs --firefox

CMD=("$WEB_EXT" run --source-dir dist/firefox --no-input)

if [ -n "$FIREFOX" ]; then
  if [ ! -x "$FIREFOX" ]; then
    echo "Firefox binary not executable: $FIREFOX" >&2
    exit 1
  fi
  CMD+=(--firefox "$FIREFOX")
  echo "Using Firefox: $FIREFOX"
else
  echo "Using default Firefox on PATH"
fi

if [ -n "${HEADLESS:-}" ]; then
  CMD+=(--args=-headless)
  echo "Headless mode"
fi

if [ -n "${URL:-}" ]; then
  CMD+=(--start-url "$URL")
fi

echo "Launching web-ext (Ctrl+C to stop; the extension reloads on file changes)..."
exec "${CMD[@]}"
