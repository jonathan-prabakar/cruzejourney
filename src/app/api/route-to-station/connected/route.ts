import { isSameOrigin } from '@/lib/intelligence/origin.server';
import { createConnectedStationRoute, hydrateConnectedRoadPlans } from '@/lib/vehicle/connected-routing.server';
import { RoutingError } from '@/lib/integration/rerouting.server';
export const runtime = 'nodejs';
export const maxDuration = 45;
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Same-origin requests required.' }, { status: 401 });
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RoutingError('JSON required.');
    const reader = request.body?.getReader();
    if (!reader) throw new RoutingError('Routing request required.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > 16384) { await reader.cancel(); throw new RoutingError('Routing request too large.'); } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Object.keys(body).some(k => !['journeys', 'stationId'].includes(k)) || !Array.isArray(body.journeys) ||
      !body.journeys.length || body.journeys.length > 16 || typeof body.stationId !== 'string' || body.stationId.length > 100)
      throw new RoutingError('Invalid route selectors.');
    await hydrateConnectedRoadPlans(body.journeys, request.signal);
    return Response.json(await createConnectedStationRoute(body.journeys, body.stationId, { signal: request.signal }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof RoutingError ? error.message : 'Invalid or expired drive selectors.' },
      { status: error instanceof RoutingError ? error.status : 400 });
  }
}
