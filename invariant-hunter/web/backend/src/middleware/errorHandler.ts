/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const NotFoundError = (resource: string) => 
  new ApiError(`${resource} not found`, 404);

export const UnauthorizedError = () => 
  new ApiError('Unauthorized', 401);

export const ForbiddenError = () => 
  new ApiError('Forbidden', 403);

export const BadRequestError = (message: string) => 
  new ApiError(message, 400);
