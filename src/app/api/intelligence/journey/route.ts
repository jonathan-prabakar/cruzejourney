import { createIntelligenceRequestHandler } from '@/lib/intelligence/http.server';
import { isSameOrigin } from '@/lib/intelligence/origin.server';
import { resolveJourneyContextWithRoads } from '@/lib/journey/context.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createIntelligenceRequestHandler({
  authorize: isSameOrigin,
  resolveContext: async (body, request) => (await resolveJourneyContextWithRoads(body, request.signal)).core,
});
