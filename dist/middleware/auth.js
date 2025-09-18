"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            throw new errorHandler_1.CustomError('Access token required', 401, 'TOKEN_REQUIRED');
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new errorHandler_1.CustomError('Invalid token', 401, 'INVALID_TOKEN');
        }
        else if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new errorHandler_1.CustomError('Token expired', 401, 'TOKEN_EXPIRED');
        }
        else {
            throw new errorHandler_1.CustomError('Authentication failed', 401, 'AUTH_FAILED');
        }
    }
};
exports.authenticateToken = authenticateToken;
