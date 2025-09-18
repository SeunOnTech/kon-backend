import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export class CustomError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'CustomError';
  }
}

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Error:', error);

  if (error instanceof CustomError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: error.code
      },
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND'
    },
    timestamp: new Date().toISOString()
  });
};