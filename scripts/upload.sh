#!/bin/bash
# Upload TuxAI to GitHub: commit, push, then create a tagged GitHub release.
#
# Usage:
#   scripts/upload.sh                 # commit + push + release
#   scripts/upload.sh diff            # show diff first, then commit + push + release
#   scripts/upload.sh --no-release    # commit + push only (skip the release)
#
# The release tag is derived from the version in package.json (e.g. "1.2.7").
# The release body is taken from the matching version section of "what's news.txt",
# falling back to commit subjects since the previous tag if there is no section.
# dist/tuxai.crx and dist/tuxai.xpi are attached as release assets when present.
# Auth comes from GITHUB_TOKEN (environment, or the gitignored .env file); the
# token is never written into .git/config.
# Requires: git, jq, curl. Run `npm run package` beforehand to refresh dist/.

set -u

# Run from the repository root (this script lives in scripts/).
cd "$(dirname "$0")/.." || exit 1

# GitHub token: prefer the environment, else the gitignored .env file.
if [ -z "${GITHUB_TOKEN:-}" ] && [ -f .env ]; then
	set -a
	. ./.env
	set +a
fi
export GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# Use the token for git pull/push without storing it in .git/config.
git_auth() {
	if [ -n "$GITHUB_TOKEN" ]; then
		git -c credential.helper='!f(){ echo username=x-access-token; echo password="$GITHUB_TOKEN"; };f' "$@"
	else
		git "$@"
	fi
}

DO_RELEASE=1
SHOW_DIFF=0
for arg in "$@"; do
	case "$arg" in
		--no-release) DO_RELEASE=0 ;;
		diff) SHOW_DIFF=1 ;;
	esac
done

if [ "$SHOW_DIFF" = 1 ]; then
	echo "========= diff ======"
	git diff
	sleep 3
else
	clear
fi

echo "========= status ======="
git status
sleep 2
echo "========= add ======"
git add -A
sleep 1
#get time date
t=$(date +"%D %T")
echo "========= commit ======"
git commit -m "upload time: $t"
sleep 1
echo "========= pull ======"
git_auth pull
sleep 1
echo "========= push ======"
if ! git_auth push origin main; then
	echo "!! push failed — skipping release"
	exit 1
fi

# ---------- release ----------
if [ "$DO_RELEASE" != 1 ]; then
	echo "========== Done (no release) ============="
	exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
	echo "!! jq not found — skipping release"
	echo "========== Done ============="
	exit 0
fi

echo "========= release ======"

# Version is read from package.json; the two manifests must match it.
VERSION=$(jq -r '.version' package.json 2>/dev/null)
if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
	echo "!! could not read version from package.json — skipping release"
	echo "========== Done ============="
	exit 0
fi
for f in manifest.json manifest.firefox.json; do
	v=$(jq -r '.version' "$f" 2>/dev/null)
	if [ "$v" != "$VERSION" ]; then
		echo "!! version mismatch: $f is '$v', package.json is '$VERSION'"
		echo "   run scripts/changeversion first — skipping release"
		echo "========== Done ============="
		exit 0
	fi
done

TAG="$VERSION"
REPO=$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#/+#/#g; s#^/##; s#/+$##; s#\.git$##')
TOKEN="$GITHUB_TOKEN"

if [ -z "$TOKEN" ]; then
	echo "!! GITHUB_TOKEN is not set (export it or put it in .env) — skipping release"
	echo "========== Done ============="
	exit 0
fi

echo "version: $VERSION   tag: $TAG   repo: $REPO"

# Already released? Do nothing.
if git_auth ls-remote --tags origin "refs/tags/$TAG" | grep -q .; then
	echo "tag $TAG already exists on origin — nothing to release"
	echo "========== Done ============="
	exit 0
fi

# Release notes: the section for this version in "what's news.txt"
# (from the version line until the next version line), falling back to commit subjects.
NEWS_FILE="what's news.txt"
NOTES=$(awk -v ver="$VERSION" '
	{ line=$0; sub(/[ \t\r]+$/, "", line); sub(/^[ \t]+/, "", line) }
	line == ver { capture=1; next }
	capture && line ~ /^[0-9]+\.[0-9]+(\.[0-9]+)?$/ { exit }
	capture { print }
' "$NEWS_FILE")
NOTES=$(printf '%s\n' "$NOTES" | sed -E '/^[[:space:]]*$/d')
if [ -z "$NOTES" ]; then
	PREV=$(git describe --tags --abbrev=0 2>/dev/null)
	if [ -n "$PREV" ]; then
		NOTES=$(git log --pretty='- %s' "$PREV"..HEAD)
	else
		NOTES=$(git log --pretty='- %s')
	fi
fi
[ -z "$NOTES" ] && NOTES="- TuxAI $TAG"

echo "========= tag ======"
git tag -a "$TAG" -m "TuxAI $TAG"
if ! git push origin "$TAG"; then
	echo "!! failed to push tag $TAG"
	echo "========== Done ============="
	exit 0
fi

echo "========= create release ======"
RELEASE_JSON=$(jq -n --arg tag "$TAG" --arg name "TuxAI $TAG" --arg body "$NOTES" \
	'{tag_name:$tag, name:$name, body:$body, draft:false, prerelease:false}' \
	| curl -fsS -X POST \
		-H "Authorization: Bearer $TOKEN" \
		-H "Accept: application/vnd.github+json" \
		"https://api.github.com/repos/$REPO/releases" -d @-)

if [ -z "$RELEASE_JSON" ]; then
	echo "!! failed to create GitHub release (tag $TAG was pushed)"
	echo "========== Done ============="
	exit 0
fi
echo "release: $(printf '%s' "$RELEASE_JSON" | jq -r '.html_url')"

# Attach the packaged builds.
UPLOAD_URL=$(printf '%s' "$RELEASE_JSON" | jq -r '.upload_url' | sed 's/{.*}//')
for asset in dist/tuxai.crx dist/tuxai.xpi; do
	if [ -f "$asset" ]; then
		echo "========= upload $(basename "$asset") ======"
		if curl -fsS -X POST \
			-H "Authorization: Bearer $TOKEN" \
			-H "Content-Type: application/octet-stream" \
			--data-binary @"$asset" \
			"$UPLOAD_URL?name=$(basename "$asset")" >/dev/null; then
			echo "attached: $(basename "$asset")"
		else
			echo "!! failed to attach $(basename "$asset")"
		fi
	fi
done

echo "========== Done ============="
