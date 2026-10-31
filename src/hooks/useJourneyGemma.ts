"use client";
import { useEffect, useMemo, useState } from 'react';
import { bridgeExistingGemmaCore } from '../lib/journey/gemma-core-bridge';
import { IntelligenceError } from '../lib/intelligence/errors';

export function useJourneyGemma(enabled = true) {
  const [availability, setAvailability] = useState<{ available: boolean; model: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    fetch('/api/intelligence', { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        if (!abort.signal.aborted) setAvailability({ available: data.available === true, model: typeof data.model === 'string' ? data.model : '' });
      }).catch(() => { if (!abort.signal.aborted) setAvailability({ available: false, model: '' }); });
    return () => abort.abort();
  }, [enabled]);
  const adapter = useMemo(() => enabled && availability?.available ? bridgeExistingGemmaCore(async (context, { signal }) => {
    // The compact core input carries journey facts, but the wire sends selectors only.
    const request = context.journey.connectedJourneys ? { journeys: context.journey.connectedJourneys } : {
      originId: context.journey.originId, destinationId: context.journey.destinationId,
      preferences: context.journey.preferences, waypoints: context.journey.waypoints,
      elapsedSeconds: context.journey.elapsedSeconds,
    };
    const response = await fetch('/api/intelligence/journey', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
    });
    if (!response.ok) throw new IntelligenceError(response.status === 429 ? 'RATE_LIMIT' : 'API_UNAVAILABLE');
    return response.json();
  }) : null, [availability?.available, enabled]);
  return { adapter, checking: enabled && availability === null, configured: availability?.available ?? false };
}
