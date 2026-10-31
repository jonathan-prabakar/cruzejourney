export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';
export const SUPPORTED_GEMMA_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'] as const;

export function hasGeminiApiKey(value: string | undefined): boolean {
  const key = value?.trim();
  return Boolean(key && !/^(your[\s_-]|replace|changeme|example|placeholder|insert|paste|todo|<|\.{3})/i.test(key));
}

/** Configuration readiness is not proof of a successful inference. Returns no credentials. */
export function gemmaConfiguration(env: Record<string, string | undefined>) {
  const model = env.GEMMA_MODEL?.trim() || DEFAULT_GEMMA_MODEL;
  const supported = SUPPORTED_GEMMA_MODELS.some(m => m === model);
  const configured = hasGeminiApiKey(env.GEMINI_API_KEY);
  return {
    available: configured && supported,
    model: supported ? model : 'unsupported',
    status: !configured ? 'API_KEY_MISSING' : !supported ? 'MODEL_UNAVAILABLE' : 'CONFIGURED_NOT_TESTED',
    message: !configured ? 'Set GEMINI_API_KEY in the server environment or ignored .env.local.'
      : !supported ? 'Set GEMMA_MODEL to a supported Gemma 4 model ID.'
      : 'Server configuration is present. Live access is confirmed only by a successful request.',
  };
}
