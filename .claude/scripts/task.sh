#!/usr/bin/env bash
#
# task.sh — Folder-based task management for Claude Code
#
# Usage: bash .claude/scripts/task.sh <command> [options]
#
# Commands:
#   create <title>     Create a new task in backlog/
#   list               List tasks grouped by status
#   next <agent>       Get highest-priority unblocked task for an agent
#   move <id> <status> Move a task to a new status
#   view <id>          Display a task's TASK.md
#   sync               Regenerate TASKS.md registry
#   archive            Move old completed tasks to _archive/
#   search <query>     Search tasks by keyword
#
set -eo pipefail
# Note: intentionally not using set -u (nounset) because bash 3.2 (macOS default)
# treats empty arrays as unbound variables, which breaks array iteration patterns.

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Resolve project root from script location.
# Script lives at <project>/.claude/scripts/task.sh → project root is 2 levels up.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TASKS_ROOT="${PROJECT_ROOT}/.claude/tasks"
TEMPLATES_DIR="${TASKS_ROOT}/_templates"
ARCHIVE_DIR="${TASKS_ROOT}/_archive"
REGISTRY="${TASKS_ROOT}/TASKS.md"
AGENTS_DIR="${PROJECT_ROOT}/.claude/agents"
STATUSES=("active" "backlog" "blocked" "completed")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
info() { echo "→ $*"; }
today() { date +%Y-%m-%d; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Cross-platform sed in-place edit (BSD vs GNU)
sed_i() {
    if sed --version >/dev/null 2>&1; then
        # GNU sed
        sed -i "$@"
    else
        # BSD sed (macOS)
        sed -i '' "$@"
    fi
}

# Get the next available task ID by scanning all existing tasks
next_id() {
    local max=0
    local num
    for status_dir in "${STATUSES[@]}"; do
        dir="${TASKS_ROOT}/${status_dir}"
        [[ -d "$dir" ]] || continue
        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue
            num=$(grep -m1 '^id:' "$task_dir/TASK.md" | sed 's/.*TASK-0*//' | sed 's/".*//' | tr -d '[:space:]')
            if [[ "$num" =~ ^[0-9]+$ ]] && (( num > max )); then
                max=$num
            fi
        done
    done
    # Also check archive
    if [[ -d "$ARCHIVE_DIR" ]]; then
        for task_dir in "$ARCHIVE_DIR"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue
            num=$(grep -m1 '^id:' "$task_dir/TASK.md" | sed 's/.*TASK-0*//' | sed 's/".*//' | tr -d '[:space:]')
            if [[ "$num" =~ ^[0-9]+$ ]] && (( num > max )); then
                max=$num
            fi
        done
    fi
    printf "TASK-%03d" $(( max + 1 ))
}

# Convert title to kebab-case slug
slugify() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

# Read a frontmatter field from a TASK.md file
read_field() {
    local file="$1" field="$2"
    # Handle array fields
    if [[ "$field" == "tags" || "$field" == "depends_on" || "$field" == "blocks" ]]; then
        sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | sed "s/^${field}://" | tr -d '[]"' | sed 's/^ *//'
    else
        sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | sed "s/^${field}://" | tr -d '"' | sed 's/^ *//'
    fi
}

# Find a task directory by ID across all status directories
find_task() {
    local id="$1"
    for status_dir in "${STATUSES[@]}"; do
        dir="${TASKS_ROOT}/${status_dir}"
        [[ -d "$dir" ]] || continue
        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue
            local task_id
            task_id=$(read_field "$task_dir/TASK.md" "id")
            if [[ "$task_id" == "$id" ]]; then
                echo "$task_dir"
                return 0
            fi
        done
    done
    # Check archive
    if [[ -d "$ARCHIVE_DIR" ]]; then
        for task_dir in "$ARCHIVE_DIR"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue
            local task_id
            task_id=$(read_field "$task_dir/TASK.md" "id")
            if [[ "$task_id" == "$id" ]]; then
                echo "$task_dir"
                return 0
            fi
        done
    fi
    return 1
}

# Get the current status directory a task is in
get_task_status() {
    local task_path="$1"
    for status in "${STATUSES[@]}"; do
        if [[ "$task_path" == *"/${status}/"* ]]; then
            echo "$status"
            return 0
        fi
    done
    if [[ "$task_path" == *"/_archive/"* ]]; then
        echo "archived"
        return 0
    fi
    return 1
}

# Update a frontmatter field in a TASK.md file
update_field() {
    local file="$1" field="$2" value="$3"
    if grep -q "^${field}:" "$file"; then
        # Field exists, replace it
        if [[ "$field" == "tags" || "$field" == "depends_on" || "$field" == "blocks" ]]; then
            sed_i "s|^${field}:.*|${field}: ${value}|" "$file"
        else
            sed_i "s|^${field}:.*|${field}: \"${value}\"|" "$file"
        fi
    else
        # Field doesn't exist, add it before the closing ---
        sed_i "/^---$/,/^---$/{
            /^---$/{
                N
                /^---\n---$/i\\
${field}: \"${value}\"
            }
        }" "$file"
    fi
}

