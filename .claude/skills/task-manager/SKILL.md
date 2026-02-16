---
name: task-manager
description: >
  Manage project tasks organized as folder-based units with TASK.md files.
  Use PROACTIVELY when the user mentions tasks, work items, assignments, priorities,
  or when planning, starting, completing, or reviewing work. Also use when an agent
  needs to determine what to work on next, check task status, or update task progress.
---

# Task Manager

A folder-based task management system for Claude Code projects. Tasks are self-contained
directories — each with a `TASK.md` file and optional reference materials — organized
by status into `active/`, `backlog/`, `completed/`, and `blocked/` directories.

This system mirrors the skill folder pattern: just as each skill is a folder with a
`SKILL.md`, each task is a folder with a `TASK.md`.

---

## Quick Reference

```
.claude/tasks/
├── TASKS.md              # Auto-generated registry (do not edit manually)
├── _templates/
│   └── TASK.md           # Template for new tasks
├── active/               # Currently being worked
├── backlog/              # Queued for future work
├── completed/            # Done
└── blocked/              # Waiting on dependencies
```

**Common operations** (via `.claude/scripts/task.sh`):

| Command | What it does |
|---------|-------------|
| `task create "Title" --assignee agent-name` | Scaffold a new task in `backlog/` |
| `task list` | List all tasks grouped by status |
| `task list --status active --assignee component-dev` | Filtered listing |
| `task next <agent-name>` | Get highest-priority unblocked task for an agent |
| `task move <id> <status>` | Move task between statuses |
| `task sync` | Regenerate `TASKS.md` from all task folders |
| `task view <id>` | Display a task's TASK.md |

---

## Task Folder Structure

Each task lives in its own directory named with kebab-case, ideally verb-noun:

```
build-contact-form/
├── TASK.md               # Required — defines the task
├── references/           # Optional — mockups, designs, inspiration
│   ├── contact-form-mockup.png
│   └── design-notes.md
├── context/              # Optional — specs, research, background docs
│   └── api-docs.md
└── deliverables/         # Optional — expected output examples or schemas
    └── expected-response.json
```

### Optional Subfolders

| Folder | Purpose | Typical Contents |
|--------|---------|-----------------|
| `references/` | Visual designs, mockups, and inspiration | Screenshots, Figma exports, example URLs, design system references |
| `context/` | Background research, specifications, and related documentation | API docs, architectural decision records, meeting notes, prior art |
| `deliverables/` | Expected output examples, schemas, or acceptance artifacts | Sample JSON, component API specs, expected file structures |

Only create subfolders when you have content for them. Most simple tasks only need `TASK.md`.

---

## TASK.md Format

Every task has a `TASK.md` with YAML frontmatter and a structured markdown body.

### Frontmatter Fields

```yaml
---
title: "Build Contact Form Component"
id: "TASK-042"
summary: "Create a reusable contact form with validation and email submission"
assignee: "component-developer"
priority: 1
status: "active"
created: "2026-02-07"
due: ""
tags: ["frontend", "forms", "svelte"]
depends_on: []
blocks: []
effort: "medium"
parent: ""
completed: ""
---
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `title` | Yes | string | Human-readable task name |
| `id` | Yes | string | Unique identifier, format `TASK-NNN` (auto-assigned) |
| `summary` | Yes | string | One-line description of the task (< 120 chars) |
| `assignee` | Yes | string | Agent/sub-agent name (must match `.claude/agents/` names) |
| `priority` | Yes | int | 1 (critical) → 4 (nice-to-have) |
| `status` | Yes | string | `backlog`, `active`, `blocked`, `completed` |
| `created` | Yes | date | ISO date when task was created |
| `due` | No | date | Target completion date |
| `tags` | No | list | Labels for filtering and grouping |
| `depends_on` | No | list | Task IDs this task is blocked by |
| `blocks` | No | list | Task IDs that depend on this task |
| `effort` | No | string | `small` / `medium` / `large` / `epic` |
| `parent` | No | string | Task ID if this is a subtask |
| `completed` | No | date | Date task was completed (auto-set on move) |

### Priority Scale

| Priority | Label | Use When |
|----------|-------|----------|
| 1 | Critical | Blocking other work, time-sensitive, or core functionality |
| 2 | High | Important feature or fix, should be done soon |
| 3 | Normal | Standard work, no urgency |
| 4 | Low | Nice-to-have, improvements, exploration |

### Effort Scale

| Effort | Rough Scope |
|--------|------------|
| `small` | < 1 hour, single file or minor change |
| `medium` | 1–4 hours, multiple files, moderate complexity |
| `large` | Half day+, multiple components, significant complexity |
| `epic` | Multi-day, should probably be broken into subtasks |

---

## TASK.md Body Structure

The body of every `TASK.md` follows this template:

```markdown
## Description

Detailed explanation of what this task involves, why it matters, and any
important context. Write as if briefing a developer with codebase access
but no prior context on this specific feature.

## Requirements

- [ ] Requirement one with clear, actionable language
- [ ] Requirement two
- [ ] Requirement three

## Acceptance Criteria

Testable conditions that define "done":

