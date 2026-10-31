import { describe, expect, it, vi } from 'vitest';
import { createIntelligenceRequestHandler } from '../http.server';
import { context, model } from './fixtures';

function request(body: string, options: RequestInit = {}) {
  return new Request('http://localhost/api/intelligence/analyze', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, ...options,
  });
}
function handler(authorized = true) {
  const resolver = vi.fn(() => context());
  const generate = model();
  vi.spyOn(generate, 'generate');
  const handle = createIntelligenceRequestHandler({
    authorize: () => authorized, resolveContext: resolver, analysis: { model: generate },
  });
  return { handle, resolver, generate };
}
describe('framework-independent authenticated server boundary', () => {
  it('resolves trusted context server-side and returns a bounded no-store result', async () => {
    const { handle, resolver, generate } = handler();
    const response = await handle(request(JSON.stringify({ recordIndex: 0, forgedFuelRange: 999999 })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.source).toBe('gemma4');
    expect(JSON.stringify(body)).not.toContain('999999');
    expect(resolver).toHaveBeenCalledOnce();
    expect(generate.generate).toHaveBeenCalledOnce();
  });
  it('rejects unauthorized requests before reading data or calling a model', async () => {
    const { handle, resolver, generate } = handler(false);
    expect((await handle(request('{}'))).status).toBe(401);
    expect(resolver).not.toHaveBeenCalled(); expect(generate.generate).not.toHaveBeenCalled();
  });
  it('handles authorization failure without leaking the underlying error', async () => {
    const handle = createIntelligenceRequestHandler({
      authorize: () => { throw new Error('private auth secret'); }, resolveContext: () => context(),
    });
    const response = await handle(request('{}'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it('rejects malformed, oversize, wrong-method and wrong-content-type requests', async () => {
    const { handle, generate } = handler();
    expect((await handle(request('{'))).status).toBe(400);
    expect((await handle(request(JSON.stringify({ padding: 'x'.repeat(100001) })))).status).toBe(413);
    expect((await handle(new Request('http://localhost/api/intelligence/analyze'))).status).toBe(405);
    expect((await handle(request('{}', { headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect(generate.generate).not.toHaveBeenCalled();
  });
});
