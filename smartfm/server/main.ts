import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApplicationContext } from './infrastructure/ApplicationContext.ts';
import { HttpServer } from './api/HttpServer.ts';
import { DEMO_PASSWORD } from './infrastructure/SeedData.ts';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 4000;

/**
 * Program entry point.
 *
 * Runs the bootstrap sequence documented on `ApplicationContext`, then starts
 * the application server. Nothing else happens here — keeping the entry point
 * this small is what lets the self-test suite build the very same context
 * without starting a web server.
 */
async function main(): Promise<void> {
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);
  const dataDirectory = process.env['SMARTFM_DATA'] ?? join(PROJECT_ROOT, 'data');
  const staticRoot = join(PROJECT_ROOT, 'dist');

  const application = await ApplicationContext.create({ dataDirectory });
  const server = new HttpServer(application, staticRoot);
  await server.listen(port);

  const banner = [
    '',
    '  SmartFM — Smart Fleet Management System',
    '  SWE30003 Assignment 3, Group 1 — ABC-Trans',
    '  ------------------------------------------------------------------',
    `  Application server : http://localhost:${port}`,
    `  Data directory     : ${dataDirectory}`,
    `  Data set           : ${await application.describe()}`,
    `  Seeded this run    : ${application.seeded ? 'yes (first run)' : 'no (existing data reused)'}`,
    `  REST endpoints     : ${server.routeTable().length}`,
    `  Demo password      : ${DEMO_PASSWORD} (all seeded accounts)`,
    '  ------------------------------------------------------------------',
    '  Browser client     : run `npm run dev` (port 5173, proxies /api here)',
    '                       or `npm run build` then reload this port.',
    '  Stop the server    : press Ctrl+C',
    '',
  ].join('\n');
  console.log(banner);

  const shutdown = async (): Promise<void> => {
    console.log('\n[SmartFM] Shutting down. All data is already persisted under data/.');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('[SmartFM] Failed to start:', error);
  process.exit(1);
});
