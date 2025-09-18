"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthController_1 = require("../controllers/AuthController");
const validation_1 = require("../middleware/validation");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
const authController = new AuthController_1.AuthController();
// Generate nonce for wallet authentication
router.get('/nonce', rateLimiter_1.generalLimiter, authController.generateNonce);
// Connect wallet and authenticate
router.post('/connect', rateLimiter_1.authLimiter, (0, validation_1.validate)(authController.connectWalletSchema), authController.connectWallet);
// Refresh access token
router.post('/refresh', rateLimiter_1.authLimiter, (0, validation_1.validate)(authController.refreshTokenSchema), authController.refreshToken);
// Get current user profile
router.get('/me', auth_1.authenticateToken, authController.getProfile);
// Update user profile
router.put('/profile', auth_1.authenticateToken, (0, validation_1.validate)(authController.updateProfileSchema), authController.updateProfile);
exports.default = router;
