#!/bin/bash
# Script to update version number in manifest files using zenity popup

cd /media/Backup/Projects/AI/tuxai || exit 1

FILE="manifest.firefox.json"
FILE2="manifest.json"
FILE3="package.json"

# Verify files exist
for f in "$FILE" "$FILE2" "$FILE3"; do
    if [ ! -f "$f" ]; then
        zenity --error --text="File not found: $f" --width=300
        exit 1
    fi
done

# Read the version out of a json file (first top-level "version": "...")
get_version() {
    sed -n -E 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$1" | head -n1
}

CURRENT_VERSION=$(get_version "$FILE")
[ -z "$CURRENT_VERSION" ] && CURRENT_VERSION=$(get_version "$FILE2")
[ -z "$CURRENT_VERSION" ] && CURRENT_VERSION=$(get_version "$FILE3")
[ -z "$CURRENT_VERSION" ] && CURRENT_VERSION="unknown"

# Warn (in the popup text) if the three files are out of sync
MISMATCH=""
for f in "$FILE2" "$FILE3"; do
    v=$(get_version "$f")
    if [ -n "$v" ] && [ "$v" != "$CURRENT_VERSION" ]; then
        MISMATCH="$MISMATCH\n  • $f is $v"
    fi
done

if [ -n "$1" ]; then
    NEW_VERSION="$1"
else
    # Prompt for new version number via zenity popup,
    # pre-filled with the version currently in the manifest files
    NEW_VERSION=$(zenity --entry \
        --title="Update Version" \
        --text="Current version: <b>$CURRENT_VERSION</b>${MISMATCH:+<i>\n\n(Out of sync:$MISMATCH)</i>}\n\nEnter new version number:" \
        --entry-text="$CURRENT_VERSION")

    # Exit if user cancelled or entered nothing
    if [ -z "$NEW_VERSION" ]; then
        exit 1
    fi
fi

# Update version in all three files
sed -i -E "s/(\"version\":\s*\")[^\"]+(\")/\1${NEW_VERSION}\2/" "$FILE"
sed -i -E "s/(\"version\":\s*\")[^\"]+(\")/\1${NEW_VERSION}\2/" "$FILE2"
sed -i -E "s/(\"version\":\s*\")[^\"]+(\")/\1${NEW_VERSION}\2/" "$FILE3"
sh package.sh
zenity --info \
    --title="Version Updated" \
    --text="✓ Version updated to <b>$NEW_VERSION</b>\n\nFiles updated:\n  • $FILE\n  • $FILE2\n  • $FILE3 \n\n Packaging Done!"\ 
    --width=350

echo "✓ Version updated to $NEW_VERSION in:"
echo "  - $FILE"
echo "  - $FILE2"
echo "  - $FILE3"
echo "packaging done"
