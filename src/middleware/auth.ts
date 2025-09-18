import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomError } from './errorHandler';

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new CustomError('Access token required', 401, 'TOKEN_REQUIRED');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new CustomError('Invalid token', 401, 'INVALID_TOKEN');
    } else if (error instanceof jwt.TokenExpiredError) {
      throw new CustomError('Token expired', 401, 'TOKEN_EXPIRED');
    } else {
      throw new CustomError('Authentication failed', 401, 'AUTH_FAILED');
    }
  }
};