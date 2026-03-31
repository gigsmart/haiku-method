#!/bin/bash
set -e

# Feature-level changelog generator.
# Uses PR merges as the primary unit of change instead of individual commits.
# Direct-to-main commits appear only if they are feat/fix/breaking.
#
# Usage: ./generate-changelog.sh <path> <new_version> [old_version]

PATH_DIR="$1"
NEW_VERSION="$2"
OLD_VERSION="$3"

if [ -z "$PATH_DIR" ] || [ -z "$NEW_VERSION" ]; then
	echo "Usage: $0 <path> <new_version> [old_version]"
	echo "Example: $0 . 1.2.3"
	exit 1
fi

CHANGELOG_FILE="$PATH_DIR/CHANGELOG.md"
TEMP_FILE=$(mktemp)

# Determine the previous version if not provided
if [ -z "$OLD_VERSION" ]; then
	if [ -f "$PATH_DIR/.claude-plugin/plugin.json" ]; then
		OLD_VERSION=$(jq -r '.version' "$PATH_DIR/.claude-plugin/plugin.json" 2>/dev/null || echo "")
	fi
fi

# Determine git range from last version bump
GIT_RANGE=""
if [ -n "$OLD_VERSION" ]; then
	LAST_BUMP_COMMIT=$(git log --all --grep="bump version.*-> $(echo "$OLD_VERSION" | sed 's/\./\\./g')" --format="%H" -1 2>/dev/null || true)
	if [ -n "$LAST_BUMP_COMMIT" ]; then
		GIT_RANGE="$LAST_BUMP_COMMIT..HEAD"
	fi
fi
[ -z "$GIT_RANGE" ] && GIT_RANGE="HEAD"

FEATURES=""
FIXES=""
BREAKING=""
CHANGED=""

add_entry() {
	local category="$1"
	local entry="$2"
	case "$category" in
		breaking) BREAKING="${BREAKING:+$BREAKING\n}$entry" ;;
		feature)  FEATURES="${FEATURES:+$FEATURES\n}$entry" ;;
		fix)      FIXES="${FIXES:+$FIXES\n}$entry" ;;
		changed)  CHANGED="${CHANGED:+$CHANGED\n}$entry" ;;
	esac
}

# Categorize by conventional commit prefix in the raw title
categorize() {
	local title="$1"
	local entry="$2"

	if echo "$title" | grep -qiE 'BREAKING CHANGE|^[a-z]+(\([^)]+\))?!:'; then
		add_entry breaking "$entry"
	elif echo "$title" | grep -qiE '^fix(\([^)]+\))?:'; then
		add_entry fix "$entry"
	elif echo "$title" | grep -qiE '^refactor(\([^)]+\))?:|^chore(\([^)]+\))?:'; then
		add_entry changed "$entry"
	else
		add_entry feature "$entry"
	fi
}

# Strip conventional commit prefix, branch-name artifacts, and capitalize
clean_title() {
	local raw="$1"
	local cleaned

	# Remove conventional commit prefix (feat(scope): , fix!: , intent: , etc.)
	cleaned=$(echo "$raw" | sed -E 's/^(feat|fix|refactor|chore|docs|ci|test|perf|style|build|intent)(\([^)]+\))?!?:[[:space:]]*//')

	# Remove branch-name artifacts (Ai dlc/..., trailing /main)
	cleaned=$(echo "$cleaned" | sed -E 's|^[Aa]i[ -]?[Dd][Ll][Cc]/||' | sed -E 's|/main$||' | sed -E 's|^[Ff]eat/||')

	# Humanize remaining slashes/hyphens if it still looks like a branch name
	if echo "$cleaned" | grep -qE '^[a-z0-9-]+(/[a-z0-9-]+)+$'; then
		cleaned=$(echo "$cleaned" | tr '/-' ' ')
	fi

	# Capitalize first letter
	cleaned="$(echo "${cleaned:0:1}" | tr '[:lower:]' '[:upper:]')${cleaned:1}"

	echo "$cleaned"
}

# --- Pass 1: Merge commits (PR-level entries) ---
# Pass 1: Merge commits (PR-level entries) — intentionally not filtered by PATH_DIR
# since PRs are a repo-level concept and their titles describe the overall change.
MERGE_HASHES=$(git log "$GIT_RANGE" --merges --first-parent --format="%h" 2>/dev/null || true)

