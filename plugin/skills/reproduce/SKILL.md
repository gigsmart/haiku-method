---
description: Systematically reproduce and validate bug reports before fixing
disable-model-invocation: true
user-invocable: true
argument-hint: "<bug description or issue URL>"
---

## Name

`ai-dlc:reproduce` - Systematically reproduce and validate bug reports before fixing.

## Synopsis

```
/reproduce <bug description or issue URL>
```

## Description

**User-facing command** - Never fix a bug you can't reproduce. This skill takes a bug report (free-text description or issue tracker URL), attempts to reproduce it programmatically, and produces a failing regression test as proof. The reproduction test becomes the regression test after the fix.

From **Compound Engineering**: reproduction is a prerequisite to fixing. A bug without a reproduction case is just a hypothesis.

## Implementation

### Step 1: Parse the Bug Report

Determine what was provided:

- **Issue URL** (e.g., GitHub issue, Jira ticket, Linear issue): Fetch the issue content using the appropriate tool (`gh issue view`, `WebFetch`, or an MCP integration). Extract the title, description, steps to reproduce, expected behavior, and actual behavior.
- **Free-text description**: Parse the description directly to extract the same fields.

Produce a structured summary:

```
## Bug Summary
- **Title**: <one-line summary>
- **Steps to Reproduce**: <numbered list>
- **Expected Behavior**: <what should happen>
- **Actual Behavior**: <what actually happens>
- **Environment/Context**: <any version, OS, config details mentioned>
```

If the report is missing critical information (no steps to reproduce, no clear expected vs. actual behavior), note the gaps but still attempt reproduction with what is available. Missing info will be flagged in Step 4 if reproduction fails.

### Step 2: Identify Reproduction Strategy

Based on the parsed bug report:

1. **Locate the relevant code** - Use `Grep` and `Glob` to find the files, functions, and code paths mentioned in or implied by the bug report.
2. **Determine the test framework** - Detect the project's existing test setup (look for `jest.config`, `pytest.ini`, `Cargo.toml [dev-dependencies]`, `*_test.go`, `.rspec`, etc.).
3. **Choose the reproduction approach**:
   - **Unit test** - If the bug is in a specific function or module with clear inputs/outputs.
   - **Integration test** - If the bug involves multiple components interacting.
   - **Script reproduction** - If the bug is in CLI behavior, build output, or environment-dependent behavior that is hard to capture in a test harness.

### Step 3: Attempt Reproduction

Write a test (or script) that encodes the bug's expected-vs-actual behavior:

1. **Create the test file** in the project's existing test directory structure, following the project's naming conventions. Name it to clearly indicate it is a reproduction/regression test (e.g., `test_reproduce_<slug>`, `reproduce_<slug>_test`, `<slug>.regression.test`).
2. **Implement the reproduction steps** as test assertions:
   - Set up the preconditions described in the bug report.
   - Execute the action that triggers the bug.
   - Assert the **expected** behavior (so the test FAILS while the bug exists and PASSES after the fix).
3. **Run the test** to confirm it fails with the described bug behavior.

If the test **fails as expected** (demonstrating the bug): proceed to Step 5.
If the test **passes** (bug not reproduced): proceed to Step 4.

### Step 4: Handle Failed Reproduction

If the bug cannot be reproduced:

1. **Document what was tried**:
   - List the exact reproduction steps attempted.
   - Show the test code written and its output.
   - Note any assumptions made about environment, data, or configuration.
2. **Identify possible reasons**:
   - Environment difference (OS, runtime version, configuration).
   - Missing precondition or data state.
   - Intermittent/race condition behavior.
   - Insufficient detail in the bug report.
3. **Ask the user for more information** using `AskUserQuestion`:
   - Present what was tried and what the results were.
   - Ask targeted questions about the gaps identified.
   - Suggest specific environment or configuration details that might matter.

Do NOT proceed to fix anything. A bug that cannot be reproduced cannot be reliably fixed.

### Step 5: Save the Regression Test

When reproduction succeeds:

1. **Keep the failing test** in place. This is now the regression test. It will:
   - Fail until the bug is fixed (proving the fix actually addresses the root cause).
   - Pass after the fix (proving the fix works).
   - Prevent future regressions (catching re-introductions of the same bug).
2. **Do not fix the bug in this skill.** The purpose of `/reproduce` is reproduction only. The fix comes next, in a separate step or skill invocation, guided by the now-existing failing test.

### Step 6: Report Reproduction Status

Present a clear report to the user:

```
## Reproduction Report

**Status**: Reproduced / Not Reproduced
**Bug**: <title>
**Test File**: <path to the regression test>

### Reproduction Evidence
<test output showing the failure, or explanation of why reproduction failed>

### Next Steps
- [ ] Fix the root cause (the regression test will confirm the fix)
- [ ] Run the full test suite to check for side effects
```

If reproduced, the user can now proceed to fix the bug with confidence that the regression test will validate the fix. If not reproduced, the report contains everything needed to continue the investigation.
