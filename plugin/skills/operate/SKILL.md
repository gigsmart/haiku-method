---
description: Manage operations — list, execute, deploy, monitor, and teardown operational tasks
argument-hint: "[intent-slug] [operation-name] [--deploy [target]] [--status] [--teardown]"
disable-model-invocation: true
---

## Name

`haiku:operate` - Manage operations — list, execute, deploy, monitor, and teardown operational tasks.

## Synopsis

```
/haiku:operate                                    # List all operations across all intents
/haiku:operate {intent}                           # Show status table for intent's operations
/haiku:operate {intent} {operation}               # Execute or display a specific operation
/haiku:operate {intent} --deploy [target]         # Generate deployment manifests
/haiku:operate {intent} --status                  # Show last-run timestamps and health
/haiku:operate {intent} --teardown               # Remove deployments (preserves specs)
```

## Description

**User-facing command** — Manage operational tasks for completed or in-progress intents.

The operate skill reads per-file operation specs from `.haiku/intents/{intent}/operations/` and provides:
- **List all** — scan every intent's operations, display grouped overview
- **Intent overview** — status table with last-run timestamps for one intent
- **Ad-hoc execution** — run agent-owned scripts or display human checklists
- **Deploy** — generate deployment manifests matching stack config
- **Status** — show health, timestamps, and overdue operations
- **Teardown** — remove deployments without deleting specs or scripts

## Operation File Format

Each operation is a `.md` file in `.haiku/intents/{intent}/operations/` with YAML frontmatter:

```yaml
---
name: rotate-secrets
type: scheduled | reactive | process
owner: agent | human
schedule: "0 0 1 */3 *"    # cron expression (scheduled type)
trigger: "error_rate > 5%"  # condition (reactive type)
frequency: "quarterly"      # human-readable (process type)
runtime: node               # optional per-operation override
---

Markdown body: description, runbook, or checklist (for human-owned operations).
```

**Companion files** (for agent-owned operations):
- `{name}.ts` / `{name}.py` / `{name}.sh` — executable script matching the runtime
- `deploy/{name}.{type}.yaml` — deployment manifest, written to `operations/deploy/` by `/haiku:operate --deploy`

**Human-owned operations** have no companion script. The `.md` body contains the checklist.

## Status Persistence

Operation status is stored at `.haiku/intents/{intent}/state/operation-status.json` via `dlc_state_save`:

```json
{
  "operations": {
    "{operation-name}": {
      "last_run": "ISO-8601 | null",
      "last_presented": "ISO-8601 | null",
      "status": "on-track | needs-attention | failed | pending | torn-down",
      "last_exit_code": null,
      "last_output": null,
      "deployed": false,
      "deploy_target": null
    }
  }
}
```

## Implementation

### Step 0: Parse Arguments

```bash
INTENT_SLUG=""
OPERATION_NAME=""
FLAG_DEPLOY=false
DEPLOY_TARGET=""
FLAG_STATUS=false
FLAG_TEARDOWN=false
FLAG_MIGRATE=false

# Two-pass parsing: flags first, then positionals
# Iterate over "$@" directly to preserve quoting for values with spaces.
# Pass 1: extract flags
for arg in "$@"; do
  case "$arg" in
    --deploy)   FLAG_DEPLOY=true ;;
    --status)   FLAG_STATUS=true ;;
    --teardown) FLAG_TEARDOWN=true ;;
    --migrate)  FLAG_MIGRATE=true ;;
  esac
done

# Pass 2: collect positional arguments (non-flag tokens in order)
POSITIONALS=()
for arg in "$@"; do
  case "$arg" in
    --deploy|--status|--teardown|--migrate) ;;  # skip flags
    *) POSITIONALS+=("$arg") ;;
  esac
done

# Assign positionals: first is always intent, second depends on mode
INTENT_SLUG="${POSITIONALS[0]:-}"
if [ "$FLAG_DEPLOY" = true ]; then
  DEPLOY_TARGET="${POSITIONALS[1]:-}"
else
  OPERATION_NAME="${POSITIONALS[1]:-}"
fi
```

**Route to the correct mode:**

