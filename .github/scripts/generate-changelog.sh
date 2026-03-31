#!/bin/bash
set -e

# Script to generate CHANGELOG.md based on git commit history
# Usage: ./generate-changelog.sh <path> <new_version> <old_version>
#
# Arguments:
#   path: Path to the directory (e.g., "." for root plugin)
#   new_version: The new version being released (e.g., "1.2.3")
#   old_version: The previous version (e.g., "1.2.2") - optional, will auto-detect from plugin.json

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

# Determine git range: from the last version bump commit to HEAD
# This ensures each version only includes commits new since the previous release
GIT_RANGE=""
if [ -n "$OLD_VERSION" ]; then
	# Find the commit that bumped TO the old version (e.g., "bump version X -> 1.16.0")
	LAST_BUMP_COMMIT=$(git log --all --grep="bump version.*-> $OLD_VERSION" --format="%H" -1 2>/dev/null || true)
	if [ -n "$LAST_BUMP_COMMIT" ]; then
		GIT_RANGE="$LAST_BUMP_COMMIT..HEAD"
	fi
fi

# Fallback: if no bump commit found, use all commits (first release scenario)
if [ -z "$GIT_RANGE" ]; then
	GIT_RANGE="HEAD"
fi

# Get commits for this path, excluding noise
# Filters: version bumps, merge commits, AI-DLC state tracking, reverts of reverts
COMMITS=$(git log $GIT_RANGE --no-merges --pretty=format:"%h|%s|%an|%ad" --date=short -- "$PATH_DIR" ':!website' ':!.ai-dlc' 2>/dev/null \
	| grep -v "\[skip ci\]" \
	| grep -v "chore(release):" \
	| grep -v "chore(plugin): bump" \
	| grep -v "^[a-f0-9]*|status: " \
	| grep -v "^[a-f0-9]*|state: " \
	| grep -v "^[a-f0-9]*|Merge unit-" \
	| grep -v "^[a-f0-9]*|Revert \"Reapply " \
	| grep -v "^[a-f0-9]*|Reapply \"" \
	|| true)

if [ -z "$COMMITS" ]; then
	echo "No commits found for $PATH_DIR in range $GIT_RANGE"
	exit 0
fi

# Parse commits into categories
FEATURES=""
FIXES=""
REFACTORS=""
CHORES=""
BREAKING=""
OTHER=""

while IFS='|' read -r hash subject _author _date; do
	# Skip empty lines
	[ -z "$hash" ] && continue

	# Remove scope from subject for cleaner display
	CLEAN_SUBJECT=$(echo "$subject" | sed -E 's/^[a-z]+(\([^)]+\))?!?: //')

	# Format entry
	ENTRY="- $CLEAN_SUBJECT ([$hash](../../commit/$hash))"

	# Categorize commit (use newline only between entries, not before first)
	if echo "$subject" | grep -qE '^[a-z]+(\([^)]+\))?!:' || echo "$subject" | grep -q 'BREAKING CHANGE'; then
		[ -n "$BREAKING" ] && BREAKING="$BREAKING\n$ENTRY" || BREAKING="$ENTRY"
	elif echo "$subject" | grep -qE '^feat(\([^)]+\))?:'; then
		[ -n "$FEATURES" ] && FEATURES="$FEATURES\n$ENTRY" || FEATURES="$ENTRY"
	elif echo "$subject" | grep -qE '^fix(\([^)]+\))?:'; then
		[ -n "$FIXES" ] && FIXES="$FIXES\n$ENTRY" || FIXES="$ENTRY"
	elif echo "$subject" | grep -qE '^refactor(\([^)]+\))?:'; then
		[ -n "$REFACTORS" ] && REFACTORS="$REFACTORS\n$ENTRY" || REFACTORS="$ENTRY"
	elif echo "$subject" | grep -qE '^chore(\([^)]+\))?:'; then
		[ -n "$CHORES" ] && CHORES="$CHORES\n$ENTRY" || CHORES="$ENTRY"
	else
		[ -n "$OTHER" ] && OTHER="$OTHER\n$ENTRY" || OTHER="$ENTRY"
	fi
done <<<"$COMMITS"

# Generate changelog header
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

# Add breaking changes section if any
if [ -n "$BREAKING" ]; then
	{
		echo "### BREAKING CHANGES"
		echo ""
		echo -e "$BREAKING"
		echo ""
	} >>"$TEMP_FILE"
fi

# Add features section if any
if [ -n "$FEATURES" ]; then
	{
		echo "### Added"
		echo ""
		echo -e "$FEATURES"
		echo ""
	} >>"$TEMP_FILE"
fi

# Add fixes section if any
if [ -n "$FIXES" ]; then
	{
		echo "### Fixed"
		echo ""
		echo -e "$FIXES"
		echo ""
	} >>"$TEMP_FILE"
fi

# Add refactors section if any
if [ -n "$REFACTORS" ]; then
	{
		echo "### Changed"
		echo ""
		echo -e "$REFACTORS"
		echo ""
	} >>"$TEMP_FILE"
fi

# Add other changes if any
if [ -n "$OTHER" ]; then
	{
		echo "### Other"
		echo ""
		echo -e "$OTHER"
		echo ""
	} >>"$TEMP_FILE"
fi

# If existing changelog exists, append old entries (excluding the header and [Unreleased] section)
if [ -f "$CHANGELOG_FILE" ]; then
	# Skip header (first 6 lines), then strip any [Unreleased] section
	# (its commits are now captured in the new version's range)
	tail -n +7 "$CHANGELOG_FILE" 2>/dev/null | sed '/^## \[Unreleased\]/,/^## \[/{ /^## \[Unreleased\]/d; /^## \[/!d; }' >>"$TEMP_FILE" || true
fi

# Remove consecutive blank lines and ensure single trailing newline
perl -i -0777 -pe 's/\n\n\n+/\n\n/g' "$TEMP_FILE"
printf '%s\n' "$(cat "$TEMP_FILE")" >"$TEMP_FILE"

# Move temp file to final location
mv "$TEMP_FILE" "$CHANGELOG_FILE"

echo "Changelog generated at $CHANGELOG_FILE"
