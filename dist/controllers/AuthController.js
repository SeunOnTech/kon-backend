"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const client_1 = require("@prisma/client");
const ethers_1 = require("ethers");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const BaseController_1 = require("./BaseController");
const errorHandler_1 = require("../middleware/errorHandler");
class AuthController extends BaseController_1.BaseController {
    constructor() {
        super();
        this.connectWalletSchema = {
            body: {
                walletAddress: { type: 'string', required: true },
                signature: { type: 'string', required: true },
                message: { type: 'string', required: true },
                nonce: { type: 'string', required: true },
                username: { type: 'string', required: false }
            }
        };
        this.refreshTokenSchema = {
            body: {
                refreshToken: { type: 'string', required: true }
            }
        };
        this.updateProfileSchema = {
            body: {
                username: { type: 'string', required: false },
                email: { type: 'string', required: false },
                avatarUrl: { type: 'string', required: false }
            }
        };
        this.generateNonce = async (req, res) => {
            try {
                const { walletAddress } = req.query;
                if (!walletAddress || typeof walletAddress !== 'string') {
                    throw new errorHandler_1.CustomError('Wallet address is required', 400, 'WALLET_ADDRESS_REQUIRED');
                }
                // Validate wallet address
                if (!ethers_1.ethers.isAddress(walletAddress)) {
                    throw new errorHandler_1.CustomError('Invalid wallet address', 400, 'INVALID_WALLET_ADDRESS');
                }
                // Generate nonce and message
                const nonce = (0, uuid_1.v4)();
                const message = `Sign this message to authenticate with King of Night.\n\nNonce: ${nonce}\nWallet: ${walletAddress}`;
                this.successResponse(res, { nonce, message }, 'Nonce generated successfully');
            }
            catch (error) {
                this.handleError(error, res);
            }
        };
        this.connectWallet = async (req, res) => {
            try {
                const { walletAddress, signature, message, nonce, username } = req.body;
                // Verify signature
                let recoveredAddress;
                try {
                    recoveredAddress = ethers_1.ethers.verifyMessage(message, signature);
                }
                catch (error) {
                    throw new errorHandler_1.CustomError('Invalid signature format', 400, 'INVALID_SIGNATURE_FORMAT');
                }
                if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                    throw new errorHandler_1.CustomError('Invalid signature', 401, 'INVALID_SIGNATURE');
                }
                // Check if user exists
                let user = await this.prisma.user.findUnique({
                    where: { walletAddress: walletAddress.toLowerCase() }
                });
                if (user) {
                    // User exists, generate new tokens
                    const tokens = this.generateTokens(user);
                    this.successResponse(res, { user, tokens, isNewUser: false }, 'Wallet connected successfully');
                }
                else {
                    // New user, create them
                    user = await this.prisma.user.create({
                        data: {
                            walletAddress: walletAddress.toLowerCase(),
                            username: username || `Player_${walletAddress.slice(0, 6)}`
                        }
                    });
                    const tokens = this.generateTokens(user);
                    this.successResponse(res, { user, tokens, isNewUser: true }, 'User registered and wallet connected', 201);
                }
            }
            catch (error) {
                this.handleError(error, res);
            }
        };
        this.refreshToken = async (req, res) => {
            try {
                const { refreshToken } = req.body;
                let payload;
                try {
                    payload = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_SECRET);
                }
                catch (error) {
                    throw new errorHandler_1.CustomError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
                }
                // Verify user still exists
                const user = await this.prisma.user.findUnique({
                    where: { id: payload.userId }
                });
                if (!user) {
                    throw new errorHandler_1.CustomError('User not found', 401, 'USER_NOT_FOUND');
                }
                // Generate new tokens
                const tokens = this.generateTokens(user);
                this.successResponse(res, { tokens }, 'Token refreshed successfully');
            }
            catch (error) {
                this.handleError(error, res);
            }
        };
        this.getProfile = async (req, res) => {
            try {
                const userId = req.user.id;
                const user = await this.prisma.user.findUnique({
                    where: { id: userId }
                });
                if (!user) {
                    throw new errorHandler_1.CustomError('User not found', 404, 'USER_NOT_FOUND');
                }
                this.successResponse(res, { user }, 'Profile retrieved successfully');
            }
            catch (error) {
                this.handleError(error, res);
            }
        };
        this.updateProfile = async (req, res) => {
            try {
                const userId = req.user.id;
                const updates = req.body;
                const updatedUser = await this.prisma.user.update({
                    where: { id: userId },
                    data: updates
                });
                this.successResponse(res, { user: updatedUser }, 'Profile updated successfully');
            }
            catch (error) {
                this.handleError(error, res);
            }
        };
        this.prisma = new client_1.PrismaClient();
    }
    generateTokens(user) {
        const payload = {
            userId: user.id,
            walletAddress: user.walletAddress,
            username: user.username
        };
        const accessToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
        const refreshToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '60d' });
        return { accessToken, refreshToken };
    }
}
exports.AuthController = AuthController;