# Append a log entry to a TASK.md
append_log() {
    local file="$1" message="$2"
    echo "- **$(today)** — ${message}" >> "$file"
}

# Check if a task's dependencies are all resolved
deps_resolved() {
    local file="$1"
    local deps
    deps=$(read_field "$file" "depends_on")
    [[ -z "$deps" ]] && return 0

    # Parse comma-separated dependency IDs
    IFS=',' read -ra dep_list <<< "$deps"
    for dep in "${dep_list[@]}"; do
        dep=$(echo "$dep" | tr -d '[:space:]')
        [[ -z "$dep" ]] && continue
        local dep_dir
        dep_dir=$(find_task "$dep" 2>/dev/null) || { return 1; }
        local dep_status
        dep_status=$(get_task_status "$dep_dir")
        if [[ "$dep_status" != "completed" && "$dep_status" != "archived" ]]; then
            return 1
        fi
    done
    return 0
}

# Count how many tasks a given task transitively unblocks
blocking_depth() {
    local id="$1" depth=0
    for status_dir in "${STATUSES[@]}"; do
        dir="${TASKS_ROOT}/${status_dir}"
        [[ -d "$dir" ]] || continue
        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue
            local deps
            deps=$(read_field "$task_dir/TASK.md" "depends_on")
            if echo "$deps" | grep -q "$id"; then
                depth=$((depth + 1))
            fi
        done
    done
    echo "$depth"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_create() {
    local title="" assignee="" priority=3 effort="medium" tags="" depends_on="" due="" parent=""

    # Parse arguments
    [[ $# -lt 1 ]] && die "Usage: task create <title> [--assignee NAME] [--priority N] [--effort SIZE] [--tags TAG1,TAG2] [--depends-on ID] [--due DATE] [--parent ID]"
    title="$1"; shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --assignee)   assignee="$2"; shift 2 ;;
            --priority)   priority="$2"; shift 2 ;;
            --effort)     effort="$2"; shift 2 ;;
            --tags)       tags="$2"; shift 2 ;;
            --depends-on) depends_on="$2"; shift 2 ;;
            --due)        due="$2"; shift 2 ;;
            --parent)     parent="$2"; shift 2 ;;
            *)            die "Unknown option: $1" ;;
        esac
    done

    [[ -z "$assignee" ]] && die "Assignee is required. Use --assignee <agent-name>"

    local id slug task_dir task_file
    id=$(next_id)
    slug=$(slugify "$title")
    task_dir="${TASKS_ROOT}/backlog/${slug}"
    task_file="${task_dir}/TASK.md"

    [[ -d "$task_dir" ]] && die "Task directory already exists: ${task_dir}"

    mkdir -p "$task_dir"

    # Format tags as YAML list
    local tags_yaml="[]"
    if [[ -n "$tags" ]]; then
        tags_yaml="[$(echo "$tags" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/' )]"
    fi

    # Format depends_on as YAML list
    local deps_yaml="[]"
    if [[ -n "$depends_on" ]]; then
        deps_yaml="[$(echo "$depends_on" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/' )]"
    fi

    # Build the TASK.md from template
    cat > "$task_file" << ENDTASK
---
title: "${title}"
id: "${id}"
summary: ""
assignee: "${assignee}"
priority: ${priority}
status: "backlog"
created: "$(today)"
due: "${due}"
tags: ${tags_yaml}
depends_on: ${deps_yaml}
blocks: []
effort: "${effort}"
parent: "${parent}"
completed: ""
---

## Description

<!-- Describe the task in detail -->

## Requirements

