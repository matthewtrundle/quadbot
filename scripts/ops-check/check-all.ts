import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { printSummary } from './lib/helpers.js';
import { checkInfra } from './check-infra.js';
import { checkBrandFlow } from './check-brand-flow.js';
import { checkJobTrigger } from './check-job-trigger.js';
import { checkActionApproval } from './check-action-approval.js';
import { checkMetricSnapshot } from './check-metric-snapshot.js';
import { checkExternalApis } from './check-external-apis.js';
import { isWebAppRunning } from './lib/api-client.js';
import { cleanupAllTestBrands } from './lib/test-brand.js';

type Tier = 'infra' | 'flow' | 'full';

async function main() {
  const arg = process.argv[2] as Tier | undefined;
  const tier: Tier = arg || 'full';

  console.log('QuadBot Operational Check');
  console.log('========================');
  console.log('');

  // Tier 1: Infrastructure (always runs)
  await checkInfra();

  if (tier === 'infra') {
    const failed = printSummary();
    process.exit(failed > 0 ? 1 : 0);
  }

  // Tier 2: Brand flow + job trigger + action approval (needs web app)
  const webRunning = await isWebAppRunning();
  if (!webRunning) {
    console.log('');
    console.log('Web app not detected at localhost:3000. Skipping API-dependent checks.');
    console.log('Start with `pnpm dev` for full testing.');
    console.log('');
  }

  if (webRunning) {
    await checkBrandFlow();
    await checkJobTrigger();
    await checkActionApproval();
  }

  if (tier === 'flow') {
    // Cleanup and exit
    const cleaned = await cleanupAllTestBrands();
    if (cleaned > 0) console.log(`Cleaned up ${cleaned} test brands`);
    const failed = printSummary();
    process.exit(failed > 0 ? 1 : 0);
  }

  // Tier 3: Full (metric snapshot + external APIs)
  if (webRunning) {
    await checkMetricSnapshot();
  }
  await checkExternalApis();

  // Final cleanup
  const cleaned = await cleanupAllTestBrands();
  if (cleaned > 0) console.log(`Cleaned up ${cleaned} test brands`);

  const failed = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
