import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    code: err.code,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode: number = 500, code?: string): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function notFound(message: string = 'Resource not found'): AppError {
  return createError(message, 404, 'NOT_FOUND');
}

export function badRequest(message: string = 'Bad request'): AppError {
  return createError(message, 400, 'BAD_REQUEST');
}

export function unauthorized(message: string = 'Unauthorized'): AppError {
  return createError(message, 401, 'UNAUTHORIZED');
}

export function forbidden(message: string = 'Forbidden'): AppError {
  return createError(message, 403, 'FORBIDDEN');
}
