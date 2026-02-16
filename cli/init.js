import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

/**
 * Initialize the .beacon/ directory structure.
 * Safe to run multiple times (idempotent).
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory (host project root)
 * @param {object} [options.console] - Console override for testing
 */
export async function runInit({ cwd, console: con = console }) {
	const beaconDir = join(cwd, '.beacon');
	const storageDir = join(beaconDir, 'storage');
	const screenshotsDir = join(storageDir, 'screenshots');
	const attachmentsDir = join(storageDir, 'attachments');
	const configPath = join(beaconDir, 'config.json');
	const gitignorePath = join(cwd, '.gitignore');

	// Create directory structure
	for (const dir of [beaconDir, storageDir, screenshotsDir, attachmentsDir]) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}
	con.log('✓ Created .beacon/ directory structure');

	// Create default config
	if (!existsSync(configPath)) {
		writeFileSync(configPath, JSON.stringify({ lastSyncAt: null }, null, 2));
		con.log('✓ Created .beacon/config.json');
	}

	// Update .gitignore
	if (existsSync(gitignorePath)) {
		const content = readFileSync(gitignorePath, 'utf-8');
		if (!content.includes('.beacon/')) {
			appendFileSync(gitignorePath, '\n# Svelte Beacon local data\n.beacon/\n');
			con.log('✓ Added .beacon/ to .gitignore');
		}
	} else {
		writeFileSync(gitignorePath, '# Svelte Beacon local data\n.beacon/\n');
		con.log('✓ Created .gitignore with .beacon/');
	}

	con.log('');
	con.log('Next steps — add these two integration points:');
	con.log('');
	con.log('1. src/hooks.server.ts:');
	con.log('');
	con.log("   import { beacon } from 'svelte-beacon/server';");
	con.log("   import { sequence } from '@sveltejs/kit/hooks';");
	con.log("   import { dev } from '$app/environment';");
	con.log('');
	con.log('   export const handle = sequence(');
	con.log("     beacon({ enabled: true, mode: dev ? 'development' : 'deployed' }),");
	con.log('   );');
	con.log('');
	con.log('2. src/routes/+layout.svelte:');
	con.log('');
	con.log("   import { Beacon } from 'svelte-beacon';");
	con.log('');
	con.log('   <Beacon />');
	con.log('');
}