| Condition | Mode | Go to |
|---|---|---|
| No args at all | List All | Step 1 |
| `INTENT_SLUG` only (no flags, no operation) | Intent Overview | Step 2 |
| `INTENT_SLUG` + `OPERATION_NAME` | Ad-Hoc Execute | Step 3 |
| `INTENT_SLUG` + `--deploy` | Deploy | Step 5 |
| `INTENT_SLUG` + `--status` | Status | Step 6 |
| `INTENT_SLUG` + `--teardown` | Teardown | Step 7 |

If `FLAG_MIGRATE` is set, exit immediately with a "coming soon" message:
```bash
if [ "$FLAG_MIGRATE" = true ]; then
  echo "haiku: operate: --migrate is not yet implemented" >&2
  exit 1
fi
```

If a flag is set but no `INTENT_SLUG` is provided, display:
```
Error: --deploy, --status, and --teardown require an intent slug.
Usage: /haiku:operate {intent} --deploy [target]
```

### Step 1: List All Operations

Scan all intents for operations and display a grouped table.

```bash
REPO_ROOT="$(find_repo_root)"
ALL_INTENTS=$(find "$REPO_ROOT/.ai-dlc" -maxdepth 2 -name "intent.md" -exec dirname {} \; 2>/dev/null)
```

For each intent directory found:

1. Check if `.haiku/intents/{intent}/operations/` directory exists
2. If it exists, read all `.md` files from it
3. Parse each operation's frontmatter using `dlc_frontmatter_get`
4. Load status from `operation-status.json` via `dlc_state_load`

Display the grouped table:

```markdown
## All Operations

### Intent: {intent-slug}
| Operation | Type | Owner | Schedule/Trigger | Status |
|---|---|---|---|---|
| {name} | {type} | {owner} | {schedule or trigger or frequency} | {status} |

### Intent: {other-intent}
| Operation | Type | Owner | Schedule/Trigger | Status |
|---|---|---|---|---|
| {name} | {type} | {owner} | {schedule or trigger or frequency} | {status} |
```

If no operations are found across any intent:
```markdown
No operations found across any intent.

Operations are created during the Execution phase when units have operational
requirements. Each operation is a `.md` file in `.haiku/intents/{intent}/operations/`
with frontmatter defining its type, owner, and schedule.

See the Operation File Format section above for the spec.
```

**Done.** Stop here for list-all mode.

### Step 2: Intent Overview

Show a status table for all operations within a single intent.

```bash
INTENT_DIR="$REPO_ROOT/.haiku/intents/${INTENT_SLUG}"
OPS_DIR="$INTENT_DIR/operations"
LEGACY_FILE="$INTENT_DIR/operations.md"
```

1. Verify `$INTENT_DIR` exists. If not:
   ```
   Error: Intent directory not found: .haiku/intents/{intent-slug}/
   Run /haiku:operate to list all intents with operations.
   ```

2. **Check for legacy format.** If `$LEGACY_FILE` exists AND `$OPS_DIR` does not exist, go to **Step 8** (Legacy Compatibility).
   > **Note:** When both `operations.md` (legacy) and `operations/` (per-file) exist, the per-file format takes precedence and the legacy file is silently ignored.

3. If `$OPS_DIR` does not exist or contains no `.md` files:
   ```markdown
   No operations found for intent: {intent-slug}

   Operations are created during the Execution phase. Each operation is a
   `.md` file in `.haiku/intents/{intent-slug}/operations/` with frontmatter
   defining its type, owner, and schedule.
   ```
   **Done.** Stop here.

4. Read all `.md` files in `$OPS_DIR`
5. Parse frontmatter for each:
   ```bash
   NAME=$(dlc_frontmatter_get "name" "$op_file")
   TYPE=$(dlc_frontmatter_get "type" "$op_file")
   OWNER=$(dlc_frontmatter_get "owner" "$op_file")
   SCHEDULE=$(dlc_frontmatter_get "schedule" "$op_file")
   TRIGGER=$(dlc_frontmatter_get "trigger" "$op_file")
   FREQUENCY=$(dlc_frontmatter_get "frequency" "$op_file")
   ```
6. Load `operation-status.json` via `dlc_state_load "$INTENT_DIR" "operation-status.json"`
7. For each operation, extract `last_run` and `status` from the JSON

Display the full status table:

