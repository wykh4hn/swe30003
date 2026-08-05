import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApplicationContext } from '../infrastructure/ApplicationContext.ts';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Rebuilds the demonstration data set from scratch.
 *
 * Useful before recording the execution evidence: every screenshot then starts
 * from a known state, so the scenario walkthrough in the report is reproducible.
 */
async function main(): Promise<void> {
  const dataDirectory = process.env['SMARTFM_DATA'] ?? join(PROJECT_ROOT, 'data');
  const application = await ApplicationContext.create({ dataDirectory, forceReseed: true });

  console.log('[SmartFM] Demonstration data reset.');
  console.log(`[SmartFM] Data directory: ${dataDirectory}`);
  console.log(`[SmartFM] Loaded: ${await application.describe()}`);
}

main().catch((error: unknown) => {
  console.error('[SmartFM] Reset failed:', error);
  process.exit(1);
});
