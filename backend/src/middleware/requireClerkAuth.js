import { verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';

export async function requireClerkAuth(req, res, next) {
  if (!env.clerkSecretKey) {
    res.status(503).json({ error: 'Authentication is not configured.' });
    return;
  }

  const authorization = req.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: 'Sign in is required.' });
    return;
  }

  try {
    const claims = await verifyToken(token, {
      secretKey: env.clerkSecretKey,
      authorizedParties: [env.corsOrigin],
    });
    if (typeof claims.sub !== 'string' || !claims.sub) {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return;
    }

    req.auth = { userId: claims.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
}