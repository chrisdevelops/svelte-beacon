# svelte-beacon

Contextual feedback collection and AI-assisted resolution for SvelteKit applications.

> ⚠️ **Early development** — not yet published to npm.

## What is this?

Svelte Beacon captures user feedback in context — screenshots, element selectors, browser metadata — and provides a dashboard for managing tasks and an AI agent for executing them. It integrates into any SvelteKit app with two lines of code.

## Installation

```bash
npm install -D svelte-beacon
npx beacon init
```

## Integration

**1. Handle hook** (`src/hooks.server.ts`):

```typescript
import { beacon } from 'svelte-beacon/server';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';

export const handle = sequence(
  beacon({
    enabled: true,
    mode: dev ? 'development' : 'deployed',
  }),
);
```

**2. Widget component** (`src/routes/+layout.svelte`):

```svelte
<script>
  import { Beacon } from 'svelte-beacon';
</script>

<Beacon />

<slot />
```

## Development

```bash
# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Run tests
npm test

# Build everything
npm run build
```

## License

MIT
