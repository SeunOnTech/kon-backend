import { Response } from 'express';
import logger from '../config/logger';

export class BaseController {
  protected successResponse(res: Response, data: any, message: string, statusCode: number = 200): void {
    res.status(statusCode).json({
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    });
  }

  protected errorResponse(res: Response, error: any, statusCode: number = 500): void {
    logger.error('Controller error:', error);
    
    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }

  protected handleError(error: any, res: Response): void {
    if (error instanceof Error && 'statusCode' in error) {
      this.errorResponse(res, error, (error as any).statusCode);
    } else {
      this.errorResponse(res, error);
    }
  }
}