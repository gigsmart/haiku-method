---
status: completed
depends_on: [unit-02-haiku-core-plugin]
branch: ai-dlc/methodology-evolution/03-operation-phase
discipline: backend
workflow: ""
ticket: ""
---

# unit-03: Operation Phase

## Description
Implement the Operation phase in the H•AI•K•U core plugin. During Execution, the executor produces an `operations.md` file that defines what needs to happen to run and manage what was built. The `/operate` skill reads this plan and automates its tasks. Operational items can be recurring (scheduled), reactive (triggered by conditions), or manual (human-performed with AI guidance).

## Discipline
backend

## Domain Entities
- Operational Plan, Phase (Operation), Hat (operator)

## Data Sources
- H•AI•K•U core plugin (unit-02 output) — the plugin infrastructure to extend
- AI-DLC paper lines 1002-1052 — current thin Operation description
- Discovery log — analysis of missing Operation implementation

## Technical Specification

### operations.md Format
Produced during Execution, lives in `.haiku/{intent-slug}/operations.md`:

```markdown
---
intent: {intent-slug}
created: {ISO date}
status: active
---

# Operational Plan: {Intent Title}

## Recurring Tasks
- name: "Weekly metrics review"
  schedule: "weekly"
  owner: human
  description: "Review dashboard metrics and flag anomalies"

- name: "Daily health check"
  schedule: "daily"
  owner: agent
  command: "./scripts/health-check.sh"
  description: "Automated health check with alert on failure"

## Reactive Tasks
- name: "Error spike response"
  trigger: "error_rate > 5%"
  owner: agent
  command: "./scripts/investigate-errors.sh"
  description: "Investigate and report on error spikes"

## Manual Tasks
- name: "Stakeholder update"
  frequency: "bi-weekly"
  owner: human
  description: "Present progress and gather feedback"
  checklist:
    - Prepare summary of outcomes
    - Schedule meeting with stakeholders
    - Document decisions and action items

## Completion Criteria
- [ ] All recurring tasks running on schedule
- [ ] Reactive triggers configured and tested
- [ ] Manual task owners notified of responsibilities
```

### /operate Skill
```
skills/operate/SKILL.md
```

The `/operate` skill:
1. Reads `operations.md` from the intent directory
2. Displays the operational plan to the user
3. For `owner: agent` tasks: can execute them directly or schedule reminders
4. For `owner: human` tasks: provides guidance, checklists, and reminders
5. Tracks operational status in intent state (`iteration.json` extended with `operationStatus`)
6. Can trigger a new Elaboration if operational findings suggest changes needed

### Operator Hat (`hats/operator.md`)
The operator hat:
- Reviews the operational plan produced during Execution
- Validates that all tasks are actionable and assigned
- For automated tasks: verifies commands exist and can run
- For manual tasks: ensures descriptions and checklists are clear
- Reports operational readiness status

### State Extension
Extend `iteration.json` with operation tracking:
```json
{
  "phase": "operation",
  "operationStatus": "active|monitoring|complete",
  "operationalTasks": {
    "weekly-metrics-review": { "lastRun": "...", "status": "on-track" },
    "daily-health-check": { "lastRun": "...", "status": "passing" }
  }
}
```

### Integration with Execution Phase
The executor hat (during Execution) is instructed to produce `operations.md` as part of its deliverables. This is a prompt-level instruction in the executor hat definition, not a code-level enforcement — the executor naturally produces the operational plan alongside the work output.

## Success Criteria
- [ ] `/operate` skill exists and reads operational plans
- [ ] `operations.md` format supports recurring, reactive, and manual task types
- [ ] Operator hat validates operational readiness
- [ ] Agent-owned tasks can be executed via the `/operate` skill
- [ ] Human-owned tasks display guidance and checklists
- [ ] Operation status tracked in intent state
- [ ] Works in both git and folder storage modes

## Risks
- **Scope creep into automation**: Operation could become a full automation platform. Mitigation: keep it focused on plan execution and status tracking, not scheduling infrastructure.
- **Over-specifying tasks**: Users may not always need operational plans. Mitigation: operations.md is optional — if Execution doesn't produce one, Operation phase is skipped.

## Boundaries
This unit implements Operation. It does NOT implement Reflection (unit-04). It does NOT modify how Execution works beyond adding the operations.md output instruction to the executor hat.

## Notes
- For cowork (folder) mode, "automated" tasks may just mean "documented commands the user can run" rather than truly scheduled
- The Operation phase should be lightweight — not a full ops platform, just a structured way to manage post-execution activities
- Consider integration with configured comms providers (Slack) for reminders