```markdown
## Operations: {Intent Title}

| Operation | Type | Owner | Schedule/Trigger | Last Run | Status |
|---|---|---|---|---|---|
| {name} | {type} | {owner} | {schedule or trigger or frequency} | {last_run or "never"} | {status or "pending"} |
```

**Done.** Stop here for intent-overview mode.

### Step 3: Ad-Hoc Execute — Determine Owner

When invoked as `/haiku:operate {intent} {operation}`:

1. Locate the operation spec file:
   ```bash
   OP_FILE="$REPO_ROOT/.haiku/intents/${INTENT_SLUG}/operations/${OPERATION_NAME}.md"
   ```
   If it does not exist, try matching by the `name` frontmatter field across all `.md` files in the operations directory.

2. If no matching operation found:
   ```
   Error: Operation not found: {operation-name}
   Run /haiku:operate {intent} to see available operations.
   ```

3. Read the owner:
   ```bash
   OWNER=$(dlc_frontmatter_get "owner" "$OP_FILE")
   ```

4. Route:
   - `owner: agent` → **Step 4** (Agent Execution)
   - `owner: human` → **Step 4a** (Human Operation)

### Step 4: Ad-Hoc Execute — Agent Operations

For `owner: agent` operations:

1. **Determine the runtime:**
   ```bash
   RUNTIME=$(dlc_frontmatter_get "runtime" "$OP_FILE")
   if [ -z "$RUNTIME" ]; then
     RUNTIME=$(get_operations_runtime)
   fi
   ```

2. **Find the companion script.** Look in the same directory as the operation spec:
   ```bash
   OPS_DIR="$REPO_ROOT/.haiku/intents/${INTENT_SLUG}/operations"
   SCRIPT=""
   for ext in sh ts py go; do
     if [ -f "$OPS_DIR/${OPERATION_NAME}.$ext" ]; then
       SCRIPT="$OPS_DIR/${OPERATION_NAME}.$ext"
       break
     fi
   done
   ```

   If no script found:
   ```
   Error: No companion script found for agent operation: {operation-name}
   Expected one of: {operation-name}.sh, {operation-name}.ts, {operation-name}.py, {operation-name}.go
   in .haiku/intents/{intent}/operations/
   ```

3. **Execute the script** based on runtime:
   ```bash
   case "$RUNTIME" in
     node)    CMD="npx tsx $SCRIPT" ;;
     python)  CMD="python3 $SCRIPT" ;;
     go)      CMD="go run $SCRIPT" ;;
     *)       CMD="bash $SCRIPT" ;;
   esac

   OUTPUT=$($CMD 2>&1)
   EXIT_CODE=$?
   ```

4. **Update status** in `operation-status.json`:
   ```bash
   TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   if   [ "$EXIT_CODE" -eq 0 ]; then OP_STATUS="on-track"
   elif [ "$EXIT_CODE" -eq 2 ]; then OP_STATUS="pending"  # dry-run passed, not yet executed
   else                               OP_STATUS="failed"
   fi

   STATUS_JSON=$(dlc_state_load "$INTENT_DIR" "operation-status.json" 2>/dev/null || echo '{"operations":{}}')
   UPDATED=$(echo "$STATUS_JSON" | jq \
     --arg name "$OPERATION_NAME" \
     --arg time "$TIMESTAMP" \
     --arg status "$OP_STATUS" \
     --argjson exit "$EXIT_CODE" \
     --arg output "$OUTPUT" \
     '.operations[$name] = ((.operations[$name] // {}) + {
       "last_run": $time,
       "last_presented": null,
       "status": $status,
       "last_exit_code": $exit,
       "last_output": ($output | .[0:2000])
     }) | .operations[$name].deployed //= false | .operations[$name].deploy_target //= null')
   dlc_state_save "$INTENT_DIR" "operation-status.json" "$UPDATED"
   ```

5. **Commit if files changed:**
   ```bash
   if [ -n "$(git status --porcelain)" ]; then
     git add ".haiku/intents/${INTENT_SLUG}/"
     git commit -m "operate(${INTENT_SLUG}): execute ${OPERATION_NAME}"
   fi
   ```

