"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseController = void 0;
const logger_1 = __importDefault(require("../config/logger"));
class BaseController {
    successResponse(res, data, message, statusCode = 200) {
        res.status(statusCode).json({
            success: true,
            data,
            message,
            timestamp: new Date().toISOString()
        });
    }
    errorResponse(res, error, statusCode = 500) {
        logger_1.default.error('Controller error:', error);
        res.status(statusCode).json({
            success: false,
            error: {
                message: error.message || 'Internal server error',
                code: error.code || 'INTERNAL_ERROR'
            },
            timestamp: new Date().toISOString()
        });
    }
    handleError(error, res) {
        if (error instanceof Error && 'statusCode' in error) {
            this.errorResponse(res, error, error.statusCode);
        }
        else {
            this.errorResponse(res, error);
        }
    }
}
exports.BaseController = BaseController;
