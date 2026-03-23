/**
 * Authentication Routes
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const router = Router();

// In-memory store (replace with database in production)
const users: Map<string, { id: string; email: string; password: string; name: string }> = new Map();
const apiTokens: Map<string, { userId: string; name: string; createdAt: Date }> = new Map();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = Array.from(users.values()).find(u => u.email === data.email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = {
      id: uuidv4(),
      email: data.email,
      password: hashedPassword,
      name: data.name,
    };
    users.set(user.id, user);

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = Array.from(users.values()).find(u => u.email === data.email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

const DEV_USER = { id: 'dev-user-id', email: 'dev@localhost', name: 'Dev User' };

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
    if (isDev) {
      return res.json(DEV_USER);
    }
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = users.get(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * Create API token
 * POST /api/auth/tokens
 */
router.post('/tokens', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const jwtToken = authHeader.slice(7);
    const payload = jwt.verify(jwtToken, JWT_SECRET) as { userId: string };

    const tokenName = req.body.name || 'API Token';
    const apiToken = `hunt_${uuidv4().replace(/-/g, '')}`;

    apiTokens.set(apiToken, {
      userId: payload.userId,
      name: tokenName,
      createdAt: new Date(),
    });

    res.status(201).json({
      token: apiToken,
      name: tokenName,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * List API tokens
 * GET /api/auth/tokens
 */
router.get('/tokens', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const jwtToken = authHeader.slice(7);
    const payload = jwt.verify(jwtToken, JWT_SECRET) as { userId: string };

    const userTokens = Array.from(apiTokens.entries())
      .filter(([_, data]) => data.userId === payload.userId)
      .map(([token, data]) => ({
        token: `${token.slice(0, 10)}...`,
        name: data.name,
        createdAt: data.createdAt.toISOString(),
      }));

    res.json(userTokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * Revoke API token
 * DELETE /api/auth/tokens/:token
 */
router.delete('/tokens/:token', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const jwtToken = authHeader.slice(7);
    const payload = jwt.verify(jwtToken, JWT_SECRET) as { userId: string };

    // Find full token from partial
    const partialToken = req.params.token;
    const fullToken = Array.from(apiTokens.keys()).find(t => t.startsWith(partialToken.replace('...', '')));

    if (!fullToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const tokenData = apiTokens.get(fullToken);
    if (tokenData?.userId !== payload.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    apiTokens.delete(fullToken);
    res.status(204).send();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Export for auth middleware
export { users, apiTokens, JWT_SECRET };
export { router as authRouter };
