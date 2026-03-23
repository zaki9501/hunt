/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { users, apiTokens, JWT_SECRET } from '../routes/auth';

const DEV_USER_ID = 'dev-user-id';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // In development (or when NODE_ENV is unset, e.g. npm run dev), skip auth and use a dev user
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  if (isDev) {
    (req as any).userId = DEV_USER_ID;
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  // Check for Bearer token (JWT)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Check if it's an API token
    if (token.startsWith('hunt_')) {
      const tokenData = apiTokens.get(token);
      if (!tokenData) {
        res.status(401).json({ error: 'Invalid API token' });
        return;
      }

      (req as any).userId = tokenData.userId;
      next();
      return;
    }

    // JWT token
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = users.get(payload.userId);

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      (req as any).userId = payload.userId;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
    return;
  }

  res.status(401).json({ error: 'Invalid authorization format' });
}