6. **Report results:**
   ```markdown
   ## Execution Result: {operation-name}

   **Status:** {on-track | pending | failed}
   **Exit Code:** {exit-code}
   **Timestamp:** {timestamp}

   ### Output
   ```
   {stdout/stderr output}
   ```
   ```

**Done.** Stop here for agent execution mode.

### Step 4a: Ad-Hoc Execute — Human Operations

For `owner: human` operations:

1. **Read the operation spec** and extract the markdown body (everything below the frontmatter):
   ```bash
   BODY=$(sed '1,/^---$/d; 1,/^---$/d' "$OP_FILE")
   SCHEDULE=$(dlc_frontmatter_get "schedule" "$OP_FILE")
   FREQUENCY=$(dlc_frontmatter_get "frequency" "$OP_FILE")
   TYPE=$(dlc_frontmatter_get "type" "$OP_FILE")
   ```

2. **Display the checklist and schedule:**
   ```markdown
   ## Human Operation: {operation-name}

   **Type:** {type}
   **Schedule/Frequency:** {schedule or frequency}

   ---

   {markdown body with checklist}

   ---

   *This is a human-owned operation. Complete the steps above offline.
   Status is tracked but not automatically marked complete.*
   ```

3. **Track presentation** in status:
   ```bash
   TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   STATUS_JSON=$(dlc_state_load "$INTENT_DIR" "operation-status.json" 2>/dev/null || echo '{"operations":{}}')
   UPDATED=$(echo "$STATUS_JSON" | jq \
     --arg name "$OPERATION_NAME" \
     --arg time "$TIMESTAMP" \
     '.operations[$name] = ((.operations[$name] // {}) | .last_presented = $time | .status = (.status // "pending"))')
   dlc_state_save "$INTENT_DIR" "operation-status.json" "$UPDATED"
   ```

**Done.** Stop here for human operation mode. Do NOT mark as completed.

### Step 5: Deploy Mode

When invoked as `/haiku:operate {intent} --deploy [target]`:

1. **Load stack configuration:**
   ```bash
   COMPUTE_LAYER=$(get_stack_layer "compute")
   PIPELINE_LAYER=$(get_stack_layer "pipeline")
   OPS_LAYER=$(get_stack_layer "operations")
   ```

2. **Read all agent-owned operations** from `.haiku/intents/{intent}/operations/`:
   ```bash
   OPS_DIR="$REPO_ROOT/.haiku/intents/${INTENT_SLUG}/operations"
   DEPLOY_DIR="$OPS_DIR/deploy"
   mkdir -p "$DEPLOY_DIR"
   ```

   For each `.md` file in `$OPS_DIR` where `owner: agent`:

3. **Determine deploy target** for each operation:

   First, parse the operation's type from its frontmatter:
   ```bash
   TYPE=$(dlc_frontmatter_get "type" "$op_file")
   ```

   If `$DEPLOY_TARGET` was explicitly provided (e.g., `/haiku:operate myapp --deploy github-actions`), use that for all operations. Otherwise derive from stack config using the `has_stack_provider` helper:

   ```bash
   # Determine from stack config using has_stack_provider helper
   if has_stack_provider "compute" "kubernetes"; then
     if [ "$TYPE" = "scheduled" ]; then
       TARGET="k8s-cronjob"
     else
       TARGET="k8s-deployment"
     fi
   elif has_stack_provider "compute" "docker-compose"; then
     TARGET="docker-compose"
   elif has_stack_provider "pipeline" "github-actions"; then
     TARGET="github-actions"
   else
     TARGET="none"
   fi
   ```

   Valid deploy targets: `k8s-cronjob`, `k8s-deployment`, `github-actions`, `docker-compose`, `systemd`
   <!-- systemd — explicit only (no stack auto-detection; use `--deploy systemd`) -->

