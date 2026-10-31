import { createIntelligenceRequestHandler } from '@/lib/intelligence/http.server';
import { isSameOrigin } from '@/lib/intelligence/origin.server';
import { resolveJourneyContext } from '@/lib/journey/context.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createIntelligenceRequestHandler({
  authorize: isSameOrigin,
  resolveContext: body => resolveJourneyContext(body).core,
});
