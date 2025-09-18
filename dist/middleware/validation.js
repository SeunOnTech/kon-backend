"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const errorHandler_1 = require("./errorHandler");
const validate = (schema) => {
    return (req, res, next) => {
        try {
            // Validate body
            if (schema.body) {
                for (const [field, rules] of Object.entries(schema.body)) {
                    const value = req.body[field];
                    const rule = rules;
                    if (rule.required && (value === undefined || value === null || value === '')) {
                        throw new errorHandler_1.CustomError(`${field} is required`, 400, 'VALIDATION_ERROR');
                    }
                    if (value !== undefined && rule.type && typeof value !== rule.type) {
                        throw new errorHandler_1.CustomError(`${field} must be of type ${rule.type}`, 400, 'VALIDATION_ERROR');
                    }
                }
            }
            // Validate query
            if (schema.query) {
                for (const [field, rules] of Object.entries(schema.query)) {
                    const value = req.query[field];
                    const rule = rules;
                    if (rule.required && (value === undefined || value === null || value === '')) {
                        throw new errorHandler_1.CustomError(`${field} is required`, 400, 'VALIDATION_ERROR');
                    }
                }
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.validate = validate;
