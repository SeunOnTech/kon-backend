import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { BaseController } from './BaseController';
import { CustomError } from '../middleware/errorHandler';
import logger from '../config/logger';

export class AuthController extends BaseController {
  private prisma: PrismaClient;

  constructor() {
    super();
    this.prisma = new PrismaClient();
  }

  public connectWalletSchema = {
    body: {
      walletAddress: { type: 'string', required: true },
      signature: { type: 'string', required: true },
      message: { type: 'string', required: true },
      nonce: { type: 'string', required: true },
      username: { type: 'string', required: false }
    }
  };

  public refreshTokenSchema = {
    body: {
      refreshToken: { type: 'string', required: true }
    }
  };

  public updateProfileSchema = {
    body: {
      username: { type: 'string', required: false },
      email: { type: 'string', required: false },
      avatarUrl: { type: 'string', required: false }
    }
  };

  public generateNonce = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress } = req.query;

      if (!walletAddress || typeof walletAddress !== 'string') {
        throw new CustomError('Wallet address is required', 400, 'WALLET_ADDRESS_REQUIRED');
      }

      // Validate wallet address
      if (!ethers.isAddress(walletAddress)) {
        throw new CustomError('Invalid wallet address', 400, 'INVALID_WALLET_ADDRESS');
      }

      // Generate nonce and message
      const nonce = uuidv4();
      const message = `Sign this message to authenticate with King of Night.\n\nNonce: ${nonce}\nWallet: ${walletAddress}`;

      this.successResponse(res, { nonce, message }, 'Nonce generated successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public connectWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress, signature, message, nonce, username } = req.body;

      // Verify signature
      let recoveredAddress: string;
      try {
        recoveredAddress = ethers.verifyMessage(message, signature);
      } catch (error) {
        throw new CustomError('Invalid signature format', 400, 'INVALID_SIGNATURE_FORMAT');
      }

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new CustomError('Invalid signature', 401, 'INVALID_SIGNATURE');
      }

      // Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { walletAddress: walletAddress.toLowerCase() }
      });

      if (user) {
        // User exists, generate new tokens
        const tokens = this.generateTokens(user);
        this.successResponse(res, { user, tokens, isNewUser: false }, 'Wallet connected successfully');
      } else {
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
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      let payload: any;
      try {
        payload = jwt.verify(refreshToken, process.env.JWT_SECRET!);
      } catch (error) {
        throw new CustomError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }
      
      // Verify user still exists
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId }
      });

      if (!user) {
        throw new CustomError('User not found', 401, 'USER_NOT_FOUND');
      }

      // Generate new tokens
      const tokens = this.generateTokens(user);
      this.successResponse(res, { tokens }, 'Token refreshed successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new CustomError('User not found', 404, 'USER_NOT_FOUND');
      }

      this.successResponse(res, { user }, 'Profile retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const updates = req.body;

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: updates
      });

      this.successResponse(res, { user: updatedUser }, 'Profile updated successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private generateTokens(user: any) {
    const payload = {
      userId: user.id,
      walletAddress: user.walletAddress,
      username: user.username
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '30d' });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '60d' });

    return { accessToken, refreshToken };
  }
}