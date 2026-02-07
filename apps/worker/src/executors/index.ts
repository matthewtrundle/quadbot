export * from './types.js';
export * from './registry.js';
export * from './gsc-index-request.js';
export * from './gsc-inspection.js';
export * from './gsc-sitemap-notify.js';

import { registerExecutor } from './registry.js';
import { gscIndexRequestExecutor } from './gsc-index-request.js';
import { gscInspectionExecutor } from './gsc-inspection.js';
import { gscSitemapNotifyExecutor } from './gsc-sitemap-notify.js';

/**
 * Register all executors with the registry.
 * Call this during worker initialization.
 */
export function registerAllExecutors(): void {
  registerExecutor(gscIndexRequestExecutor);
  registerExecutor(gscInspectionExecutor);
  registerExecutor(gscSitemapNotifyExecutor);
}