for hash in $MERGE_HASHES; do
	subject=$(git log -1 --format="%s" "$hash")
	body=$(git log -1 --format="%b" "$hash" | head -1 | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

	# Skip noise
	echo "$subject" | grep -qiE '\[skip ci\]|bump version|Merge unit-|Merge branch .* into' && continue
	echo "$subject" | grep -qiE '^Revert |^Reapply ' && continue

	if echo "$subject" | grep -q "Merge pull request"; then
		pr_num=$(echo "$subject" | grep -oE '#[0-9]+' | head -1)
	if echo "$subject" | grep -q "Merge pull request"; then
		pr_num=$(echo "$subject" | grep -oE '#[0-9]+' | head -1)
		if [ -z "$body" ]; then
			continue  # skip PRs with no description
		fi
	
	else
		pr_num=""
		title="$subject"
	fi

	[ -z "$title" ] && continue

	cleaned=$(clean_title "$title")
	[ -z "$cleaned" ] && continue

	entry="- ${cleaned}${pr_num:+ ($pr_num)}"
	categorize "$title" "$entry"
done

# --- Pass 2: Direct-to-main commits (not part of any PR) ---
# Only feat, fix, and breaking — skip chores, state tracking, etc.
while IFS='|' read -r hash subject; do
	[ -z "$hash" ] && continue

	cleaned=$(clean_title "$subject")
	entry="- ${cleaned}"
MERGE_HASHES=$(git log "$GIT_RANGE" --merges --first-parent --format="%h" 2>/dev/null || true)
	if echo "$subject" | grep -qE '^[a-z]+(\([^)]+\))?!:'; then
		add_entry breaking "$entry"
	elif echo "$subject" | grep -qE '^feat(\([^)]+\))?:'; then
		add_entry feature "$entry"
	elif echo "$subject" | grep -qE '^fix(\([^)]+\))?:'; then
		add_entry fix "$entry"
	fi
	# Intentionally skip chore, refactor, docs, state tracking for direct commits
done < <(git log $GIT_RANGE --no-merges --first-parent --pretty=format:"%h|%s" -- "$PATH_DIR" ':!website' ':!.ai-dlc' 2>/dev/null \
	| grep -v "\[skip ci\]" \
	| grep -v "chore(plugin): bump" \
	| grep -v "^[a-f0-9]*|Revert " \
	| grep -v "^[a-f0-9]*|Reapply " \
	|| true)

# --- Check if anything was found ---
if [ -z "$FEATURES" ] && [ -z "$FIXES" ] && [ -z "$BREAKING" ] && [ -z "$CHANGED" ]; then
	echo "No notable changes found for $PATH_DIR in range $GIT_RANGE"
	exit 0
fi

# --- Generate changelog ---
{
	echo "# Changelog"
	echo ""
	echo "All notable changes to this project will be documented in this file."
	echo ""
	echo "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),"
	echo "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)."
	echo ""
	echo "## [$NEW_VERSION] - $(date +%Y-%m-%d)"
	echo ""
} >"$TEMP_FILE"

if [ -n "$BREAKING" ]; then
	{ echo "### BREAKING CHANGES"; echo ""; echo -e "$BREAKING"; echo ""; } >>"$TEMP_FILE"
fi
if [ -n "$FEATURES" ]; then
	{ echo "### Added"; echo ""; echo -e "$FEATURES"; echo ""; } >>"$TEMP_FILE"
fi
if [ -n "$CHANGED" ]; then
	{ echo "### Changed"; echo ""; echo -e "$CHANGED"; echo ""; } >>"$TEMP_FILE"
fi
if [ -n "$FIXES" ]; then
	{ echo "### Fixed"; echo ""; echo -e "$FIXES"; echo ""; } >>"$TEMP_FILE"
fi

# Append old entries (strip header and [Unreleased] section)
if [ -f "$CHANGELOG_FILE" ]; then
	tail -n +7 "$CHANGELOG_FILE" 2>/dev/null \
		| sed '/^## \[Unreleased\]/,/^## \[/{ /^## \[Unreleased\]/d; /^## \[/!d; }' >>"$TEMP_FILE" || true
fi

# Clean up consecutive blank lines and ensure single trailing newline
perl -i -0777 -pe 's/\n\n\n+/\n\n/g' "$TEMP_FILE"
printf '%s\n' "$(cat "$TEMP_FILE")" >"$TEMP_FILE"

mv "$TEMP_FILE" "$CHANGELOG_FILE"
echo "Changelog generated at $CHANGELOG_FILE"
