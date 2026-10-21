import { Router } from 'express';
import { env, isGeminiConfigured } from '../config/env.js';
import { generateGeminiText } from '../services/gemini.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    configured: isGeminiConfigured(),
    model: env.geminiModel,
  });
});

/**
 * Development-only smoke test — confirms the API key works.
 * Disabled in production to avoid open proxy abuse.
 */
router.post('/dev-test', async (req, res) => {
  if (env.nodeEnv === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Gemini is not configured. Set GEMINI_API_KEY in backend/.env' });
    return;
  }

  const userMessage =
    typeof req.body?.message === 'string' && req.body.message.trim()
      ? req.body.message.trim().slice(0, 500)
      : 'Reply with exactly: Gemini connection OK';

  try {
    const reply = await generateGeminiText(userMessage);
    res.json({ ok: true, reply });
  } catch (error) {
    console.error('Gemini dev-test failed:', error);
    res.status(502).json({
      ok: false,
      error: 'Gemini request failed. Check your API key, model name, and billing/quota.',
    });
  }
});

export default router;
