#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
	case 'init':
		import('./init.js').then((m) => m.runInit({ cwd: process.cwd() }));
		break;
	case 'teardown':
		import('./teardown.js').then((m) => m.runTeardown({ cwd: process.cwd(), confirm: true }));
		break;
	case 'pull':
		import('./pull.js').then((m) => m.runPull({ cwd: process.cwd() }));
		break;
	default:
		console.log(`
svelte-beacon CLI

Commands:
  beacon init       Create .beacon/ directory and update .gitignore
  beacon teardown   Remove .beacon/ directory
  beacon pull       Pull tasks from a remote Beacon instance

Usage:
  npx beacon <command> [options]
`);
		if (command) {
			console.error(`Unknown command: ${command}`);
			process.exit(1);
		}
}
