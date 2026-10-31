/** Browser-safe contracts, context helpers and event controller. SDK/env access is server.ts only. */
export type * from './types';
export { IntelligenceController, getEventFingerprint } from './triggers';
export { prepareIntelligenceContext, getCoolantStatus } from './context';
export { buildFallback } from './fallback';