- Criterion one (specific, measurable)
- Criterion two
- Criterion three

## Technical Notes

_Optional._ Implementation guidance, architectural constraints, patterns
to follow, or cavebase-specific context.

## Subtasks

_Optional._ Break down complex work into ordered steps. Use when effort
is `large` or `epic`.

- [ ] Subtask one
- [ ] Subtask two
- [ ] Subtask three

## Log

Chronological notes appended during execution. Agents APPEND here,
never edit or delete previous entries.

- **YYYY-MM-DD** — Task created, assigned to <agent-name>
```

### Log Entry Conventions

Agents **must** append to the log when:
- Starting work on a task
- Completing a significant milestone or subtask
- Encountering a blocker or changing approach
- Handing off or being reassigned
- Completing the task

Format: `- **YYYY-MM-DD** — <what happened>`

This provides a paper trail for handoffs, debugging, and scope tracking.

---

## Status Lifecycle

Tasks move through statuses by physically relocating between directories:

```
backlog/ → active/ → completed/
              ↓ ↑
           blocked/
```

| Transition | When | Automated Actions |
|------------|------|-------------------|
| `backlog → active` | Agent begins work | Log entry appended |
| `active → blocked` | Dependency unmet or external blocker | Log entry with reason |
| `blocked → active` | Blocker resolved | Log entry appended |
| `active → completed` | All acceptance criteria met | `completed` date set, log entry |
| `active → backlog` | Deprioritized or paused | Log entry with reason |

**Status lives in the filesystem, not just frontmatter.** The `status` field in
frontmatter is kept in sync by `task move` and `task sync` for queryability,
but the source of truth is which directory the task folder lives in.

---

## Task Registry: TASKS.md

The `TASKS.md` file at `.claude/tasks/TASKS.md` is an **auto-generated** index.
Never edit it manually — run `task sync` to regenerate it.

It provides a scannable overview of all tasks grouped by status, sorted by
priority within each group. Agents should read this file to get a quick
picture of project state.

---

## Agent Workflow

### Starting Work

When an agent is invoked and needs to determine what to work on:

1. Read `.claude/tasks/TASKS.md` for an overview
2. Run `task next <my-agent-name>` to get the highest-priority unblocked task
3. Read the task's `TASK.md` and any files in `references/`, `context/`, `deliverables/`
4. Run `task move <id> active` if the task is in backlog
5. Append a log entry: `- **YYYY-MM-DD** — Started work`
6. Begin implementation

### During Work

- Check off requirements and subtasks in `TASK.md` as they're completed
- Append log entries for significant milestones or decisions
- If blocked, run `task move <id> blocked` and log the reason

### Completing Work

1. Verify all acceptance criteria are met
2. Append a final log entry summarizing what was done
3. Run `task move <id> completed`
4. Run `task sync` to update the registry

### Handoff / Reassignment

If a task needs to be reassigned:

1. Append a handoff log entry explaining current state, what's done, what's remaining
2. Update the `assignee` field in frontmatter
3. Run `task sync`

---

## Dependency Management

Tasks can declare dependencies via `depends_on` and `blocks` fields:

- `depends_on: ["TASK-038"]` — This task cannot start until TASK-038 is complete
- `blocks: ["TASK-045"]` — TASK-045 is waiting on this task

### Rules

- A task with unresolved `depends_on` entries should be in `blocked/` or `backlog/`
- `task next` automatically skips tasks with unresolved dependencies
- When a task completes, `task sync` checks if any blocked tasks can be unblocked
- Circular dependencies are flagged as validation errors by `task sync`

---

## Priority Tiebreaking

When multiple tasks share the same priority for the same assignee, `task next`
uses this tiebreaker order:

1. **Dependency depth** — Tasks that unblock the most other work go first
2. **Created date** — Older tasks first (prevent starvation)
3. **Effort** — Smaller tasks first (maintain momentum, clear the queue)

---

## Task Validation

`task sync` performs validation and warns about:

- Duplicate task IDs
- Orphaned dependency references (referencing IDs that don't exist)
- Assignees that don't match any agent in `.claude/agents/`
- Missing required frontmatter fields
- Tasks in `blocked/` with no `depends_on` entries
- Tasks in `active/` with unresolved `depends_on` entries
- Circular dependencies

---

## Git Integration

When working on tasks, follow these conventions:

- **Branch naming**: `task/<id>-<slug>` (e.g., `task/TASK-042-build-contact-form`)
- **Commit prefixes**: `[TASK-042] Add contact form validation`
- **PR titles**: `[TASK-042] Build contact form component`

This makes it easy to trace commits and PRs back to task context.

---

## Archival

To keep the working directories clean, periodically archive old completed tasks:

```bash
task archive --older-than 30
```

This moves completed tasks older than N days to `.claude/tasks/_archive/`.
Archived tasks are excluded from `TASKS.md` and `task list` but remain
searchable via `task search`.

---

## Creating Tasks

### Via Script

```bash
# Minimal
task create "Build contact form" --assignee component-developer

# Full options
task create "Build contact form" \
  --assignee component-developer \
  --priority 1 \
  --effort medium \
  --tags "frontend,forms,svelte" \
  --depends-on "TASK-038" \
  --due "2026-02-14" \
  --parent "TASK-030"
