---
description: Resolve PR/MR review comments in parallel — each comment gets its own focused agent
disable-model-invocation: true
user-invocable: true
argument-hint: "<pr-number>"
---

# Resolve Comments: Parallel PR Review Comment Resolution

You are the **Comment Resolver** from Compound Engineering. Your job is to take a pull request number, fetch all outstanding review comments, and resolve them in parallel using focused sub-agents — one per file.

## Synopsis

```
/resolve-comments <pr-number>
```

## Description

This skill automates the resolution of PR/MR review comments. Instead of manually reading each comment and making changes one at a time, it fetches all comments, groups them by file, and spawns parallel agents to address each file's comments concurrently.

This is a **Compound Engineering** pattern: decompose a broad task into independent units of work and execute them in parallel with focused agents that have minimal, relevant context.

---

## Step 1: Fetch PR Review Comments

Determine the repository owner and name from the git remote:

```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments
```

- Parse the JSON response to extract each comment's `path`, `body`, `diff_hunk`, `line`, `side`, `in_reply_to_id`, and `id`.
- Filter out comments that are replies (`in_reply_to_id` is set) — focus on top-level review comments.
- If there are no comments, inform the user and exit.

## Step 2: Group Comments by File

- Group all top-level comments by their `path` field.
- For each file, collect the list of comments with their line numbers, diff hunks, and body text.
- Log a summary: how many files have comments and how many total comments.

## Step 3: Spawn Parallel Agents per File

For each file that has comments, spawn a sub-agent using the `Task` tool. All agents run in parallel.

Each sub-agent receives a prompt containing:

1. **The file path** to modify
2. **The full list of comments** for that file, each with:
   - The comment body (the requested change)
   - The diff hunk (surrounding context)
   - The line number and side
3. **Instructions**:
   - Read the file at the specified path
   - For each comment, understand what change is requested
   - Make the requested fix or improvement
   - Stage the changes with `git add <file>`
   - Create a commit with message: `fix: resolve review comment on <file>`
   - Do NOT push — the orchestrator handles that

**Critical**: Each agent works on exactly one file. This avoids merge conflicts and enables true parallelism.

## Step 4: Push and Report

After all sub-agents complete:

1. Run `git push` to push all fix commits to the remote branch.
2. For each resolved comment, post a reply on the PR using:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr-number}/comments/{comment-id}/replies -f body="Resolved in $(git rev-parse --short HEAD)"
   ```
3. Post a summary comment on the PR:
   ```bash
   gh pr comment {pr-number} --body "Resolved {n} review comments across {m} files."
   ```

## Error Handling

- If a sub-agent fails to resolve a comment (e.g., the file was deleted, the context is ambiguous), it should skip the comment and report the failure.
- The orchestrator collects all failures and includes them in the final PR comment so the reviewer knows which comments still need manual attention.
- Never force-push. Always use a regular `git push`.
