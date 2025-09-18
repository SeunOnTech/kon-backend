import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { BaseController } from './BaseController';
import { CustomError } from '../middleware/errorHandler';
import PriceMonitor from '../services/PriceMonitor';
import { NETWORK_CONFIGS } from '../config/networks';
import logger from '../config/logger';

export class GameController extends BaseController {
  private prisma: PrismaClient;
  private provider: ethers.JsonRpcProvider;
  private priceMonitor: PriceMonitor;
  private priceCache: { [token: string]: { price: number; timestamp: number } } = {};
  private readonly PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.prisma = new PrismaClient();
    
    // network configuration
    const enabledNetworks = process.env.ENABLED_NETWORKS || 'ethereum-sepolia';
    const networkKey = enabledNetworks.split(',')[0].trim();
    
    let rpcUrl: string;
    if (networkKey === '0g') {
      rpcUrl = process.env.ZEROG_RPC_URL || '';
    } else if (networkKey === 'ethereum-sepolia') {
      rpcUrl = process.env.SEPOLIA_RPC_URL || '';
    } else if (networkKey === 'polygon-mumbai') {
      rpcUrl = process.env.MUMBAI_RPC_URL || '';
    } else if (networkKey === 'bsc-testnet') {
      rpcUrl = process.env.BSC_TESTNET_RPC_URL || '';
    } else if (networkKey === 'avalanche-fuji') {
      rpcUrl = process.env.FUJI_RPC_URL || '';
    } else if (networkKey === 'base-sepolia') {
      rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || '';
    } else if (networkKey === 'arbitrum-sepolia') {
      rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || '';
    } else if (networkKey === 'optimism-sepolia') {
      rpcUrl = process.env.OPTIMISM_SEPOLIA_RPC_URL || '';
    } else {
      rpcUrl = process.env.SEPOLIA_RPC_URL || '';
    }
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.priceMonitor = new PriceMonitor(NETWORK_CONFIGS, 30);
  }

  public joinGameSchema = {
    body: {
      amount: { type: 'string', required: true },
      gasSettings: { type: 'object', required: false }
    }
  };

  // Helper method to get contract address based on enabled network
  private getContractAddress(): string {
    const enabledNetworks = process.env.ENABLED_NETWORKS || 'ethereum-sepolia';
    const networkKey = enabledNetworks.split(',')[0].trim();
    
    if (networkKey === '0g') {
      return process.env.ZEROG_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'ethereum-sepolia') {
      return process.env.SEPOLIA_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'polygon-mumbai') {
      return process.env.MUMBAI_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'bsc-testnet') {
      return process.env.BSC_TESTNET_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'avalanche-fuji') {
      return process.env.FUJI_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'base-sepolia') {
      return process.env.BASE_SEPOLIA_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'arbitrum-sepolia') {
      return process.env.ARBITRUM_SEPOLIA_CONTRACT_ADDRESS || '';
    } else if (networkKey === 'optimism-sepolia') {
      return process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS || '';
    } else {
      return process.env.CONTRACT_ADDRESS || '';
    }
  }

  // Helper method to get cached price or fetch new one
  private async getCachedPrice(tokenSymbol: string): Promise<number> {
    const now = Date.now();
    const cached = this.priceCache[tokenSymbol];
    
    // Return cached price if it's still valid
    if (cached && (now - cached.timestamp) < this.PRICE_CACHE_DURATION) {
      return cached.price;
    }
    
    // Fetch new price
    try {
      const priceData = await this.priceMonitor.getTokenPrice(tokenSymbol);
      this.priceCache[tokenSymbol] = {
        price: priceData.price,
        timestamp: now
      };
      return priceData.price;
    } catch (error) {
      logger.error(`Failed to get price for ${tokenSymbol}:`, error);
      
      // Return cached price even if stale, or fallback to 0
      if (cached) {
        logger.warn(`Using stale price for ${tokenSymbol}: $${cached.price}`);
        return cached.price;
      }
      
      return 0;
    }
  }

  // Helper method to format token amounts with USD values
  private async formatTokenAmountWithUSD(amount: string, tokenSymbol: string): Promise<{
    amount: string;
    tokenSymbol: string;
    usdValue: number;
    formattedUsd: string;
  }> {
    const price = await this.getCachedPrice(tokenSymbol);
    const numericAmount = parseFloat(amount);
    const usdValue = numericAmount * price;

    return {
      amount: amount,
      tokenSymbol: tokenSymbol,
      usdValue: usdValue,
      formattedUsd: `$${usdValue.toFixed(2)}`
    };
  }

