"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const redis_1 = require("redis");
const ethers_1 = require("ethers");
const WebSocketServer_1 = require("./websocket/WebSocketServer");
const entryFee_1 = __importDefault(require("./routes/entryFee"));
const EntryFeeManager_1 = __importDefault(require("./services/EntryFeeManager"));
// Load environment variables
dotenv_1.default.config();
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const game_1 = __importDefault(require("./routes/game"));
// Import middleware
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const prisma = new client_1.PrismaClient();
const redis = (0, redis_1.createClient)({ url: process.env.REDIS_URL });
const wsServer = new WebSocketServer_1.GameWebSocketServer(server, prisma);
console.log('🔌 WebSocket server initialized');
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/v1/entry-fee', entryFee_1.default);
// Health check route
app.get('/health', async (req, res) => {
    try {
        // Check database connection
        await prisma.$queryRaw `SELECT 1`;
        // Check Redis connection
        await redis.ping();
        res.json({
            success: true,
            message: 'King of Night API is running',
            timestamp: new Date().toISOString(),
            websocket: {
                connectedClients: wsServer.getConnectedClients(),
                gameState: wsServer.getGameState()
            },
            environment: process.env.NODE_ENV,
            version: '1.0.0',
            services: {
                database: 'connected',
                redis: 'connected'
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Service health check failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// WebSocket test endpoint
app.get('/websocket-test', (req, res) => {
    res.json({
        success: true,
        data: {
            websocketUrl: `ws://localhost:${process.env.PORT || 3001}`,
            connectedClients: wsServer.getConnectedClients(),
            gameState: wsServer.getGameState(),
            message: 'WebSocket server is running'
        }
    });
});
// API info route
app.get('/api/v1', (req, res) => {
    res.json({
        success: true,
        message: 'King of Night API v1',
        version: '1.0.0',
        websocket: {
            url: `ws://localhost:${process.env.PORT || 3001}`,
            connectedClients: wsServer.getConnectedClients()
        },
        endpoints: {
            health: 'GET /health',
            auth: {
                nonce: 'GET /api/v1/auth/nonce',
                connect: 'POST /api/v1/auth/connect',
                refresh: 'POST /api/v1/auth/refresh',
                profile: 'GET /api/v1/auth/me'
            },
            game: {
                status: 'GET /api/v1/game/status',
                timeRemaining: 'GET /api/v1/game/time-remaining',
                vaultBalance: 'GET /api/v1/game/vault-balance',
                lastPlayer: 'GET /api/v1/game/last-player',
                join: 'POST /api/v1/game/join',
                estimateGas: 'GET /api/v1/game/estimate-gas'
            }
        }
    });
});
// Get recent player activities
app.get('/api/v1/activities', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const activities = wsServer.getRecentActivities(limit);
        res.json({
            success: true,
            data: {
                activities,
                count: activities.length,
                limit
            },
            message: 'Recent activities retrieved successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error getting activities:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve activities',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Manually trigger winner check
app.post('/api/v1/check-winner', async (req, res) => {
    try {
        console.log('🏆 Manual winner check requested');
        // Trigger the winner check method
        const result = await wsServer.checkWinner();
        res.json({
            success: true,
            data: result,
            message: 'Winner check completed',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error checking winner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check winner',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Clear pending winner transaction
app.post('/api/v1/clear-pending', (req, res) => {
    try {
        console.log('🧹 Clearing pending winner transaction');
        wsServer.clearPendingTransaction();
        res.json({
            success: true,
            message: 'Pending transaction cleared',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error clearing pending transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear pending transaction',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get recent winners
app.get('/api/v1/winners', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const winners = wsServer.getRecentWinners(limit);
        res.json({
            success: true,
            data: {
                winners,
                count: winners.length,
                limit
            },
            message: 'Recent winners retrieved successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error getting winners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve winners',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Add test winner data (for development)
app.post('/api/v1/test-winner', async (req, res) => {
    try {
        const { address, prize, playerCount } = req.body;
        if (!address || !prize || !playerCount) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: address, prize, playerCount'
            });
        }
        // Add directly to database
        const contractAddress = process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
            return res.status(400).json({
                success: false,
                message: 'CONTRACT_ADDRESS environment variable not set'
            });
        }
        await prisma.game.create({
            data: {
                contractAddress: contractAddress,
                networkId: parseInt(process.env.NETWORK_ID || '11155111'),
                tokenName: process.env.TOKEN_NAME || 'ETH',
                entryFee: process.env.ENTRY_FEE || '0.01',
                timerDuration: parseInt(process.env.TIMER_DURATION || '300'),
                status: 'completed',
                currentVault: '0',
                winnerAddress: address,
                winnerPrize: ethers_1.ethers.parseEther(prize).toString(),
                playerCount: playerCount,
                endedAt: new Date()
            }
        });
        res.json({
            success: true,
            message: 'Test winner added to database successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error adding test winner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add test winner',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
    console.log('🔌 WebSocket upgrade request received');
    // The WebSocket server will handle this automatically
});
// API routes
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/game', game_1.default);
// 404 handler
app.use(errorHandler_1.notFoundHandler);
// Error handler
app.use(errorHandler_1.errorHandler);
// Start server
async function startServer() {
    try {
        // Connect to Redis
        await redis.connect();
        console.log('Redis connected');
        // Test database connection
        await prisma.$connect();
        console.log('Database connected');
        const PORT = process.env.PORT || 3001;
        server.listen(PORT, async () => {
            // Start entry fee monitoring
            const entryFeeManager = new EntryFeeManager_1.default();
            try {
                await entryFeeManager.start();
                console.log('✅ Entry fee monitoring started');
            }
            catch (error) {
                console.error('❌ Failed to start entry fee monitoring:', error);
            }
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`API info: http://localhost:${PORT}/api/v1`);
            console.log(`WebSocket available on ws://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
});
// Start the server
startServer();
