import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ construct: vi.fn(), generate: vi.fn() }));
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'minimal' },
  GoogleGenAI: class {
    models = { generateContent: mocks.generate };
    constructor(options: unknown) { mocks.construct(options); }
  },
}));
import { createGemmaModel } from '../gemma.server';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('official SDK adapter (mocked SDK)', () => {
  it('uses the exact hosted model, deadline, signal, and supported thinking setting', async () => {
    mocks.generate.mockResolvedValue({ text: '{}' });
    const adapter = createGemmaModel({ apiKey: 'test-key-never-real' });
    const abort = new AbortController();
    await adapter.generate('bounded prompt', abort.signal);
    expect(mocks.construct).toHaveBeenCalledWith({
      apiKey: 'test-key-never-real', httpOptions: { timeout: 18000, retryOptions: { attempts: 1 } },
    });
    expect(mocks.generate).toHaveBeenCalledWith({
      model: 'gemma-4-26b-a4b-it', contents: 'bounded prompt',
      config: { abortSignal: abort.signal, temperature: 0.2, maxOutputTokens: 2200, thinkingConfig: { thinkingLevel: 'minimal' } },
    });
    const request = mocks.generate.mock.calls[0][0];
    expect(request.config).not.toHaveProperty('tools');
    expect(request.config).not.toHaveProperty('responseSchema');
  });
  it('rejects unexpected function calls instead of executing commands', async () => {
    mocks.generate.mockResolvedValue({ functionCalls: [{ name: 'drive' }], text: '' });
    await expect(createGemmaModel({ apiKey: 'test' }).generate('prompt', new AbortController().signal)).rejects.toThrow('decision validation');
  });
  it('requires a key and rejects unverified model IDs', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(() => createGemmaModel()).toThrow('not configured');
    expect(() => createGemmaModel({ apiKey: 'test', model: 'invented' })).toThrow('unsupported');
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it('keeps the browser entry independent of the SDK and blocks the server entry in a browser', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    await expect(import('../index')).resolves.toHaveProperty('IntelligenceController');
    await expect(import('../server')).rejects.toThrow('server-only');
    expect(mocks.construct).not.toHaveBeenCalled();
  });
});
