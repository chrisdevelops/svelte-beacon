# svelte-beacon

Contextual feedback collection and AI-assisted resolution for SvelteKit applications.

Svelte Beacon captures user feedback in context — screenshots, element selectors, browser metadata — and provides a dashboard for managing tasks and an AI agent for executing them. It integrates into any SvelteKit app with two lines of code.

## Features

- **Feedback widget** — floating button with type/priority selectors, description field, and email capture
- **Screenshot annotation** — capture and annotate screenshots with brush, arrow, and text tools
- **Element selector** — point-and-click to identify specific UI elements
- **AI-assisted descriptions** — Anthropic-powered suggestion to improve feedback quality
- **Task dashboard** — admin interface at `/__beacon/` with filters, bulk actions, and activity logs
- **AI agent** — Claude Code integration for automated task execution with git branch/PR workflow
- **CLI sync** — pull tasks from a remote Beacon instance for local development

## Requirements

- SvelteKit 2
- Svelte 5
- Node.js 18+

## Quick Start

### 1. Install

```bash
npm install svelte-beacon
npx beacon init
```

The `init` command creates a `.beacon/` directory for the local database and adds it to `.gitignore`.

### 2. Add the handle hook

In `src/hooks.server.ts`:

```typescript
import { beacon } from 'svelte-beacon/server';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';

export const handle = sequence(
  beacon({
    enabled: true,
    mode: dev ? 'development' : 'deployed',
  }),
  // ...your other hooks
);
```

### 3. Add the widget component

In `src/routes/+layout.svelte`:

```svelte
<script>
  import { Beacon } from 'svelte-beacon';
  let { children } = $props();
</script>

{@render children()}
<Beacon />
```

That's it. Visit your app and click the feedback button in the bottom-right corner. Access the dashboard at `/__beacon/`.

## Configuration

The `beacon()` function accepts a `BeaconOptions` object:

```typescript
beacon({
  enabled: true,
  mode: 'development',
  database: 'file:.beacon/beacon.db',
  databaseAuthToken: undefined,
  adminEmails: ['admin@example.com'],
  widget: {
    screenshot: true,
    elementSelector: true,
    aiAssist: true,
    requireEmail: false,
    position: 'bottom-right',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxDurationMinutes: 30,
    requireTestsForBugs: true,
    createPR: false,
  },
})
```

### Mode defaults

| Option | `development` | `deployed` |
|--------|--------------|------------|
| Auth required | No | Yes |
| Screenshot capture | Yes | No |
| Element selector | Yes | Yes |
| AI assist | Yes (if API key) | No |
| Email required | No | No |

## Dashboard

Access the dashboard at `/__beacon/` in your running app. It provides:

- Task list with status, type, and priority filters
- Task detail drawer with status transitions, admin notes, and activity log
- Media tab for viewing screenshots and attachments
- AI controls for starting/stopping the Claude Code agent
- Bulk actions for updating or deleting multiple tasks

In `deployed` mode, the dashboard requires authentication via magic link email sent to addresses in the `adminEmails` list.

## CLI Commands

```bash
# Initialize Beacon in your project
npx beacon init

# Remove Beacon from your project
npx beacon teardown

# Pull tasks from a remote Beacon instance
npx beacon pull --remote https://example.com --token <bearer-token>
```

## AI Features

### Layer 1: Widget Assist

When an `anthropicApiKey` is configured, the widget offers AI-assisted description improvement. The AI analyzes the feedback context (type, priority, page URL, selected element) and suggests a more detailed description.

### Layer 2: Agent

When the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) is installed, the dashboard can start an AI agent to work on tasks. The agent:

1. Analyzes the task and project context
2. Creates a git branch
3. Implements changes using Claude Code
4. Runs verification (TypeScript, tests, linting)
5. Optionally creates a pull request

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Enables AI widget assist (Layer 1) and agent (Layer 2) |
| `BEACON_DATABASE` | Override database URL (default: `file:.beacon/beacon.db`) |
| `BEACON_AUTH_TOKEN` | Database auth token for Turso connections |

## Uninstallation

```bash
npx beacon teardown
```

This removes the `.beacon/` directory and its `.gitignore` entry. Then remove the `beacon()` call from your hook and the `<Beacon />` component from your layout.

## License

[MIT](LICENSE)
