#!/bin/bash
set -e

# Backfill the entire CHANGELOG.md by regenerating every version entry
# using Claude CLI. Also creates missing git tags and GitHub releases.
#
# Usage: ./backfill-changelog.sh
# Requires: claude CLI, gh CLI, jq

CHANGELOG_FILE="CHANGELOG.md"
TEMP_FILE=$(mktemp)

# Header
cat > "$TEMP_FILE" << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF

# Get all version bump commits in chronological order (newest first)
# Each line: <commit-hash> <old-version> <new-version>
BUMPS=$(git log --all --grep="bump version" --format="%H %s" \
  | grep 'chore(plugin): bump version' \
  | sed -E 's/^([a-f0-9]+) chore\(plugin\): bump version ([^ ]+) -> ([^ ]+).*/\1 \2 \3/')

# Deduplicate: if multiple bump commits target the same new_version, keep the first (latest) one
SEEN_FILE=$(mktemp)
UNIQUE_BUMPS=""
while IFS=' ' read -r hash old_ver new_ver; do
  [ -z "$new_ver" ] && continue
  if ! grep -q "^${new_ver}$" "$SEEN_FILE" 2>/dev/null; then
    echo "$new_ver" >> "$SEEN_FILE"
    UNIQUE_BUMPS="${UNIQUE_BUMPS}${hash} ${old_ver} ${new_ver}\n"
  fi
done <<< "$BUMPS"
rm -f "$SEEN_FILE"

# Sort by version (newest first) — extract version field, sort numerically
SORTED_BUMPS=$(echo -e "$UNIQUE_BUMPS" | awk -F'[ .]' '{printf "%05d.%05d.%05d %s\n", $4, $5, $6, $0}' | sort -rn | sed 's/^[^ ]* //')

TOTAL=$(echo -e "$SORTED_BUMPS" | grep -c . || echo 0)
COUNT=0

while IFS=' ' read -r bump_hash old_version new_version; do
  [ -z "$new_version" ] && continue
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] Generating v${new_version} (from ${old_version})..."

  # Find the previous bump commit (the one that created old_version)
  PREV_BUMP=$(git log --all --grep="bump version.*-> $old_version" --format="%H" -1 2>/dev/null || true)

  if [ -n "$PREV_BUMP" ]; then
    GIT_RANGE="${PREV_BUMP}..${bump_hash}"
  else
    # First version — use all commits up to this bump
    GIT_RANGE="${bump_hash}"
  fi

  # Get date from bump commit
  VERSION_DATE=$(git log -1 --format="%ad" --date=short "$bump_hash" 2>/dev/null || date +%Y-%m-%d)

  # Get commits in range
  COMMITS=$(git log $GIT_RANGE --no-merges --pretty=format:"%s" -- "." ':!website' ':!.ai-dlc' 2>/dev/null \
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
    echo "  No commits found, skipping..."
    continue
  fi

  COMMIT_COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')

  # Generate entry with Claude
  ENTRY=""
  if command -v claude >/dev/null 2>&1; then
    PROMPT="Write a changelog entry for version $new_version of the AI-DLC plugin (a Claude Code plugin for structured software development).

Rules:
- Keep a Changelog format: ### Added, ### Changed, ### Fixed, ### Removed (only include sections that have content)
- Each bullet: 1 sentence, plain English, focused on what a plugin user can now DO differently
- Group related commits into single bullets
- Skip noise: merge fixes, PR review iterations, address review feedback commits
- Maximum 5-7 bullets total. Fewer is better.
- No commit hashes, no links, no file paths
- Output ONLY the markdown sections — no version header, no preamble, no explanation

Commits ($COMMIT_COUNT):
$COMMITS"

    ENTRY=$(echo "$PROMPT" | claude --print --model haiku 2>/dev/null || true)
  fi

  # Fallback
  if [ -z "$ENTRY" ]; then
    ENTRY="### Changed"$'\n\n'
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      CLEAN=$(echo "$line" | sed -E 's/^[a-z]+(\([^)]+\))?!?: //')
      ENTRY="${ENTRY}- ${CLEAN}"$'\n'
    done <<< "$COMMITS"
  fi

  # Write version section
  echo "## [$new_version] - $VERSION_DATE" >> "$TEMP_FILE"
  echo "" >> "$TEMP_FILE"
  echo "$ENTRY" >> "$TEMP_FILE"
  echo "" >> "$TEMP_FILE"

  # Create git tag if missing
  TAG="v${new_version}"
  if ! git tag -l "$TAG" | grep -q "$TAG"; then
    git tag "$TAG" "$bump_hash" 2>/dev/null && echo "  Created tag $TAG" || echo "  Tag $TAG failed"
  fi

done <<< "$SORTED_BUMPS"

# Clean up formatting
perl -i -0777 -pe 's/\n\n\n+/\n\n/g' "$TEMP_FILE"
printf '%s\n' "$(cat "$TEMP_FILE")" > "$TEMP_FILE"

mv "$TEMP_FILE" "$CHANGELOG_FILE"
echo ""
echo "Changelog regenerated at $CHANGELOG_FILE with $COUNT versions"
echo ""
echo "To push tags: git push origin --tags"
echo "To create releases, run the release backfill step separately"
