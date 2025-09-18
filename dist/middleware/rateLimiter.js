"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameLimiter = exports.authLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// General API rate limiter
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: {
            message: 'Too many requests from this IP, please try again later',
            code: 'RATE_LIMIT_EXCEEDED'
        }
    },
    standardHeaders: true,
    legacyHeaders: false
});
// Authentication rate limiter
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth requests per windowMs
    message: {
        success: false,
        error: {
            message: 'Too many authentication attempts, please try again later',
            code: 'AUTH_RATE_LIMIT_EXCEEDED'
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});
// Game actions rate limiter
exports.gameLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 game actions per minute
    message: {
        success: false,
        error: {
            message: 'Too many game actions, please slow down',
            code: 'GAME_RATE_LIMIT_EXCEEDED'
        }
    },
    standardHeaders: true,
    legacyHeaders: false
});