//   public getGameStatus = async (req: Request, res: Response): Promise<void> => {
//     try {
//       // Get contract instance
//       const contract = await this.getContract();
      
//       // Get game status from contract
//       const [active, timeRemaining, currentVault, currentLastPlayer] = await contract.getGameStatus();
      
//       this.successResponse(res, {
//         vaultBalance: ethers.formatEther(currentVault),
//         timeRemaining: Number(timeRemaining),
//         lastPlayer: currentLastPlayer,
//         entryFee: ethers.formatEther(await contract.entryFee()),
//         timerDuration: Number(await contract.timerDuration()),
//         gameActive: active
//       }, 'Game status retrieved successfully');
//     } catch (error) {
//       this.handleError(error, res);
//     }
//   };

public getGameStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const contract = await this.getContract();
      
      const gameStatus = await contract.getGameStatus();
      const [gameActive, vaultBalance, timeRemaining, lastPlayer] = gameStatus;
      
      const entryFee = await contract.entryFee();
      const timerDuration = await contract.timerDuration();
      
      console.log('Debug - gameActive:', gameActive);
      console.log('Debug - vaultBalance:', vaultBalance.toString());
      console.log('Debug - timeRemaining:', timeRemaining.toString());
      console.log('Debug - lastPlayer:', lastPlayer);
      
      const isGameStarted = lastPlayer !== '0x0000000000000000000000000000000000000000';
      
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      
      const vaultBalanceFormatted = await this.formatTokenAmountWithUSD(
        ethers.formatEther(vaultBalance), 
        tokenName
      );
      
      const entryFeeFormatted = await this.formatTokenAmountWithUSD(
        ethers.formatEther(entryFee), 
        tokenName
      );
      
      this.successResponse(res, {
        gameActive,
        vaultBalance: {
          amount: vaultBalanceFormatted.amount,
          tokenSymbol: vaultBalanceFormatted.tokenSymbol,
          usdValue: vaultBalanceFormatted.usdValue,
          formattedUsd: vaultBalanceFormatted.formattedUsd
        },
        timeRemaining: Number(timeRemaining),
        lastPlayer,
        entryFee: {
          amount: entryFeeFormatted.amount,
          tokenSymbol: entryFeeFormatted.tokenSymbol,
          usdValue: entryFeeFormatted.usdValue,
          formattedUsd: entryFeeFormatted.formattedUsd
        },
        timerDuration: Number(timerDuration),
        isGameStarted,
        isExpired: Number(timeRemaining) === 0,
        tokenName: tokenName
      }, 'Game status retrieved successfully');
    } catch (error) {
      console.error('Contract error:', error);
      this.handleError(error, res);
    }
  };

  public getTimeRemaining = async (req: Request, res: Response): Promise<void> => {
    try {
      const contract = await this.getContract();
      
      const timeRemaining = await contract.getTimeRemaining();
      const timerDuration = await contract.timerDuration();
      const lastPlayerInfo = await contract.getLastPlayerInfo();
      
      const [lastPlayer, lastWagerTime] = lastPlayerInfo;
      
      console.log('Debug - timeRemaining:', timeRemaining.toString());
      console.log('Debug - timerDuration:', timerDuration.toString());
      console.log('Debug - lastPlayer:', lastPlayer);
      console.log('Debug - lastWagerTime:', lastWagerTime.toString());
    
      const isGameStarted = lastPlayer !== '0x0000000000000000000000000000000000000000';
      
      this.successResponse(res, { 
        timeRemaining: Number(timeRemaining),
        timerDuration: Number(timerDuration),
        lastPlayer,
        lastWagerTime: lastWagerTime.toString(),
        isGameStarted,
        isExpired: Number(timeRemaining) === 0,
        lastUpdate: Date.now()
      }, 'Time remaining retrieved successfully');
    } catch (error) {
      console.error('Contract error:', error);
      this.handleError(error, res);
    }
  };

//   public getTimeRemaining = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const contract = await this.getContract();
//       // Debug: Check individual values
//       const lastWagerTime = await contract.lastWagerTime();
//       const timerDuration = await contract.timerDuration();
//       const timeRemaining = await contract.getTimeRemaining();

//       console.log('Debug - lastWagerTime:', lastWagerTime.toString());
//       console.log('Debug - timerDuration:', timerDuration.toString());
//       console.log('Debug - timeRemaining:', timeRemaining.toString());
      
//       this.successResponse(res, { timeRemaining: Number(timeRemaining) }, 'Time remaining retrieved');
//     } catch (error) {
//       this.handleError(error, res);
//     }
//   };

//   public getTimeRemaining = async (req: Request, res: Response) => {
//     try {
//       const contract = getContract();
      
