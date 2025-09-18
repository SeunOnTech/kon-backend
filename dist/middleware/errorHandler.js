"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = exports.CustomError = void 0;
const logger_1 = __importDefault(require("../config/logger"));
class CustomError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'CustomError';
    }
}
exports.CustomError = CustomError;
const errorHandler = (error, req, res, next) => {
    logger_1.default.error('Error:', error);
    if (error instanceof CustomError) {
        res.status(error.statusCode).json({
            success: false,
            error: {
                message: error.message,
                code: error.code
            },
            timestamp: new Date().toISOString()
        });
    }
    else {
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
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            message: 'Endpoint not found',
            code: 'NOT_FOUND'
        },
        timestamp: new Date().toISOString()
    });
};
exports.notFoundHandler = notFoundHandler;