4. **Generate manifest** per operation based on target. Write to `$DEPLOY_DIR/{operation-name}.{ext}`:

   #### k8s-cronjob (for scheduled operations)

   File: `$DEPLOY_DIR/{name}.cronjob.yaml`

   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   metadata:
     name: {operation-name}
     labels:
       app.kubernetes.io/managed-by: ai-dlc
       ai-dlc/intent: {intent-slug}
   spec:
     schedule: "{cron-expression}"
     jobTemplate:
       spec:
         template:
           spec:
             containers:
               - name: {operation-name}
                 image: {registry}/{image}
                 command: [{runtime-command}]
             restartPolicy: OnFailure
   ```

   #### k8s-deployment (for reactive operations)

   File: `$DEPLOY_DIR/{name}.deployment.yaml`

   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: {operation-name}
     labels:
       app.kubernetes.io/managed-by: ai-dlc
       ai-dlc/intent: {intent-slug}
   spec:
     replicas: 1
     selector:
       matchLabels:
         app: {operation-name}
     template:
       metadata:
         labels:
           app: {operation-name}
       spec:
         containers:
           - name: {operation-name}
             image: {registry}/{image}
             command: [{runtime-command}]
   ```

   #### github-actions (for scheduled operations)

   File: `$DEPLOY_DIR/{name}.workflow.yaml`

   ```yaml
   name: "operate: {operation-name}"
   on:
     schedule:
       - cron: '{cron-expression}'
     workflow_dispatch: {}
   jobs:
     run:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Run {operation-name}
           run: {runtime-command} .haiku/intents/{intent}/operations/{name}.{ext}
   ```

   > **Note:** GitHub Actions workflows must be in `.github/workflows/` on the default branch to trigger. Copy the generated manifest there and commit to activate.

   #### docker-compose

   File: `$DEPLOY_DIR/{name}.compose.yaml`

   ```yaml
   services:
     {operation-name}:
       build: .
       command: {runtime-command} .haiku/intents/{intent}/operations/{name}.{ext}
       labels:
         ai-dlc.managed-by: "true"
         ai-dlc.intent: "{intent-slug}"
   ```

   #### systemd (timer + service pair)

   File: `$DEPLOY_DIR/{name}.service`

   ```ini
   [Unit]
   Description={operation-name} operation (ai-dlc/{intent-slug})

   [Service]
   Type=oneshot
   ExecStart={runtime-command} {path-to-script}
   WorkingDirectory={repo-root}
   ```

   File: `$DEPLOY_DIR/{name}.timer`

   ```ini
   [Unit]
   Description={operation-name} timer (ai-dlc/{intent-slug})

   [Timer]
   OnCalendar={calendar-expression}
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

   If target is `none`, skip manifest generation and report:
   ```
   Skipping {operation-name}: no deploy target configured in stack.
   Configure a compute or pipeline provider in .haiku/settings.yml.
   ```

5. **Update status** for each deployed operation (using the loop iteration variable `$OP_NAME`, not the ad-hoc `$OPERATION_NAME`):
   ```bash
   OP_NAME=$(basename "$op_file" .md)
   STATUS_JSON=$(dlc_state_load "$INTENT_DIR" "operation-status.json" 2>/dev/null || echo '{"operations":{}}')
   UPDATED=$(echo "$STATUS_JSON" | jq \
     --arg name "$OP_NAME" \
     --arg target "$TARGET" \
     '.operations[$name] = ((.operations[$name] // {}) + {"deployed": true, "deploy_target": $target})')
   dlc_state_save "$INTENT_DIR" "operation-status.json" "$UPDATED"
   ```

6. **Report results:**
   ```markdown
   ## Deploy Results: {intent-slug}

   | Operation | Target | Manifest |
   |---|---|---|
   | {name} | {target} | {path-to-manifest} |

   Manifests written to `.haiku/intents/{intent}/operations/deploy/`.
   Review and apply these manifests to your infrastructure.
   ```

**Done.** Stop here for deploy mode.

### Step 6: Status Mode

When invoked as `/haiku:operate {intent} --status`:

1. **Load status data:**
   ```bash
   STATUS_JSON=$(dlc_state_load "$INTENT_DIR" "operation-status.json" 2>/dev/null || echo '{"operations":{}}')
   ```

2. **Load operation specs** from `.haiku/intents/{intent}/operations/*.md` to get schedule info

3. **For each operation, determine if overdue:**
   - If `last_run` is null and type is `scheduled` or `process`, mark as `pending`
   - Otherwise, compute elapsed seconds since `last_run` and compare against the expected interval with a 1.5x grace period

   **Frequency-to-interval mapping (in days):**

   | Frequency | Days |
   |---|---|
   | `daily` | 1 |
   | `weekly` | 7 |
   | `biweekly` | 14 |
   | `monthly` | 30 |
   | `quarterly` | 90 |
   | `annually` | 365 |

   **Cron heuristic:** For cron expressions, approximate the interval from the fields. Examples:
   - `*/5 * * * *` = 5 minutes
   - `0 * * * *` = 60 minutes (hourly)
   - `0 0 * * *` = 1440 minutes (daily)
   - `0 0 * * 0` = 10080 minutes (weekly)
   - `0 0 1 * *` = 43200 minutes (monthly)

   **Pseudocode:**
   ```bash
   # Map human-readable frequency to seconds
   freq_to_seconds() {
     case "$1" in
       daily)     echo $((1  * 86400)) ;;
       weekly)    echo $((7  * 86400)) ;;
       biweekly)  echo $((14 * 86400)) ;;
       monthly)   echo $((30 * 86400)) ;;
       quarterly) echo $((90 * 86400)) ;;
       annually)  echo $((365 * 86400)) ;;
       *)         echo 0 ;;  # unknown — skip overdue check
     esac
   }

   # Approximate cron interval in seconds (simple heuristic)
   cron_to_seconds() {
     local schedule="$1"
     # Handle @ shorthands before field parsing
     case "$schedule" in
       @yearly|@annually) echo 31536000; return ;;
       @monthly)          echo 2592000;  return ;;
       @weekly)           echo 604800;   return ;;
       @daily|@midnight)  echo 86400;    return ;;
       @hourly)           echo 3600;     return ;;
     esac
     local min hour dom mon dow
     read -r min hour dom mon dow <<< "$schedule"
     if [[ "$min" == \*/* ]]; then
       # */N pattern in minutes field
       echo $(( ${min#*/} * 60 ))
     elif [ "$hour" = "*" ] && [ "$dom" = "*" ]; then
       echo 3600        # hourly
     elif [ "$dom" = "*" ] && [ "$dow" = "*" ]; then
       echo 86400       # daily
     elif [ "$dom" = "*" ] && [ "$dow" != "*" ]; then
       echo 604800      # weekly
     elif [ "$dom" != "*" ] && [ "$mon" = "*" ]; then
       echo 2592000     # monthly
     else
       echo 7776000     # quarterly fallback
     fi
   }

   # Determine expected interval
   if [ -n "$FREQUENCY" ]; then
     EXPECTED=$(freq_to_seconds "$FREQUENCY")
   elif [ -n "$SCHEDULE" ]; then
     EXPECTED=$(cron_to_seconds "$SCHEDULE")
   else
     EXPECTED=0
   fi

   # Check overdue (1.5x grace period)
   if [ "$EXPECTED" -gt 0 ]; then
     NOW=$(date -u +%s)
     LAST=$(date -u -d "$LAST_RUN" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_RUN" +%s 2>/dev/null || echo 0)
     ELAPSED=$((NOW - LAST))
     GRACE=$(( EXPECTED * 3 / 2 ))   # 1.5x
     if [ "$ELAPSED" -gt "$GRACE" ]; then
       OP_STATUS="needs-attention"
     fi
   fi
   ```

   If the frequency/schedule is unrecognized or the interval is 0, skip the overdue check and keep the existing status.

4. **Display status table:**
   ```markdown
   ## Operation Status: {intent-slug}

   | Operation | Type | Owner | Last Run | Status | Exit Code | Deployed |
   |---|---|---|---|---|---|---|
   | {name} | {type} | {owner} | {last_run or "never"} | {status} | {exit_code or "-"} | {target or "no"} |

   ### Overdue Operations
   {list operations where status is needs-attention, with schedule and last-run}

   ### Deployed Operations
   {list operations with deployed: true, showing deploy_target}
   ```

   If no operations have status data:
   ```
   No operation status data found. Run /haiku:operate {intent} {operation} to execute
   operations and begin tracking status.
   ```

**Done.** Stop here for status mode.

### Step 7: Teardown Mode

When invoked as `/haiku:operate {intent} --teardown`:

1. **Confirm with the user before proceeding.** Teardown is destructive:
   ```markdown
   ## Teardown: {intent-slug}

   This will remove all deployment manifests and update operation status to "torn-down".
   Deployed resources must be removed manually using the commands shown below.

   **Operation specs and scripts will be preserved.**

   Proceed with teardown? (yes/no)
   ```

   **Wait for user confirmation.** If denied, stop.

2. **Load status** to find all deployed operations:
   ```bash
   STATUS_JSON=$(dlc_state_load "$INTENT_DIR" "operation-status.json" 2>/dev/null || echo '{"operations":{}}')
   DEPLOYED_OPS=$(echo "$STATUS_JSON" | jq -r '.operations | to_entries[] | select(.value.deployed == true) | .key')
   ```

3. **For each deployed operation**, display removal instructions based on `deploy_target`:

   - **k8s-cronjob / k8s-deployment:**
     ```
     kubectl delete -f .haiku/intents/{intent}/operations/deploy/{name}.cronjob.yaml
     ```
   - **github-actions:**
     ```
     Remove workflow file: .haiku/intents/{intent}/operations/deploy/{name}.workflow.yaml
     Delete from .github/workflows/ if copied there.
     ```
   - **docker-compose:**
     ```
     Remove service from compose file or delete: .haiku/intents/{intent}/operations/deploy/{name}.compose.yaml
     ```
   - **systemd:**
     ```
     systemctl disable {name}.timer
     rm /etc/systemd/system/{name}.timer /etc/systemd/system/{name}.service
     systemctl daemon-reload
     ```

4. **Remove manifest files** from the deploy directory:
   ```bash
   DEPLOY_DIR="$REPO_ROOT/.haiku/intents/${INTENT_SLUG}/operations/deploy"
   if [ -d "$DEPLOY_DIR" ]; then
     rm -rf "$DEPLOY_DIR"
   fi
   ```

5. **Update status** to `torn-down` for each deployed operation:
   ```bash
   for OP_NAME in $DEPLOYED_OPS; do
     STATUS_JSON=$(echo "$STATUS_JSON" | jq \
       --arg name "$OP_NAME" \
       '.operations[$name].status = "torn-down" |
        .operations[$name].deployed = false |
        .operations[$name].deploy_target = null')
   done
   dlc_state_save "$INTENT_DIR" "operation-status.json" "$STATUS_JSON"
   ```

6. **Report:**
   ```markdown
   ## Teardown Complete: {intent-slug}

   | Operation | Previous Target | Status |
   |---|---|---|
   | {name} | {target} | torn-down |

   Deploy manifests removed from `.haiku/intents/{intent}/operations/deploy/`.
   Operation specs and scripts have been preserved.
   ```

**Done.** Stop here for teardown mode.

### Step 8: Legacy Compatibility

If `.haiku/intents/{intent}/operations.md` exists but `.haiku/intents/{intent}/operations/` directory does not:

1. **Display deprecation warning:**
   ```markdown
   > **Warning:** Legacy `operations.md` format detected.
   > The per-file format in `.haiku/intents/{intent}/operations/` is now preferred.
   > Run `/haiku:operate {intent} --migrate` to convert automatically. *(coming soon)*
   ```

2. **Parse the legacy format.** Read `operations.md` and extract sections:
   - Frontmatter: `intent`, `created`, `status`
   - Sections: Recurring Tasks, Reactive Tasks, Manual Tasks

   ```bash
   LEGACY_STATUS=$(dlc_frontmatter_get "status" "$LEGACY_FILE")
   LEGACY_CREATED=$(dlc_frontmatter_get "created" "$LEGACY_FILE")
   ```

3. **Display the legacy operational overview:**
   ```markdown
   ## Operational Plan: {Intent Title} *(legacy format)*

   **Intent:** {intent-slug}
   **Status:** {status}
   **Created:** {created}

   ### Recurring Tasks
   {parse and display from markdown sections}

   ### Reactive Tasks
   {parse and display from markdown sections}

   ### Manual Tasks
   {parse and display from markdown sections}
   ```

4. **Agent and human task handling** works the same as before — parse tasks from the markdown sections, execute agent commands, display human checklists.

5. **Status tracking** still uses `operation-status.json` via `dlc_state_save`/`dlc_state_load`, same schema as the new format.

**Done.** Stop here for legacy mode.
