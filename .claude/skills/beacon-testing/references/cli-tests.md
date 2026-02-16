# CLI Tests

## Table of Contents

- Temp directory pattern
- Testing `npx beacon init`
- Testing `npx beacon teardown`
- Testing `npx beacon pull`
- Spawning CLI commands in tests

---

## Temp Directory Pattern

CLI commands modify the filesystem. Tests must use isolated temporary
directories to avoid polluting the real project. Every test creates its
own directory and cleans it up afterward.

```typescript
// test/helpers.ts

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'beacon-test-'));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
```

The temp directory simulates a host SvelteKit project. Tests can
optionally seed it with files (package.json, .gitignore, etc.) to
match real-world conditions.

---

## Testing `npx beacon init`

The `init` command creates the `.beacon/` directory structure, writes
a default config, and appends to `.gitignore`.

```typescript
// cli/__tests__/init.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { createTempDir, removeTempDir } from '../../test/helpers.js';
import { runInit } from '../init.js';

describe('beacon init', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(cwd);
  });

  it('creates the .beacon directory structure', async () => {
    await runInit({ cwd });

    expect(existsSync(join(cwd, '.beacon'))).toBe(true);
    expect(existsSync(join(cwd, '.beacon', 'storage'))).toBe(true);
    expect(existsSync(join(cwd, '.beacon', 'storage', 'screenshots'))).toBe(true);
    expect(existsSync(join(cwd, '.beacon', 'storage', 'attachments'))).toBe(true);
  });

  it('creates a default config.json', async () => {
    await runInit({ cwd });

    const configPath = join(cwd, '.beacon', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(config).toHaveProperty('lastSyncAt');
  });

  it('appends .beacon/ to .gitignore', async () => {
    // Seed an existing .gitignore
    await writeFile(join(cwd, '.gitignore'), 'node_modules\n');

    await runInit({ cwd });

    const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.beacon/');
    expect(gitignore).toContain('node_modules'); // Didn't overwrite
  });

  it('creates .gitignore if it does not exist', async () => {
    await runInit({ cwd });

    const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.beacon/');
  });

  it('does not duplicate .beacon/ in .gitignore', async () => {
    await writeFile(join(cwd, '.gitignore'), 'node_modules\n.beacon/\n');

    await runInit({ cwd });

    const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8');
    const occurrences = gitignore.split('.beacon/').length - 1;
    expect(occurrences).toBe(1);
  });

  it('is idempotent — running twice is safe', async () => {
    await runInit({ cwd });
    await runInit({ cwd }); // Should not throw

    expect(existsSync(join(cwd, '.beacon'))).toBe(true);
  });
});
```

### Testing CLI Console Output

CLI commands print instructions and status messages. Capture stdout to
verify the output:

```typescript
it('prints integration instructions', async () => {
  const output: string[] = [];
  const mockConsole = { log: (msg: string) => output.push(msg) };

  await runInit({ cwd, console: mockConsole });

  const text = output.join('\n');
  expect(text).toContain('hooks.server.ts');
  expect(text).toContain('+layout.svelte');
});
```

This requires the CLI functions to accept a `console` parameter for
testability:

```typescript
// cli/init.js
export async function runInit({ cwd, console: con = console }) {
  // Use con.log instead of console.log
  con.log('✓ Created .beacon/ directory');
}
```

---

## Testing `npx beacon teardown`

The `teardown` command removes `.beacon/` and prints reminders.

```typescript
// cli/__tests__/teardown.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createTempDir, removeTempDir } from '../../test/helpers.js';
import { runTeardown } from '../teardown.js';

describe('beacon teardown', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempDir();
    // Seed a .beacon directory as if init had run
    await mkdir(join(cwd, '.beacon', 'storage', 'screenshots'), { recursive: true });
    await writeFile(join(cwd, '.beacon', 'config.json'), '{}');
    await writeFile(join(cwd, '.beacon', 'beacon.db'), ''); // Fake DB file
  });

  afterEach(async () => {
    await removeTempDir(cwd);
  });

  it('removes the .beacon directory', async () => {
    await runTeardown({ cwd, confirm: true });

    expect(existsSync(join(cwd, '.beacon'))).toBe(false);
  });

  it('does nothing without confirmation', async () => {
    await runTeardown({ cwd, confirm: false });

    expect(existsSync(join(cwd, '.beacon'))).toBe(true);
  });

  it('handles missing .beacon directory gracefully', async () => {
    await removeTempDir(join(cwd, '.beacon'));

    // Should not throw
    await runTeardown({ cwd, confirm: true });
  });

  it('prints removal reminder for integration points', async () => {
    const output: string[] = [];
    const mockConsole = { log: (msg: string) => output.push(msg) };

    await runTeardown({ cwd, confirm: true, console: mockConsole });

    const text = output.join('\n');
    expect(text).toContain('hooks.server.ts');
    expect(text).toContain('+layout.svelte');
  });
});
```

