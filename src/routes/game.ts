import { Router } from 'express';
import { GameController } from '../controllers/GameController';
import { validate } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { gameLimiter, generalLimiter } from '../middleware/rateLimiter';

const router = Router();
const gameController = new GameController();

// Game status endpoints
router.get('/status', generalLimiter, gameController.getGameStatus);
router.get('/time-remaining', gameController.getTimeRemaining);
router.get('/vault-balance', generalLimiter, gameController.getVaultBalance);
router.get('/last-player', generalLimiter, gameController.getLastPlayer);

// Join game endpoints
router.get('/estimate-gas', generalLimiter, gameController.estimateGas);
router.post('/join', authenticateToken, gameLimiter, validate(gameController.joinGameSchema), gameController.joinGame);
router.post('/join-test', generalLimiter, validate(gameController.joinGameSchema), gameController.joinGameTest);
router.get('/join-status/:txHash', generalLimiter, gameController.getJoinStatus);

// Game history endpoints
router.get('/winners', generalLimiter, gameController.getWinners);
router.get('/recent-winners', generalLimiter, gameController.getRecentWinners);
router.get('/winners-by-token', generalLimiter, gameController.getWinnersByToken);
router.get('/statistics', generalLimiter, gameController.getGameStatistics);
router.get('/transactions', generalLimiter, gameController.getTransactions);
router.get('/player-history/:address', generalLimiter, gameController.getPlayerHistory);

export default router;