//       // Debug: Check individual values
//       const lastWagerTime = await contract.lastWagerTime();
//       const timerDuration = await contract.timerDuration();
//       const timeRemaining = await contract.getTimeRemaining();
      
//       console.log('Debug - lastWagerTime:', lastWagerTime.toString());
//       console.log('Debug - timerDuration:', timerDuration.toString());
//       console.log('Debug - timeRemaining:', timeRemaining.toString());
      
//       successResponse(res, {
//         timeRemaining: Number(timeRemaining),
//         lastWagerTime: lastWagerTime.toString(),
//         timerDuration: timerDuration.toString(),
//         isExpired: Number(timeRemaining) === 0,
//         lastUpdate: Date.now()
//       }, 'Time remaining retrieved successfully');
//     } catch (error) {
//       handleError(error, res);
//     }
//   };

  public getVaultBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const contract = await this.getContract();
      const vaultBalance = await contract.getVaultBalance();
  
      const tokenName = process.env.TOKEN_NAME || 'ETH';

      const vaultBalanceFormatted = await this.formatTokenAmountWithUSD(
        ethers.formatEther(vaultBalance), 
        tokenName
      );
      
      this.successResponse(res, { 
        vaultBalance: {
          amount: vaultBalanceFormatted.amount,
          tokenSymbol: vaultBalanceFormatted.tokenSymbol,
          usdValue: vaultBalanceFormatted.usdValue,
          formattedUsd: vaultBalanceFormatted.formattedUsd
        }
      }, 'Vault balance retrieved');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getLastPlayer = async (req: Request, res: Response): Promise<void> => {
    try {
      const contract = await this.getContract();
      
      const lastPlayerInfo = await contract.getLastPlayerInfo();
      const [player, timestamp] = lastPlayerInfo;
      
      console.log('Debug - player:', player);
      console.log('Debug - timestamp:', timestamp.toString());
      
      this.successResponse(res, {
        player,
        timestamp: new Date(Number(timestamp) * 1000).toISOString(),
        isGameStarted: player !== '0x0000000000000000000000000000000000000000'
      }, 'Last player info retrieved');
    } catch (error) {
      console.error('Contract error:', error);
      this.handleError(error, res);
    }
  };

//   public getLastPlayer = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const contract = await this.getContract();
//       const [player, timestamp] = await contract.getLastPlayerInfo();
      