---

## Testing `npx beacon pull`

The `pull` command is the most complex CLI command. It makes HTTP requests
to a remote Beacon instance, downloads task data, and writes to the
local database and filesystem.

### Mocking the Remote API

```typescript
// cli/__tests__/pull.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createTempDir, removeTempDir } from '../../test/helpers.js';
import { runPull } from '../pull.js';

// Mock fetch for the remote API
const mockFetch = vi.fn();

describe('beacon pull', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempDir();
    // Seed .beacon directory
    await mkdir(join(cwd, '.beacon', 'storage', 'screenshots'), { recursive: true });
    await mkdir(join(cwd, '.beacon', 'storage', 'attachments'), { recursive: true });
    await writeFile(
      join(cwd, '.beacon', 'config.json'),
      JSON.stringify({ lastSyncAt: null })
    );

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(async () => {
    await removeTempDir(cwd);
    vi.restoreAllMocks();
  });

  it('downloads tasks from remote', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        exported_at: '2025-01-15T12:00:00Z',
        tasks: [
          {
            id: 'remote-1',
            type: 'bug',
            priority: 'high',
            status: 'backlog',
            description: 'Remote bug',
            admin_notes: [],
            attachments: [],
          },
        ],
      }),
    });

    await runPull({
      cwd,
      from: 'https://staging.myapp.com',
      token: 'test-token',
      fetch: mockFetch,
    });

    // Verify fetch was called with correct URL and auth
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/__beacon/api/tasks/export'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('writes attachments to storage directory', async () => {
    const fakeScreenshot = Buffer.from('PNG_DATA').toString('base64');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        exported_at: '2025-01-15T12:00:00Z',
        tasks: [
          {
            id: 'remote-1',
            type: 'bug',
            priority: 'high',
            status: 'backlog',
            description: 'With screenshot',
            admin_notes: [],
            attachments: [
              {
                type: 'screenshot',
                filename: 'capture.png',
                mime_type: 'image/png',
                data_base64: fakeScreenshot,
              },
            ],
          },
        ],
      }),
    });

    await runPull({
      cwd,
      from: 'https://staging.myapp.com',
      token: 'test-token',
      fetch: mockFetch,
    });

    // Verify a file was written in storage
    const storageDir = join(cwd, '.beacon', 'storage', 'screenshots');
    const files = await readFile(join(storageDir, 'capture.png'));
    expect(files.toString()).toBe('PNG_DATA');
  });

  it('updates lastSyncAt in config', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        exported_at: '2025-01-15T12:00:00Z',
        tasks: [],
      }),
    });

    await runPull({
      cwd,
      from: 'https://staging.myapp.com',
      token: 'test-token',
      fetch: mockFetch,
    });

    const config = JSON.parse(
      await readFile(join(cwd, '.beacon', 'config.json'), 'utf-8')
    );
    expect(config.lastSyncAt).toBe('2025-01-15T12:00:00Z');
  });

  it('reports error for failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const output: string[] = [];
    const mockConsole = {
      log: (msg: string) => output.push(msg),
      error: (msg: string) => output.push(msg),
    };

    await expect(
      runPull({
        cwd,
        from: 'https://staging.myapp.com',
        token: 'bad-token',
        fetch: mockFetch,
        console: mockConsole,
      })
    ).rejects.toThrow();
  });
});
```

---

## Spawning CLI Commands in Tests

For integration-level CLI tests, you can spawn the actual CLI binary
instead of calling the exported function:

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

it('npx beacon init runs successfully', async () => {
  const cwd = await createTempDir();

  try {
    const { stdout, stderr } = await execFileAsync(
      'node',
      [join(__dirname, '../../cli/index.js'), 'init'],
      { cwd }
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Created .beacon');
    expect(existsSync(join(cwd, '.beacon'))).toBe(true);
  } finally {
    await removeTempDir(cwd);
  }
});
```

Use this sparingly — function-level tests are faster and more precise.
Spawn-based tests are good for verifying the CLI entry point wiring
(argument parsing, subcommand dispatch) but slow for testing logic.
