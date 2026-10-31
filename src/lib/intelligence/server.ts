/** Server entry only. Never import this file into client components. */
if (typeof window !== 'undefined') throw new Error('Vehicle intelligence server entry cannot run in a browser');
export { analyzeVehicleIntelligence } from './orchestrator.server';
export { createGemmaModel, DEFAULT_GEMMA_MODEL, SUPPORTED_GEMMA_MODELS } from './gemma.server';
export { createIntelligenceRequestHandler } from './http.server';
export type * from './types';
