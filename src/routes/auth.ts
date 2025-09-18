import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, generalLimiter } from '../middleware/rateLimiter';

const router = Router();
const authController = new AuthController();

// Generate nonce for wallet authentication
router.get('/nonce', generalLimiter, authController.generateNonce);

// Connect wallet and authenticate
router.post('/connect', authLimiter, validate(authController.connectWalletSchema), authController.connectWallet);

// Refresh access token
router.post('/refresh', authLimiter, validate(authController.refreshTokenSchema), authController.refreshToken);

// Get current user profile
router.get('/me', authenticateToken, authController.getProfile);

// Update user profile
router.put('/profile', authenticateToken, validate(authController.updateProfileSchema), authController.updateProfile);

export default router;