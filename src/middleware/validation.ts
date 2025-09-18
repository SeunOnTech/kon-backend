import { Request, Response, NextFunction } from 'express';
import { CustomError } from './errorHandler';

export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate body
      if (schema.body) {
        for (const [field, rules] of Object.entries(schema.body)) {
          const value = req.body[field];
          const rule = rules as any;
          
          if (rule.required && (value === undefined || value === null || value === '')) {
            throw new CustomError(`${field} is required`, 400, 'VALIDATION_ERROR');
          }
          
          if (value !== undefined && rule.type && typeof value !== rule.type) {
            throw new CustomError(`${field} must be of type ${rule.type}`, 400, 'VALIDATION_ERROR');
          }
        }
      }

      // Validate query
      if (schema.query) {
        for (const [field, rules] of Object.entries(schema.query)) {
          const value = req.query[field];
          const rule = rules as any;
          
          if (rule.required && (value === undefined || value === null || value === '')) {
            throw new CustomError(`${field} is required`, 400, 'VALIDATION_ERROR');
          }
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};