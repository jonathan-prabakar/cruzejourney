import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ construct: vi.fn(), generate: vi.fn() }));
vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'minimal', HIGH: 'high' },
  GoogleGenAI: class {
    models = { generateContent: mocks.generate };
    constructor(options: unknown) { mocks.construct(options); }
  },
}));
import { VEHICLE_SYSTEM_INSTRUCTION } from '../prompts';
import { createGemmaModel } from '../gemma.server';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('official SDK adapter (mocked SDK)', () => {
  it('uses the exact hosted model, deadline, signal, and supported thinking setting', async () => {
    mocks.generate.mockResolvedValue({ text: '{}' });
    const adapter = createGemmaModel({ apiKey: 'test-key-never-real' });
    const abort = new AbortController();
    await adapter.generate('bounded prompt', abort.signal);
    expect(mocks.construct).toHaveBeenCalledWith({
      apiKey: 'test-key-never-real', httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } },
    });
    expect(mocks.generate).toHaveBeenCalledWith({
      model: 'gemma-4-26b-a4b-it', contents: 'bounded prompt',
      config: { abortSignal: abort.signal, systemInstruction: VEHICLE_SYSTEM_INSTRUCTION, temperature: 0.2, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'high' } },
    });
    const request = mocks.generate.mock.calls[0][0];
    expect(request.config).not.toHaveProperty('tools');
    expect(request.config).not.toHaveProperty('responseSchema');
  });
  it('uses minimal thinking only when explicitly selected for a simple check', async () => {
    mocks.generate.mockResolvedValue({ text: 'OK' });
    await createGemmaModel({ apiKey: 'test', thinkingLevel: 'minimal' }).generate('connectivity', new AbortController().signal);
    expect(mocks.generate.mock.calls[0][0].config.thinkingConfig.thinkingLevel).toBe('minimal');
  });
  it('rejects unexpected function calls instead of executing commands', async () => {
    mocks.generate.mockResolvedValue({ functionCalls: [{ name: 'drive' }], text: '' });
    await expect(createGemmaModel({ apiKey: 'test' }).generate('prompt', new AbortController().signal)).rejects.toThrow('decision validation');
  });
  it('unwraps only a complete outer JSON fence and preserves invalid surrounding prose for rejection', async () => {
    mocks.generate.mockResolvedValueOnce({ text: '`' + '``json\n{}\n`' + '``' });
    const adapter = createGemmaModel({ apiKey: 'test' });
    expect(await adapter.generate('prompt', new AbortController().signal)).toBe('{}');
    mocks.generate.mockResolvedValueOnce({ text: 'prose\n`' + '``json\n{}\n`' + '``' });
    expect(await adapter.generate('prompt', new AbortController().signal)).toContain('prose');
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
