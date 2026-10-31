import process from 'node:process';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { VEHICLE_SYSTEM_INSTRUCTION } from './prompts';
import { IntelligenceError } from './errors';
import type { IntelligenceModel } from './types';

if (typeof window !== 'undefined') throw new Error('Gemma integration is server-only');

import { DEFAULT_GEMMA_MODEL, SUPPORTED_GEMMA_MODELS, hasGeminiApiKey } from './configuration';
export { DEFAULT_GEMMA_MODEL, SUPPORTED_GEMMA_MODELS } from './configuration';

/** Official SDK; application-managed constrained JSON, no native tool execution or schema assumptions. */
export function createGemmaModel(options: { apiKey?: string; model?: string; thinkingLevel?: 'high' | 'minimal' } = {}): IntelligenceModel {
  const modelId = (options.model ?? process.env.GEMMA_MODEL)?.trim() || DEFAULT_GEMMA_MODEL;
  if (!SUPPORTED_GEMMA_MODELS.some(m => m === modelId)) throw new IntelligenceError('UNKNOWN_MODEL');
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!hasGeminiApiKey(apiKey)) throw new IntelligenceError('MISSING_API_KEY');
  const client = new GoogleGenAI({
    apiKey: apiKey?.trim(), httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } },
  });
  return {
    modelId,
    async generate(prompt, signal, thinkingLevel = options.thinkingLevel ?? 'high') {
      const response = await client.models.generateContent({
        model: modelId, contents: prompt,
        config: {
          abortSignal: signal,
          systemInstruction: VEHICLE_SYSTEM_INSTRUCTION,
          temperature: 0.2, maxOutputTokens: thinkingLevel === 'minimal' ? 2200 : 8192,
          thinkingConfig: { thinkingLevel: thinkingLevel === 'minimal' ? ThinkingLevel.MINIMAL : ThinkingLevel.HIGH },
        },
      });
      if (response.functionCalls?.length) throw new IntelligenceError('INVALID_OUTPUT');
      const text = response.text ?? '';
      // Hosted Gemma may wrap valid JSON despite the no-markdown instruction.
      // Accept only one complete outer JSON fence; all schema/fact checks remain strict.
      const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text.trim());
      return fenced ? fenced[1].trim() : text;
    },
  };
}
