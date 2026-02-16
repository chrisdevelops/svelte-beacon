# Task Manager Quick Reference

## Task Lifecycle

```
backlog/ ──→ active/ ──→ completed/
                ↕
            blocked/
```

## Commands Cheat Sheet

```bash
# Alias for convenience
alias task='bash .claude/scripts/task.sh'

# Create
task create "Build login page" --assignee component-developer --priority 1 --effort medium

# View & list
task list                                    # All tasks by status
task list --status active                    # Only active
task list --assignee api-developer           # Filter by agent
task next component-developer                # What should I work on?
task view TASK-001                           # Show full TASK.md

# Move
task move TASK-001 active                    # Start working
task move TASK-001 blocked                   # Hit a blocker
task move TASK-001 completed                 # Done!

# Maintenance
task sync                                    # Rebuild registry + validate
task archive --older-than 30                 # Clean up old completed tasks
task search "stripe"                         # Find tasks by keyword
```

## Priority Scale

| P | Label    | Use When                              |
|---|----------|---------------------------------------|
| 1 | Critical | Blocking others, time-sensitive, core  |
| 2 | High     | Important, should be done soon         |
| 3 | Normal   | Standard work, no urgency              |
| 4 | Low      | Nice-to-have, improvements             |

## Effort Scale

| Effort | Scope                                    |
|--------|------------------------------------------|
| small  | < 1 hour, single file                    |
| medium | 1–4 hours, multiple files                |
| large  | Half day+, multiple components           |
| epic   | Multi-day, break into subtasks           |

## Folder Structure per Task

```
task-name/
├── TASK.md          # Required
├── references/      # Mockups, designs, inspiration
├── context/         # Specs, research, background
└── deliverables/    # Expected outputs, schemas
```

## Git Conventions

- Branch: `task/TASK-042-build-contact-form`
- Commit: `[TASK-042] Add contact form validation`
- PR: `[TASK-042] Build contact form component`
