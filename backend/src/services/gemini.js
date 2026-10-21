import { GoogleGenerativeAI } from '@google/generative-ai';
import { env, isGeminiConfigured } from '../config/env.js';

let client;

function getClient() {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  if (!client) {
    client = new GoogleGenerativeAI(env.geminiApiKey);
  }
  return client;
}

/**
 * Send a text prompt to Gemini and return the model's text reply.
 * Used by future features (resume review, interview feedback, etc.).
 */
export async function generateGeminiText(prompt) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: env.geminiModel });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return text.trim();
}

export async function generateGeminiJson(prompt, responseSchema) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: env.geminiModel,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
