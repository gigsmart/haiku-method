#!/bin/bash
set -e

# Generates a user-facing changelog entry using Claude CLI to synthesize
# commit-level changes into a concise, understandable summary.
#
# Usage: ./generate-changelog.sh <path> <new_version> <old_version>
#
# Env: CLAUDE_CODE_OAUTH_TOKEN (optional — falls back to commit-list if unset)
# Requires: claude CLI (npm install -g @anthropic-ai/claude-code), jq

PATH_DIR="$1"
NEW_VERSION="$2"
OLD_VERSION="$3"

if [ -z "$PATH_DIR" ] || [ -z "$NEW_VERSION" ]; then
	echo "Usage: $0 <path> <new_version> [old_version]"
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

# Determine git range
GIT_RANGE=""
if [ -n "$OLD_VERSION" ]; then
	LAST_BUMP_COMMIT=$(git log --all --grep="bump version.*-> $OLD_VERSION" --format="%H" -1 2>/dev/null || true)
	if [ -n "$LAST_BUMP_COMMIT" ]; then
		GIT_RANGE="$LAST_BUMP_COMMIT..HEAD"
	fi
fi

if [ -z "$GIT_RANGE" ]; then
	GIT_RANGE="HEAD"
fi

# Collect raw commit subjects (filtered)
COMMITS=$(git log $GIT_RANGE --no-merges --pretty=format:"%s" -- "$PATH_DIR" ':!website' ':!.ai-dlc' 2>/dev/null \
	| grep -v "\[skip ci\]" \
	| grep -v "chore(release):" \
	| grep -v "chore(plugin): bump" \
	| grep -v "^status: " \
	| grep -v "^state: " \
	| grep -v "^Merge unit-" \
	| grep -v "^Revert \"Reapply " \
	| grep -v "^Reapply \"" \
	|| true)

if [ -z "$COMMITS" ]; then
	echo "No commits found for $PATH_DIR in range $GIT_RANGE"
	exit 0
fi

DIFF_STAT=$(git diff --stat "$GIT_RANGE" -- "$PATH_DIR" ':!website' ':!.ai-dlc' 2>/dev/null || true)

# ---- Synthesize with Claude CLI ----
CHANGELOG_ENTRY=""
if command -v claude >/dev/null 2>&1; then
	PROMPT="Write a changelog entry for version $NEW_VERSION of the AI-DLC plugin — a Claude Code plugin for structured software development.

Rules:
- Keep a Changelog format: ### Added, ### Changed, ### Fixed, ### Removed (only sections that apply)
- Each bullet: 1 sentence, plain English, focused on what the user can now DO differently
- Group related commits into single bullets (5 commits fixing review feedback = 1 bullet about the feature)
- Skip noise: merge fixes, PR review iterations, terminology passes — unless they change user behavior
- Maximum 5-7 bullets total. Fewer is better. No filler.
- No commit hashes, no links, no file paths
- Output ONLY the markdown sections (### Added, etc.) — no version header, no preamble

Commits since last release:
$COMMITS

Diff stat:
$DIFF_STAT"

	CHANGELOG_ENTRY=$(echo "$PROMPT" | claude --print --model haiku 2>/dev/null || true)
fi

# ---- Fallback: simple commit list ----
if [ -z "$CHANGELOG_ENTRY" ]; then
	echo "Claude CLI unavailable — falling back to commit-list format"

	FEATURES=""
	FIXES=""
	OTHER=""

	while IFS= read -r subject; do
		[ -z "$subject" ] && continue
		CLEAN=$(echo "$subject" | sed -E 's/^[a-z]+(\([^)]+\))?!?: //')
		ENTRY="- $CLEAN"

		if echo "$subject" | grep -qE '^feat(\([^)]+\))?:'; then
			[ -n "$FEATURES" ] && FEATURES="$FEATURES\n$ENTRY" || FEATURES="$ENTRY"
		elif echo "$subject" | grep -qE '^fix(\([^)]+\))?:'; then
			[ -n "$FIXES" ] && FIXES="$FIXES\n$ENTRY" || FIXES="$ENTRY"
		else
			[ -n "$OTHER" ] && OTHER="$OTHER\n$ENTRY" || OTHER="$ENTRY"
		fi
	done <<< "$COMMITS"

	CHANGELOG_ENTRY=""
	[ -n "$FEATURES" ] && CHANGELOG_ENTRY="### Added\n\n$(echo -e "$FEATURES")\n"
	[ -n "$FIXES" ] && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### Fixed\n\n$(echo -e "$FIXES")\n"
	[ -n "$OTHER" ] && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### Changed\n\n$(echo -e "$OTHER")\n"
	CHANGELOG_ENTRY=$(echo -e "$CHANGELOG_ENTRY")
fi

# ---- Build changelog ----
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
	echo "$CHANGELOG_ENTRY"
	echo ""
} >"$TEMP_FILE"

# Append old entries (skip header)
if [ -f "$CHANGELOG_FILE" ]; then
	tail -n +7 "$CHANGELOG_FILE" 2>/dev/null | sed '/^## \[Unreleased\]/,/^## \[/{ /^## \[Unreleased\]/d; /^## \[/!d; }' >>"$TEMP_FILE" || true
fi

# Clean up formatting
perl -i -0777 -pe 's/\n\n\n+/\n\n/g' "$TEMP_FILE"
printf '%s\n' "$(cat "$TEMP_FILE")" >"$TEMP_FILE"

mv "$TEMP_FILE" "$CHANGELOG_FILE"
echo "Changelog generated at $CHANGELOG_FILE"
