import { existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Remove the .beacon/ directory.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory
 * @param {boolean} options.confirm - Skip confirmation (for non-interactive use)
 * @param {object} [options.console] - Console override for testing
 */
export async function runTeardown({ cwd, confirm = false, console: con = console }) {
	const beaconDir = join(cwd, '.beacon');

	if (!confirm) {
		con.log('Teardown cancelled. Pass --confirm to proceed.');
		return;
	}

	if (existsSync(beaconDir)) {
		rmSync(beaconDir, { recursive: true, force: true });
		con.log('✓ Removed .beacon/ directory');
	} else {
		con.log('No .beacon/ directory found — nothing to remove.');
	}

	con.log('');
	con.log('Remember to remove these integration points:');
	con.log('');
	con.log('1. Remove the beacon() call from src/hooks.server.ts');
	con.log('2. Remove <Beacon /> from src/routes/+layout.svelte');
	con.log('3. Run: npm uninstall svelte-beacon');
	con.log('');
}