//       this.successResponse(res, {
//         player,
//         timestamp: new Date(Number(timestamp) * 1000).toISOString()
//       }, 'Last player info retrieved');
//     } catch (error) {
//       this.handleError(error, res);
//     }
//   };

  public estimateGas = async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount } = req.query;
      
      if (!amount) {
        throw new CustomError('Amount is required', 400, 'AMOUNT_REQUIRED');
      }

      const contract = await this.getContract();
      const gasEstimate = await contract.wager.estimateGas({ value: ethers.parseEther(amount as string) });
      const gasPrice = await this.provider.getFeeData();

      this.successResponse(res, {
        gasEstimate: gasEstimate.toString(),
        gasPrice: gasPrice.gasPrice?.toString() || '0',
        estimatedCost: (gasEstimate * (gasPrice.gasPrice || 0n)).toString()
      }, 'Gas estimation completed');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public joinGameTest = async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount, gasSettings, walletAddress } = req.body;
      
      if (!walletAddress) {
        throw new CustomError('Wallet address is required for test', 400, 'WALLET_ADDRESS_REQUIRED');
      }
      
      let user = await this.prisma.user.findUnique({
        where: { walletAddress }
      });
      
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            walletAddress,
            username: `test-user-${walletAddress.slice(-4)}`
          }
        });
      }
      
      (req as any).user = user;
      
      await this.joinGame(req, res);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public joinGame = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const { amount, gasSettings } = req.body;

      if (!userId) {
        throw new CustomError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new CustomError('User not found', 404, 'USER_NOT_FOUND');
      }

      const contract = await this.getContract();
      const entryFee = ethers.parseEther(amount);

      const gasEstimate = await contract.wager.estimateGas({ value: entryFee });
      const gasPrice = await this.provider.getFeeData();
      
      
      const transactionData = {
        to: this.getContractAddress(),
        value: entryFee.toString(),
        gasLimit: gasEstimate.toString(),
        gasPrice: gasPrice.gasPrice?.toString() || '20000000000',
        data: contract.interface.encodeFunctionData('wager')
      };

      this.successResponse(res, {
        transactionData,
        userWalletAddress: user.walletAddress,
        amount: amount,
        message: 'Sign this transaction with your wallet to join the game'
      }, 'Transaction data ready for signing');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getJoinStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { txHash } = req.params;
      
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        this.successResponse(res, { status: 'pending', confirmations: 0 }, 'Transaction pending');
        return;
      }

      const confirmations = await receipt.confirmations();
      
      this.successResponse(res, {
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        confirmations: Number(confirmations),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      }, 'Transaction status retrieved');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getWinners = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      // Get recent winners from database (filtered by contract address)
      const contractAddress = this.getContractAddress();
      const winners = await this.prisma.game.findMany({
        where: { 
          winnerAddress: { not: null },
          contractAddress: contractAddress
        },
        orderBy: { endedAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      this.successResponse(res, { winners }, 'Winners retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const transactions = await this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { 
          user: { 
            select: { 
              username: true, 
              walletAddress: true 
            } 
          } 
        }
      });

      this.successResponse(res, { transactions }, 'Transactions retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getPlayerHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { address } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const transactions = await this.prisma.transaction.findMany({
        where: { fromAddress: address.toLowerCase() },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      this.successResponse(res, { transactions }, 'Player history retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private async getContract(signer?: ethers.Wallet) {
    const contractAddress = this.getContractAddress();
    // const abi = [
    //   "function getGameStatus() external view returns (bool, uint256, uint256, address)",
    //   "function getTimeRemaining() external view returns (uint256)",
    //   "function getVaultBalance() external view returns (uint256)",
    //   "function getLastPlayerInfo() external view returns (address, uint256)",
    //   "function entryFee() external view returns (uint256)",
    //   "function timerDuration() external view returns (uint256)",
    //   "function wager() external payable"
    // ];
    const abi = [
      // View functions
      "function getGameStatus() external view returns (bool, uint256, uint256, address)",
      "function getTimeRemaining() external view returns (uint256)",
      "function getVaultBalance() external view returns (uint256)",
      "function getLastPlayerInfo() external view returns (address, uint256)",
      "function entryFee() external view returns (uint256)",
      "function timerDuration() external view returns (uint256)",
      "function owner() external view returns (address)",
      
      // Game functions
      "function wager() external payable",
      "function checkWinner() external",
      
      // Admin functions
      "function fundVault() external payable",
      "function updateEntryFee(uint256 _newEntryFee) external",
      "function pauseGame() external",
      "function resumeGame() external",
      "function emergencyWithdraw(address) external",
      
      // Events
      "event WagerPlaced(address indexed player, uint256 amount, uint256 newVault, uint256 newEndTime)",
      "event WinnerDeclared(address indexed winner, uint256 prize, uint256 timestamp, uint256 vaultRemaining)",
      "event VaultFunded(address indexed by, uint256 amount, uint256 newVault)",
      "event EntryFeeUpdated(uint256 oldEntryFee, uint256 newEntryFee, uint256 timestamp)"
    ];

    if (signer) {
      return new ethers.Contract(contractAddress, abi, signer);
    }
    return new ethers.Contract(contractAddress, abi, this.provider);
  }

  public getRecentWinners = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit = 10 } = req.query;
   
      const contractAddress = this.getContractAddress();
      const winners = await this.prisma.game.findMany({
        where: { 
          winnerAddress: { not: null },
          playerCount: { not: null },
          contractAddress: contractAddress
        },
        orderBy: { endedAt: 'desc' },
        take: Number(limit),
        select: {
          winnerAddress: true,
          winnerPrize: true,
          playerCount: true,
          endedAt: true,
          contractAddress: true,
          tokenName: true
        }
      });

      const formattedWinners = await Promise.all(winners.map(async (winner, index) => {
        const address = winner.winnerAddress!;
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        
        // winnerPrize is already in ETH format (decimal), not wei
        const prizeAmount = winner.winnerPrize || '0';
        const tokenName = winner.tokenName || 'ETH';
        const prizeFormatted = await this.formatTokenAmountWithUSD(prizeAmount, tokenName);

        const timestamp = winner.endedAt ? new Date(winner.endedAt) : new Date();
        const formattedDate = timestamp.toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric'
        });
        const formattedTime = timestamp.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        return {
          rank: index + 1,
          address: truncatedAddress,
          fullAddress: address,
          prize: {
            amount: prizeFormatted.amount,
            tokenSymbol: prizeFormatted.tokenSymbol,
            usdValue: prizeFormatted.usdValue,
            formattedUsd: prizeFormatted.formattedUsd,
            display: `${prizeFormatted.amount} ${prizeFormatted.tokenSymbol} (${prizeFormatted.formattedUsd})`
          },
          playerCount: winner.playerCount || 0,
          timestamp: `${formattedDate}, ${formattedTime}`,
          rawTimestamp: winner.endedAt?.getTime() || Date.now(),
          tokenName: tokenName
        };
      }));

      this.successResponse(res, { 
        winners: formattedWinners,
        total: winners.length,
        contractAddress: contractAddress
      }, 'Recent winners retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getWinnersByToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tokenName, limit = 10 } = req.query;
      
      if (!tokenName) {
        this.errorResponse(res, 'Token name is required', 400);
        return;
      }
      
      const contractAddress = this.getContractAddress();
      const winners = await this.prisma.game.findMany({
        where: { 
          winnerAddress: { not: null },
          playerCount: { not: null },
          contractAddress: contractAddress,
          tokenName: tokenName as string
        },
        orderBy: { endedAt: 'desc' },
        take: Number(limit),
        select: {
          winnerAddress: true,
          winnerPrize: true,
          playerCount: true,
          endedAt: true,
          contractAddress: true,
          tokenName: true
        }
      });

      const formattedWinners = await Promise.all(winners.map(async (winner, index) => {
        const address = winner.winnerAddress!;
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        
        // winnerPrize is already in ETH format (decimal), not wei
        const prizeAmount = winner.winnerPrize || '0';
        const tokenName = winner.tokenName || 'ETH';
        const prizeFormatted = await this.formatTokenAmountWithUSD(prizeAmount, tokenName);
        
        const timestamp = winner.endedAt ? new Date(winner.endedAt) : new Date();
        const formattedDate = timestamp.toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric'
        });
        const formattedTime = timestamp.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        return {
          rank: index + 1,
          address: truncatedAddress,
          fullAddress: address,
          prize: {
            amount: prizeFormatted.amount,
            tokenSymbol: prizeFormatted.tokenSymbol,
            usdValue: prizeFormatted.usdValue,
            formattedUsd: prizeFormatted.formattedUsd,
            display: `${prizeFormatted.amount} ${prizeFormatted.tokenSymbol} (${prizeFormatted.formattedUsd})`
          },
          playerCount: winner.playerCount || 0,
          timestamp: `${formattedDate}, ${formattedTime}`,
          rawTimestamp: winner.endedAt?.getTime() || Date.now(),
          tokenName: tokenName
        };
      }));

      this.successResponse(res, { 
        winners: formattedWinners,
        total: winners.length,
        contractAddress: contractAddress,
        tokenName: tokenName
      }, `Winners for ${tokenName} retrieved successfully`);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  public getGameStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const contractAddress = this.getContractAddress();

      if (!contractAddress) {
        throw new CustomError('Contract address not configured', 500, 'CONTRACT_NOT_CONFIGURED');
      }

      // Get total completed games (games with winners)
      const totalGames = await this.prisma.game.count({
        where: {
          contractAddress: contractAddress,
          winnerAddress: { not: null },
          status: 'completed'
        }
      });

      // Get total ETH won (sum of all winner prizes)
      const gamesWithPrizes = await this.prisma.game.findMany({
        where: {
          contractAddress: contractAddress,
          winnerAddress: { not: null },
          winnerPrize: { not: null }
        },
        select: {
          winnerPrize: true
        }
      });

      // Sum up all the winner prizes (they are stored as decimal strings in ETH)
      const totalWonEth = gamesWithPrizes.reduce((sum, game) => {
        const prize = parseFloat(game.winnerPrize || '0');
        return sum + prize;
      }, 0).toString();
      
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      
      const totalWonFormatted = await this.formatTokenAmountWithUSD(totalWonEth, tokenName);

      const totalPlayers = await this.prisma.game.aggregate({
        where: {
          contractAddress: contractAddress,
          playerCount: { not: null }
        },
        _sum: {
          playerCount: true
        }
      });

      const averagePlayersPerGame = totalGames > 0 ? (totalPlayers._sum.playerCount || 0) / totalGames : 0;

      this.successResponse(res, {
        totalGames: totalGames,
        totalWon: {
          amount: totalWonEth,
          tokenSymbol: tokenName,
          usdValue: totalWonFormatted.usdValue,
          formattedUsd: totalWonFormatted.formattedUsd,
          display: `${totalWonEth} ${tokenName} (${totalWonFormatted.formattedUsd})`
        },
        totalPlayers: totalPlayers._sum.playerCount || 0,
        averagePlayersPerGame: Math.round(averagePlayersPerGame * 100) / 100,
        contractAddress: contractAddress
      }, 'Game statistics retrieved successfully');
    } catch (error) {
      this.handleError(error, res);
    }
  };
}