- [ ] 

## Acceptance Criteria

- 

## Technical Notes

## Log

- **$(today)** — Task created, assigned to ${assignee}
ENDTASK

    info "Created ${id}: ${title}"
    info "Location: ${task_dir}"
    info "Edit ${task_file} to add description, requirements, and acceptance criteria"
}

cmd_list() {
    local filter_status="" filter_assignee="" filter_priority="" filter_tag=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --status)   filter_status="$2"; shift 2 ;;
            --assignee) filter_assignee="$2"; shift 2 ;;
            --priority) filter_priority="$2"; shift 2 ;;
            --tag)      filter_tag="$2"; shift 2 ;;
            *)          die "Unknown option: $1" ;;
        esac
    done

    local statuses_to_show=("${STATUSES[@]}")
    if [[ -n "$filter_status" ]]; then
        statuses_to_show=("$filter_status")
    fi

    for status in "${statuses_to_show[@]}"; do
        local dir="${TASKS_ROOT}/${status}"
        [[ -d "$dir" ]] || continue

        local count=0
        local lines=()

        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue

            local file="$task_dir/TASK.md"
            local id title assignee priority effort

            id=$(read_field "$file" "id")
            title=$(read_field "$file" "title")
            assignee=$(read_field "$file" "assignee")
            priority=$(read_field "$file" "priority")
            effort=$(read_field "$file" "effort")

            # Apply filters
            [[ -n "$filter_assignee" && "$assignee" != "$filter_assignee" ]] && continue
            [[ -n "$filter_priority" && "$priority" != "$filter_priority" ]] && continue
            if [[ -n "$filter_tag" ]]; then
                local tags
                tags=$(read_field "$file" "tags")
                echo "$tags" | grep -q "$filter_tag" || continue
            fi

            lines+=("$(printf "  %-10s P%-1s  %-8s %-24s %s" "$id" "$priority" "$effort" "$assignee" "$title")")
            count=$((count + 1))
        done

        # Sort lines by priority (field after the ID)
        if (( count > 0 )); then
            echo ""
            echo "━━━ $(echo "$status" | tr '[:lower:]' '[:upper:]') (${count}) ━━━"
            printf '%s\n' "${lines[@]}" | sort -t'P' -k2 -n
        fi
    done
    echo ""
}

cmd_next() {
    [[ $# -lt 1 ]] && die "Usage: task next <agent-name>"
    local agent="$1"
    local best_dir="" best_priority=99 best_created="9999-99-99" best_effort_rank=99 best_depth=0

    effort_to_rank() {
        case "$1" in
            small) echo 1 ;;
            medium) echo 2 ;;
            large) echo 3 ;;
            epic) echo 4 ;;
            *) echo 2 ;;
        esac
    }

    # Check active tasks first — if agent already has active work, return that
    for task_dir in "${TASKS_ROOT}/active"/*/; do
        [[ -d "$task_dir" ]] || continue
        [[ -f "$task_dir/TASK.md" ]] || continue
        local file="$task_dir/TASK.md"
        local assignee
        assignee=$(read_field "$file" "assignee")
        if [[ "$assignee" == "$agent" ]]; then
            local id title
            id=$(read_field "$file" "id")
            title=$(read_field "$file" "title")
            echo "ACTIVE: ${id} — ${title}"
            echo "Path: ${task_dir}"
            return 0
        fi
    done

    # Then check backlog for best candidate
    for task_dir in "${TASKS_ROOT}/backlog"/*/; do
        [[ -d "$task_dir" ]] || continue
        [[ -f "$task_dir/TASK.md" ]] || continue
        local file="$task_dir/TASK.md"
        local assignee priority created effort id

        assignee=$(read_field "$file" "assignee")
        [[ "$assignee" != "$agent" ]] && continue

        # Check dependencies
        deps_resolved "$file" || continue

        priority=$(read_field "$file" "priority")
        created=$(read_field "$file" "created")
        effort=$(read_field "$file" "effort")
        id=$(read_field "$file" "id")

        local effort_rank depth
        effort_rank=$(effort_to_rank "$effort")
        depth=$(blocking_depth "$id")

        # Compare: priority → blocking depth (desc) → created → effort
        local is_better=false
        if (( priority < best_priority )); then
            is_better=true
        elif (( priority == best_priority )); then
            if (( depth > best_depth )); then
                is_better=true
            elif (( depth == best_depth )); then
                if [[ "$created" < "$best_created" ]]; then
                    is_better=true
                elif [[ "$created" == "$best_created" ]] && (( effort_rank < best_effort_rank )); then
                    is_better=true
                fi
            fi
        fi

        if $is_better; then
            best_dir="$task_dir"
            best_priority=$priority
            best_created="$created"
            best_effort_rank=$effort_rank
            best_depth=$depth
        fi
    done

    if [[ -n "$best_dir" ]]; then
        local id title
        id=$(read_field "$best_dir/TASK.md" "id")
        title=$(read_field "$best_dir/TASK.md" "title")
        echo "NEXT: ${id} — ${title}"
        echo "Path: ${best_dir}"
    else
        echo "No available tasks for ${agent}"
        return 1
    fi
}

