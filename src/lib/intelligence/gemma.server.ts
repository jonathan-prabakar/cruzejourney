import process from 'node:process';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { IntelligenceError } from './errors';
import type { IntelligenceModel } from './types';

if (typeof window !== 'undefined') throw new Error('Gemma integration is server-only');

export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';
export const SUPPORTED_GEMMA_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'] as const;

/** Official SDK; application-managed constrained JSON, no native tool execution or schema assumptions. */
export function createGemmaModel(options: { apiKey?: string; model?: string } = {}): IntelligenceModel {
  const modelId = options.model ?? process.env.GEMMA_MODEL ?? DEFAULT_GEMMA_MODEL;
  if (!SUPPORTED_GEMMA_MODELS.some(m => m === modelId)) throw new IntelligenceError('UNKNOWN_MODEL');
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new IntelligenceError('MISSING_API_KEY');
  const client = new GoogleGenAI({
    apiKey, httpOptions: { timeout: 18000, retryOptions: { attempts: 1 } },
  });
  return {
    modelId,
    async generate(prompt, signal) {
      const response = await client.models.generateContent({
        model: modelId, contents: prompt,
        config: {
          abortSignal: signal,
          temperature: 0.2, maxOutputTokens: 2200,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });
      if (response.functionCalls?.length) throw new IntelligenceError('INVALID_OUTPUT');
      return response.text ?? '';
    },
  };
}