```

### Manually

1. Copy `.claude/tasks/_templates/TASK.md` to a new folder in `backlog/`
2. Name the folder with kebab-case verb-noun
3. Fill in the frontmatter and body
4. Run `task sync` to register it

---

## Receiving Task Creation Instructions

When a user or coordinator asks you to create tasks — whether from a high-level goal,
explicit list, design mockups, or specification document — follow this workflow.

### Step 1: Gather Context

Before creating anything, ensure you have:

1. **Read this skill** — You need the conventions, frontmatter schema, and folder structure
2. **Read available agents** — Scan `.claude/agents/` to know valid assignee names and each agent's expertise. Never assign a task to an agent that doesn't exist.
3. **Understand the input** — Identify what you've been given:
   - **Explicit task list** → User has defined the tasks; scaffold and flesh them out
   - **Goal or feature description** → You need to decompose into tasks
   - **Designs or mockups** → Extract tasks from visual requirements
   - **Specification document** → Parse into actionable work items

### Step 2: Propose Before Creating (Default Behavior)

Unless the user explicitly says "create these now" or "don't wait for approval,"
**always propose a task breakdown first.** Present a table like:

```
Proposed Tasks:

| # | Title                      | Assignee            | P | Effort | Depends On |
|---|----------------------------|---------------------|---|--------|------------|
| 1 | Build hero section         | component-developer | 1 | medium | —          |
| 2 | Create contact API route   | api-developer       | 1 | small  | —          |
| 3 | Add form validation        | component-developer | 2 | small  | #1         |

Shall I create these tasks, or would you like to adjust anything?
```

This prevents wasted work from misunderstood requirements. Only skip this step when:
- The user gave you an explicit, complete task list with all details
- The user said "just create them" or "don't ask, just do it"
- You are a sub-agent executing a pre-approved plan from a coordinator

### Step 3: Create the Tasks

For each task:

1. **Run `task create`** with title, assignee, priority, effort, tags, and dependencies
2. **Fill in the TASK.md body** — don't leave it as a skeleton. Write:
   - A thorough `## Description` with enough context for the assignee to work independently
   - Specific, actionable `## Requirements` as checkboxes
   - Testable `## Acceptance Criteria` that define "done" unambiguously
   - `## Technical Notes` if there are codebase patterns, constraints, or guidance relevant to the work
   - `## Subtasks` for large/epic tasks — break them into ordered steps
3. **Populate reference folders** when source material exists:
   - Copy mockups/screenshots to `references/`
   - Copy specs or API docs to `context/`
   - Add expected output examples to `deliverables/`

### Step 4: Establish Dependencies

Think about task ordering:
- What must be built before other things can start?
- Are there shared components or API contracts that gate downstream work?
- Can anything be parallelized across different agents?

Set `depends_on` and `blocks` fields to encode these relationships. Dependencies
should be as minimal as possible — only add them when there's a real build-order
constraint, not just a logical grouping.

### Step 5: Finalize

1. **Run `task sync`** to regenerate the registry and validate everything
2. **Review warnings** — fix any validation issues (orphaned deps, missing fields, unknown assignees)
3. **Report a summary** back to the user:
   - How many tasks were created
   - The dependency graph (what can start immediately vs. what's blocked)
   - Any decisions you made about assignees, priorities, or decomposition
   - Suggested starting point (which agent should pick up work first)

### Quality Checklist for Task Creation

Before considering task creation complete, verify:

- [ ] Every task has a unique, meaningful title (verb-noun format)
- [ ] Every Description is detailed enough for the assignee to work without asking questions
- [ ] Every Requirement is a single, checkable action (not compound)
- [ ] Every Acceptance Criterion is testable — someone could verify pass/fail
- [ ] Dependencies form a DAG (no circular references)
- [ ] Effort estimates are realistic (if something is `epic`, it should be broken into subtasks)
- [ ] Assignees match actual agents in `.claude/agents/`
- [ ] `task sync` reports zero warnings

### Decomposition Guidelines

When breaking a goal into tasks, aim for:

- **Right-sized tasks** — Each task should be completable in a single focused session. If a task feels like it needs multiple days, break it down further.
- **Clear ownership** — Each task has exactly one assignee. If work spans multiple agents, split it at the integration boundary.
- **Minimal coupling** — Tasks should be as independent as possible. Prefer tasks that can be worked in parallel over long dependency chains.
- **Vertical slices** — When possible, prefer tasks that deliver a thin end-to-end slice of functionality over horizontal layers (e.g., "Build login page with API" over separate "Build login UI" + "Build login API" unless the API serves multiple consumers).
- **Testable increments** — Every task should produce something that can be verified. Avoid tasks like "Research options" unless they have concrete deliverables (e.g., a decision document in `deliverables/`).

---

## Script Location

The task management script lives at `.claude/scripts/task.sh`.

To use it conveniently, agents can either call it directly:

```bash
bash .claude/scripts/task.sh <command> [args]
```

Or alias it (the script handles this):

```bash
alias task='bash .claude/scripts/task.sh'
```