cmd_move() {
    [[ $# -lt 2 ]] && die "Usage: task move <id> <status>"
    local id="$1" new_status="$2"

    # Validate status
    local valid=false
    for s in "${STATUSES[@]}"; do
        [[ "$s" == "$new_status" ]] && valid=true
    done
    $valid || die "Invalid status: ${new_status}. Must be one of: ${STATUSES[*]}"

    local task_dir
    task_dir=$(find_task "$id") || die "Task not found: ${id}"

    local current_status
    current_status=$(get_task_status "$task_dir")
    [[ "$current_status" == "$new_status" ]] && { info "${id} is already in ${new_status}"; return 0; }

    local folder_name
    folder_name=$(basename "$task_dir")
    local new_dir="${TASKS_ROOT}/${new_status}/${folder_name}"

    mkdir -p "${TASKS_ROOT}/${new_status}"
    mv "$task_dir" "$new_dir"

    local task_file="${new_dir}/TASK.md"

    # Update status in frontmatter
    update_field "$task_file" "status" "$new_status"

    # Set completed date if moving to completed
    if [[ "$new_status" == "completed" ]]; then
        update_field "$task_file" "completed" "$(today)"
        append_log "$task_file" "Task completed"
    else
        append_log "$task_file" "Moved to ${new_status}"
    fi

    info "Moved ${id} → ${new_status}"

    # Check if any blocked tasks can be unblocked
    if [[ "$new_status" == "completed" ]]; then
        for blocked_dir in "${TASKS_ROOT}/blocked"/*/; do
            [[ -d "$blocked_dir" ]] || continue
            [[ -f "$blocked_dir/TASK.md" ]] || continue
            if deps_resolved "$blocked_dir/TASK.md"; then
                local blocked_id
                blocked_id=$(read_field "$blocked_dir/TASK.md" "id")
                local blocked_name
                blocked_name=$(basename "$blocked_dir")
                info "Unblocking ${blocked_id} — dependencies resolved"
                mv "$blocked_dir" "${TASKS_ROOT}/backlog/${blocked_name}"
                update_field "${TASKS_ROOT}/backlog/${blocked_name}/TASK.md" "status" "backlog"
                append_log "${TASKS_ROOT}/backlog/${blocked_name}/TASK.md" "Unblocked — dependency ${id} completed"
            fi
        done
    fi
}

cmd_view() {
    [[ $# -lt 1 ]] && die "Usage: task view <id>"
    local id="$1"
    local task_dir
    task_dir=$(find_task "$id") || die "Task not found: ${id}"
    cat "${task_dir}/TASK.md"
}

cmd_sync() {
    info "Syncing task registry..."

    local warnings=()
    local known_ids=()
    local all_deps=()

    # Collect known agent names
    local known_agents=()
    if [[ -d "$AGENTS_DIR" ]]; then
        for agent_file in "$AGENTS_DIR"/*.md; do
            [[ -f "$agent_file" ]] || continue
            local agent_name
            agent_name=$(grep -m1 '^name:' "$agent_file" | sed 's/^name://' | tr -d '[:space:]"')
            [[ -n "$agent_name" ]] && known_agents+=("$agent_name")
        done
    fi

    # Use temp files instead of associative arrays (bash 3 compat)
    local tmpdir
    tmpdir=$(mktemp -d)
    for status in "${STATUSES[@]}"; do
        : > "${tmpdir}/${status}.lines"
    done

    # Helper: capitalize first letter (bash 3 compatible)
    _capitalize() { echo "$1" | awk '{print toupper(substr($0,1,1)) substr($0,2)}'; }

    for status in "${STATUSES[@]}"; do
        local dir="${TASKS_ROOT}/${status}"
        [[ -d "$dir" ]] || continue

        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue

            local file="$task_dir/TASK.md"
            local id title assignee priority effort depends_on summary

            id=$(read_field "$file" "id")
            title=$(read_field "$file" "title")
            assignee=$(read_field "$file" "assignee")
            priority=$(read_field "$file" "priority")
            effort=$(read_field "$file" "effort")
            depends_on=$(read_field "$file" "depends_on")
            summary=$(read_field "$file" "summary")

            # Validate required fields
            [[ -z "$id" ]] && warnings+=("${task_dir}: Missing id")
            [[ -z "$title" ]] && warnings+=("${task_dir}: Missing title")
            [[ -z "$assignee" ]] && warnings+=("${task_dir}: Missing assignee")

            # Check for duplicate IDs
            for known_id in "${known_ids[@]}"; do
                [[ "$known_id" == "$id" ]] && warnings+=("Duplicate task ID: ${id}")
            done
            known_ids+=("$id")

            # Validate assignee against known agents
            if [[ ${#known_agents[@]} -gt 0 && -n "$assignee" ]]; then
                local agent_found=false
                for a in "${known_agents[@]}"; do
                    [[ "$a" == "$assignee" ]] && agent_found=true
                done
                $agent_found || warnings+=("${id}: Assignee '${assignee}' not found in ${AGENTS_DIR}/")
            fi

            # Track dependencies for validation
            if [[ -n "$depends_on" ]]; then
                IFS=',' read -ra dep_list <<< "$depends_on"
                for dep in "${dep_list[@]}"; do
                    dep=$(echo "$dep" | tr -d '[:space:]')
                    [[ -n "$dep" ]] && all_deps+=("${id}:${dep}")
                done
            fi

            # Validate blocked tasks have depends_on
            if [[ "$status" == "blocked" && -z "$depends_on" ]]; then
                warnings+=("${id}: In blocked/ but has no depends_on entries")
            fi

            # Ensure frontmatter status matches directory
            local fm_status
            fm_status=$(read_field "$file" "status")
            if [[ "$fm_status" != "$status" ]]; then
                update_field "$file" "status" "$status"
                info "Fixed status mismatch for ${id}: ${fm_status} → ${status}"
            fi

            # Build line for registry — append to temp file
            printf "| %-10s | %-40s | %-24s | %-8s | %-8s | %-14s |\n" \
                "$id" "$title" "$assignee" "$priority" "$effort" "$depends_on" \
                >> "${tmpdir}/${status}.lines"
        done
    done

    # Validate dependency references
    for dep_entry in "${all_deps[@]}"; do
        local from_id="${dep_entry%%:*}"
        local to_id="${dep_entry##*:}"
        local found=false
        for known_id in "${known_ids[@]}"; do
            [[ "$known_id" == "$to_id" ]] && found=true
        done
        $found || warnings+=("${from_id}: depends_on '${to_id}' — task not found")
    done

    # Generate TASKS.md
    cat > "$REGISTRY" << 'HEADER'
# Task Registry

> **Auto-generated** — do not edit manually. Run `task sync` to update.

HEADER
    echo "Last updated: $(now_iso)" >> "$REGISTRY"
    echo "" >> "$REGISTRY"

    for status in "active" "backlog" "blocked" "completed"; do
        local count
        count=$(grep -c "^|" "${tmpdir}/${status}.lines" 2>/dev/null) || count=0

        echo "## $(_capitalize "$status") (${count})" >> "$REGISTRY"
        echo "" >> "$REGISTRY"

        if (( count > 0 )); then
            echo "| ID         | Title                                    | Assignee                 | Priority | Effort   | Depends On     |" >> "$REGISTRY"
            echo "|------------|------------------------------------------|--------------------------|----------|----------|----------------|" >> "$REGISTRY"
            sort -t'|' -k4 -n "${tmpdir}/${status}.lines" >> "$REGISTRY"
        else
            echo "_No tasks_" >> "$REGISTRY"
        fi
        echo "" >> "$REGISTRY"
    done

    # Cleanup temp files
    rm -rf "$tmpdir"

    # Print warnings
    if [[ ${#warnings[@]} -gt 0 ]]; then
        echo "" >> "$REGISTRY"
        echo "## Validation Warnings" >> "$REGISTRY"
        echo "" >> "$REGISTRY"
        for w in "${warnings[@]}"; do
            echo "- ⚠️  ${w}" >> "$REGISTRY"
            warn "$w"
        done
    fi

    info "Registry updated: ${REGISTRY}"
    info "Found ${#known_ids[@]} tasks, ${#warnings[@]} warnings"
}

cmd_archive() {
    local days=30

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --older-than) days="$2"; shift 2 ;;
            *)            die "Unknown option: $1" ;;
        esac
    done

    mkdir -p "$ARCHIVE_DIR"

    local count=0
    local cutoff_date
    cutoff_date=$(date -d "-${days} days" +%Y-%m-%d 2>/dev/null || date -v-${days}d +%Y-%m-%d 2>/dev/null)

    for task_dir in "${TASKS_ROOT}/completed"/*/; do
        [[ -d "$task_dir" ]] || continue
        [[ -f "$task_dir/TASK.md" ]] || continue

        local completed_date
        completed_date=$(read_field "$task_dir/TASK.md" "completed")
        [[ -z "$completed_date" ]] && continue

        if [[ "$completed_date" < "$cutoff_date" || "$completed_date" == "$cutoff_date" ]]; then
            local folder_name
            folder_name=$(basename "$task_dir")
            local id
            id=$(read_field "$task_dir/TASK.md" "id")
            mv "$task_dir" "${ARCHIVE_DIR}/${folder_name}"
            info "Archived ${id} (completed ${completed_date})"
            count=$((count + 1))
        fi
    done

    info "Archived ${count} tasks (completed > ${days} days ago)"
}

cmd_search() {
    [[ $# -lt 1 ]] && die "Usage: task search <query>"
    local query="$1"

    echo "Searching for: ${query}"
    echo ""

    for status_dir in "${STATUSES[@]}" "_archive"; do
        local dir="${TASKS_ROOT}/${status_dir}"
        [[ -d "$dir" ]] || continue

        for task_dir in "$dir"/*/; do
            [[ -d "$task_dir" ]] || continue
            [[ -f "$task_dir/TASK.md" ]] || continue

            if grep -qil "$query" "$task_dir/TASK.md"; then
                local id title status
                id=$(read_field "$task_dir/TASK.md" "id")
                title=$(read_field "$task_dir/TASK.md" "title")
                printf "  %-10s [%-9s] %s\n" "$id" "$status_dir" "$title"
            fi
        done
    done
}

cmd_help() {
    cat << 'EOF'
task.sh — Folder-based task management for Claude Code

USAGE:
  task <command> [options]

COMMANDS:
  create <title> [opts]     Create a new task in backlog/
    --assignee NAME           Agent to assign (required)
    --priority N              1-4, default 3
    --effort SIZE             small/medium/large/epic, default medium
    --tags TAG1,TAG2          Comma-separated tags
    --depends-on ID1,ID2      Comma-separated dependency IDs
    --due DATE                Due date (YYYY-MM-DD)
    --parent ID               Parent task ID

  list [opts]               List tasks grouped by status
    --status STATUS           Filter by status
    --assignee NAME           Filter by assignee
    --priority N              Filter by priority
    --tag TAG                 Filter by tag

  next <agent>              Get highest-priority unblocked task for an agent

  move <id> <status>        Move task to active/backlog/blocked/completed

  view <id>                 Display a task's TASK.md

  sync                      Regenerate TASKS.md registry and validate

  archive [opts]            Archive old completed tasks
    --older-than N            Days threshold (default 30)

  search <query>            Search tasks by keyword

EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Ensure tasks directory exists
mkdir -p "${TASKS_ROOT}"/{active,backlog,blocked,completed}

command="${1:-help}"
shift 2>/dev/null || true

case "$command" in
    create)  cmd_create "$@" ;;
    list)    cmd_list "$@" ;;
    next)    cmd_next "$@" ;;
    move)    cmd_move "$@" ;;
    view)    cmd_view "$@" ;;
    sync)    cmd_sync ;;
    archive) cmd_archive "$@" ;;
    search)  cmd_search "$@" ;;
    help|--help|-h) cmd_help ;;
    *)       die "Unknown command: ${command}. Run 'task help' for usage." ;;
esac