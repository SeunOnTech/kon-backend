"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const GameController_1 = require("../controllers/GameController");
const validation_1 = require("../middleware/validation");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
const gameController = new GameController_1.GameController();
// Game status endpoints
router.get('/status', rateLimiter_1.generalLimiter, gameController.getGameStatus);
router.get('/time-remaining', gameController.getTimeRemaining);
router.get('/vault-balance', rateLimiter_1.generalLimiter, gameController.getVaultBalance);
router.get('/last-player', rateLimiter_1.generalLimiter, gameController.getLastPlayer);
// Join game endpoints
router.get('/estimate-gas', rateLimiter_1.generalLimiter, gameController.estimateGas);
router.post('/join', auth_1.authenticateToken, rateLimiter_1.gameLimiter, (0, validation_1.validate)(gameController.joinGameSchema), gameController.joinGame);
router.post('/join-test', rateLimiter_1.generalLimiter, (0, validation_1.validate)(gameController.joinGameSchema), gameController.joinGameTest);
router.get('/join-status/:txHash', rateLimiter_1.generalLimiter, gameController.getJoinStatus);
// Game history endpoints
router.get('/winners', rateLimiter_1.generalLimiter, gameController.getWinners);
router.get('/recent-winners', rateLimiter_1.generalLimiter, gameController.getRecentWinners);
router.get('/winners-by-token', rateLimiter_1.generalLimiter, gameController.getWinnersByToken);
router.get('/statistics', rateLimiter_1.generalLimiter, gameController.getGameStatistics);
router.get('/transactions', rateLimiter_1.generalLimiter, gameController.getTransactions);
router.get('/player-history/:address', rateLimiter_1.generalLimiter, gameController.getPlayerHistory);
exports.default = router;
