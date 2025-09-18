import { WebSocketServer, WebSocket } from 'ws';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import PriceMonitor from '../services/PriceMonitor';
import { NETWORK_CONFIGS } from '../config/networks';
import logger from '../config/logger';

interface GameState {
  timeRemaining: number;
  isGameStarted: boolean;
  lastPlayer: string;
  vaultBalance: {
    amount: string;
    tokenSymbol: string;
    usdValue: number;
    formattedUsd: string;
  };
  entryFee: {
    amount: string;
    tokenSymbol: string;
    usdValue: number;
    formattedUsd: string;
  };
  timerDuration: number;
  gameActive: boolean;
}

interface PlayerActivity {
  address: string;
  action: 'joined' | 'won' | 'vault_funded';
  timestamp: number;
  amount?: string;
  transactionHash?: string;
}

interface Winner {
  address: string;
  prize: string;
  playerCount: number;
  timestamp: number;
  transactionHash?: string;
  rank?: number;
}

interface WebSocketMessage {
  type: 'gameState' | 'playerJoined' | 'winnerDeclared' | 'vaultFunded' | 'pong' | 'error' | 'playerActivity';
  data: any;
  timestamp: number;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private gameState: GameState | null = null;
  private contract: ethers.Contract | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastUpdate: number = 0;
  private recentActivities: PlayerActivity[] = [];
  private recentWinners: Winner[] = [];
  private lastPlayerAddress: string = '';
  private lastWinnerCheck: number = 0;
  private winnerCheckInterval: NodeJS.Timeout | null = null;
  private playerCount: number = 0;
  private pendingWinnerTx: string | null = null;
  private prisma: PrismaClient;
  private priceMonitor: PriceMonitor;
  private priceCache: { [token: string]: { price: number; timestamp: number } } = {};
  private readonly PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private contractInitializationFailed = false;

  constructor(server: any, prisma: PrismaClient) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/',
      perMessageDeflate: false
    });
    this.prisma = prisma;
    this.priceMonitor = new PriceMonitor(NETWORK_CONFIGS, 30);
    this.initializePriceCache();
    this.startPriceCacheRefresh();
    this.setupWebSocket();
    this.initializeContract();
    this.startGameStateSync();
    this.startWinnerCheck();
  }

  // Initialize price cache on startup
  private async initializePriceCache(): Promise<void> {
    try {
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      const priceData = await this.priceMonitor.getTokenPrice(tokenName);
      this.priceCache[tokenName] = {
        price: priceData.price,
        timestamp: Date.now()
      };
      logger.info(`Price cache initialized for ${tokenName}: $${priceData.price}`);
    } catch (error) {
      logger.error('Failed to initialize price cache:', error);
    }
  }

  // Start periodic price cache refresh
  private startPriceCacheRefresh(): void {
    // Refresh price cache every 4 minutes (before it expires)
    setInterval(async () => {
      try {
        const tokenName = process.env.TOKEN_NAME || 'ETH';
        const priceData = await this.priceMonitor.getTokenPrice(tokenName);
        this.priceCache[tokenName] = {
          price: priceData.price,
          timestamp: Date.now()
        };
        logger.info(`Price cache refreshed for ${tokenName}: $${priceData.price}`);
      } catch (error) {
        logger.error('Failed to refresh price cache:', error);
      }
    }, 4 * 60 * 1000); // 4 minutes
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

  // Helper method to check if contract is in a valid state
  private async isContractReady(): Promise<boolean> {
    if (!this.contract || this.contractInitializationFailed) return false;
    
    try {
      // Try a simple call to check if contract is responsive
      await this.contract.timerDuration();
      return true;
    } catch (error) {
      logger.warn('Contract not ready:', error);
      return false;
    }
  }

  // Fallback mode when contract is not available
  private async getFallbackGameState(): Promise<GameState> {
    const tokenName = process.env.TOKEN_NAME || 'ETH';
    const entryFeeAmount = process.env.ENTRY_FEE || '0.01';
    
    // Get USD values for fallback state
    const entryFeeFormatted = await this.formatTokenAmountWithUSD(entryFeeAmount, tokenName);
    
    return {
      timeRemaining: 0,
      isGameStarted: false,
      lastPlayer: '0x0000000000000000000000000000000000000000',
      vaultBalance: {
        amount: '0',
        tokenSymbol: tokenName,
        usdValue: 0,
        formattedUsd: '$0.00'
      },
      entryFee: entryFeeFormatted,
      timerDuration: 300, // 5 minutes default
      gameActive: false
    };
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

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection established');
      this.clients.add(ws);

      // Send current game state to new client
      if (this.gameState) {
        this.sendMessage(ws, {
          type: 'gameState',
          data: this.gameState,
          timestamp: Date.now()
        });
      }

      // Send recent activities to new client
      if (this.recentActivities.length > 0) {
        this.sendMessage(ws, {
          type: 'playerActivity',
          data: { activities: this.recentActivities.slice(0, 10) }, // Send last 10 activities
          timestamp: Date.now()
        });
      }

      // Handle client messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          logger.error('Invalid WebSocket message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('WebSocket connection closed');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    logger.info('WebSocket server initialized');
  }

  private async initializeContract() {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Use the same contract address logic as the debug script
        const enabledNetworks = process.env.ENABLED_NETWORKS || 'ethereum-sepolia';
        const networkKey = enabledNetworks.split(',')[0].trim();
        
        let contractAddress: string;
        if (networkKey === '0g') {
          contractAddress = process.env.ZEROG_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'ethereum-sepolia') {
          contractAddress = process.env.SEPOLIA_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'polygon-mumbai') {
          contractAddress = process.env.MUMBAI_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'bsc-testnet') {
          contractAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'avalanche-fuji') {
          contractAddress = process.env.FUJI_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'base-sepolia') {
          contractAddress = process.env.BASE_SEPOLIA_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'arbitrum-sepolia') {
          contractAddress = process.env.ARBITRUM_SEPOLIA_CONTRACT_ADDRESS || '';
        } else if (networkKey === 'optimism-sepolia') {
          contractAddress = process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS || '';
        } else {
          contractAddress = process.env.CONTRACT_ADDRESS || '';
        }
        
        if (!contractAddress) {
          throw new Error('CONTRACT_ADDRESS environment variable is not set');
        }
        
        // ABI
        const contractABI = [
          "function getGameStatus() external view returns (bool, uint256, uint256, address)",
          "function getTimeRemaining() external view returns (uint256)",
          "function getVaultBalance() external view returns (uint256)",
          "function getLastPlayerInfo() external view returns (address, uint256)",
          "function entryFee() external view returns (uint256)",
          "function timerDuration() external view returns (uint256)",
          "function wager() external payable",
          "function fundVault() external payable",
          "function checkWinner() external",
          "event WagerPlaced(address indexed player, uint256 amount, uint256 newVault, uint256 newEndTime)",
          "event WinnerDeclared(address indexed winner, uint256 prize, uint256 timestamp, uint256 vaultRemaining)",
          "event VaultFunded(address indexed by, uint256 amount, uint256 newVault)"
        ];

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

        const provider = new ethers.JsonRpcProvider(rpcUrl);
              
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
          throw new Error('PRIVATE_KEY environment variable is required for winner checks');
        }
        
        const wallet = new ethers.Wallet(privateKey, provider);
        this.contract = new ethers.Contract(contractAddress, contractABI, wallet);

        await this.contract.timerDuration();
        
        
        logger.info('Contract initialized for WebSocket');
        return; 
      } catch (error) {
        retryCount++;
        logger.error(`Failed to initialize contract (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; 
          logger.info(`Retrying contract initialization in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.error('Max retries reached for contract initialization');
          this.contractInitializationFailed = true;
          logger.warn('Contract initialization failed. Server will run in read-only mode.');
        }
      }
    }
  }

  private setupContractEventListeners() {
    if (!this.contract) return;

    // Listen for wager events
    this.contract.on('WagerPlaced', async (player: string, amount: bigint, newVault: bigint, newEndTime: bigint) => {
      logger.info(`Player ${player} joined the game`);
      
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      const amountFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(amount), tokenName);
      const vaultFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(newVault), tokenName);
      
      this.broadcastMessage({
        type: 'playerJoined',
        data: {
          player,
          amount: amountFormatted,
          newVault: vaultFormatted,
          newEndTime: Number(newEndTime)
        },
        timestamp: Date.now()
      });

      // Update game state immediately
      this.updateGameState();
    });

    // Listen for winner events
    this.contract.on('WinnerDeclared', async (winner: string, prize: bigint, timestamp: bigint, vaultRemaining: bigint) => {
      logger.info(`Winner declared: ${winner} won ${ethers.formatEther(prize)} ETH`);
      
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      const prizeFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(prize), tokenName);
      const vaultRemainingFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(vaultRemaining), tokenName);
      
      this.broadcastMessage({
        type: 'winnerDeclared',
        data: {
          winner,
          prize: prizeFormatted,
          timestamp: Number(timestamp),
          vaultRemaining: vaultRemainingFormatted
        },
        timestamp: Date.now()
      });

      // Update game state immediately
      this.updateGameState();
    });

    // Listen for vault funding events
    this.contract.on('VaultFunded', async (by: string, amount: bigint, newVault: bigint) => {
      logger.info(`Vault funded by ${by}: ${ethers.formatEther(amount)} ETH`);
      
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      const amountFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(amount), tokenName);
      const vaultFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(newVault), tokenName);
      
      this.broadcastMessage({
        type: 'vaultFunded',
        data: {
          by,
          amount: amountFormatted,
          newVault: vaultFormatted
        },
        timestamp: Date.now()
      });

      // Update game state immediately
      this.updateGameState();
    });
  }

  private startGameStateSync() {
    // Initial sync
    this.updateGameState();

    // Sync every 10 seconds (reduced from 2 seconds to avoid rate limits)
    this.syncInterval = setInterval(() => {
      this.updateGameState();
    }, 10000);

    logger.info('Game state sync started (10 second intervals)');
  }

  private startWinnerCheck() {
    // Check for winners every 5 seconds
    this.winnerCheckInterval = setInterval(() => {
      this.checkForWinner();
    }, 5000);

    logger.info('Winner check started (5 second intervals)');
  }

  private async checkForWinner() {
    if (!this.contract) return;

    // Check if contract is ready before making calls
    if (!(await this.isContractReady())) {
      logger.warn('Contract not ready, skipping winner check');
      return;
    }

    // Skip if there's already a pending winner transaction
    if (this.pendingWinnerTx) {
      logger.info(`Skipping winner check - transaction already pending: ${this.pendingWinnerTx}`);
      return;
    }

    try {
      // Add delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));

      let timeRemaining: bigint;
      let lastPlayerInfo: [string, bigint];
      
      try {
        timeRemaining = await this.contract.getTimeRemaining();
        lastPlayerInfo = await this.contract.getLastPlayerInfo();
      } catch (error) {
        logger.warn('Contract call failed, skipping winner check:', error);
        return;
      }
      
      const [lastPlayer, lastWagerTime] = lastPlayerInfo;

      // Check if timer has expired and there's a player
      if (Number(timeRemaining) === 0 && 
          lastPlayer !== '0x0000000000000000000000000000000000000000' &&
          Number(lastWagerTime) > this.lastWinnerCheck) {
        
        logger.info(`Game conditions met for winner check:`);
        logger.info(`  - Time remaining: ${timeRemaining}`);
        logger.info(`  - Last player: ${lastPlayer}`);
        logger.info(`  - Last wager time: ${lastWagerTime}`);
        logger.info(`  - Last winner check: ${this.lastWinnerCheck}`);
        
        logger.info(`Timer expired! Checking for winner: ${lastPlayer}`);
        
        // Mark transaction as pending
        this.pendingWinnerTx = 'pending';
        
        // Add a unique timestamp to prevent caching issues
        const timestamp = Date.now();
        logger.info(`Starting winner check at timestamp: ${timestamp}`);
        
        // Call checkWinner on the contract
        logger.info(`Calling checkWinner() on contract...`);
        
        // Check wallet balance before sending transaction
        const provider = this.contract.runner?.provider;
        if (!provider) {
          throw new Error('Contract provider not available');
        }
        
        const walletAddress = (this.contract.runner as any).address;
        if (!walletAddress) {
          throw new Error('Wallet address not available');
        }
        
        const walletBalance = await provider.getBalance(walletAddress);
        logger.info(`Wallet balance: ${ethers.formatEther(walletBalance)} ETH`);
        
        // Check if wallet has enough balance for gas
        const minBalance = ethers.parseEther("0.001"); // 0.001 ETH minimum
        if (walletBalance < minBalance) {
          throw new Error(`Insufficient balance. Need at least ${ethers.formatEther(minBalance)} ETH for gas, have ${ethers.formatEther(walletBalance)} ETH`);
        }
        
        // Get current gas price with buffer
        const feeData = await provider.getFeeData();
        const currentGasPrice = feeData.gasPrice || BigInt('2000000000'); // 2 gwei fallback
        // Use a much higher gas price to ensure transaction goes through
        const gasPriceWithBuffer = BigInt('5000000000'); // 5 gwei fixed price
        
        logger.info(`Current gas price: ${ethers.formatUnits(currentGasPrice, 'gwei')} gwei`);
        logger.info(`Using gas price: ${ethers.formatUnits(gasPriceWithBuffer, 'gwei')} gwei (with 20% buffer)`);
        
        // Build transaction manually to ensure gas price is set correctly
        let gasEstimate;
        try {
          gasEstimate = await this.contract.checkWinner.estimateGas();
          logger.info(`Gas estimate for checkWinner: ${gasEstimate.toString()}`);
        } catch (estimateError) {
          logger.error(`Gas estimation failed: ${estimateError}`);
          throw new Error(`Cannot call checkWinner: ${estimateError}`);
        }
        const gasLimit = gasEstimate * 120n / 100n; // 20% buffer
        
        // Get fresh nonce and force increment if stuck
        let nonce = await provider.getTransactionCount(walletAddress, 'pending');
        
        // If we're stuck on the same nonce, force increment it
        if (nonce === 103) {
          nonce = 104; // Force increment to break the stuck transaction
          logger.warn(`Forcing nonce increment from 103 to ${nonce} to break stuck transaction`);
        }
        
        logger.info(`Using nonce: ${nonce}`);
        
        const transaction = {
          to: this.contract.target,
          data: this.contract.interface.encodeFunctionData('checkWinner'),
          gasLimit: gasLimit,
          gasPrice: gasPriceWithBuffer,
          nonce: nonce
        };
        
        logger.info(`Sending transaction with gasLimit: ${gasLimit}, gasPrice: ${ethers.formatUnits(gasPriceWithBuffer, 'gwei')} gwei`);
        
        const runner = this.contract.runner;
        if (!runner || !runner.sendTransaction) {
          throw new Error('Contract runner or sendTransaction method not available');
        }
        
        logger.info(`Attempting to send transaction...`);
        logger.info(`Transaction object:`, JSON.stringify({
          to: transaction.to,
          gasLimit: transaction.gasLimit.toString(),
          gasPrice: transaction.gasPrice.toString(),
          data: transaction.data
        }, null, 2));
        
        let tx;
        try {
          logger.info(`About to call runner.sendTransaction...`);
          tx = await runner.sendTransaction(transaction);
          logger.info(`Transaction response received:`, {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            gasLimit: tx.gasLimit?.toString(),
            gasPrice: tx.gasPrice?.toString(),
            nonce: tx.nonce
          });
          
          this.pendingWinnerTx = tx.hash;
          logger.info(`Winner check transaction sent: ${tx.hash}`);
          logger.info(`Transaction details: gasLimit=${tx.gasLimit}, gasPrice=${ethers.formatUnits(tx.gasPrice || 0, 'gwei')} gwei`);
          
          // Check if this is a new transaction hash
          if (tx.hash === '0x98854672b30ccf26a26540c11d7650051a07c1d4414c76f5be8cf2826d89a157') {
            logger.warn(`WARNING: Same transaction hash returned again! Clearing pending flag and retrying.`);
            this.pendingWinnerTx = null;
            // Don't wait for this transaction, it's stuck
            return;
          }
        } catch (sendError) {
          logger.error(`Failed to send transaction: ${sendError}`);
          
          // Handle "already known" error - transaction is stuck in mempool
          if (sendError instanceof Error && sendError.message && sendError.message.includes('already known')) {
            logger.warn(`Transaction already in mempool. Waiting 30 seconds before retry...`);
            this.pendingWinnerTx = null;
            
            // Wait 30 seconds before allowing another attempt
            setTimeout(() => {
              logger.info(`Retry timeout completed, winner check can be attempted again`);
            }, 30000);
            
            return; // Exit without throwing error
          }
          
          this.pendingWinnerTx = null;
          throw new Error(`Transaction send failed: ${sendError}`);
        }
        
        // Wait for confirmation with timeout
        logger.info(`Waiting for transaction confirmation...`);
        try {
          // Wait for confirmation with 5 minute timeout
          const receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transaction timeout after 5 minutes')), 5 * 60 * 1000)
            )
          ]) as any;
          logger.info(`Transaction confirmed in block: ${receipt.blockNumber}`);
          
          // Clear pending transaction
          this.pendingWinnerTx = null;
        
        if (receipt.status === 1) {
          logger.info(`Winner check successful! Transaction: ${tx.hash}`);
          
          // Get the winner info from the transaction logs
          const winnerInfo = await this.getWinnerFromTransaction(receipt);
          
          if (winnerInfo) {
            // Add winner to recent winners list
            const winner: Winner = {
              address: winnerInfo.winner,
              prize: winnerInfo.prize,
              playerCount: this.playerCount,
              timestamp: Date.now(),
              transactionHash: tx.hash,
              rank: this.recentWinners.length + 1
            };

            // Save winner to database
            await this.saveWinnerToDatabase(winner);

            // Also keep in memory for immediate access
            this.recentWinners.unshift(winner);
            if (this.recentWinners.length > 50) {
              this.recentWinners = this.recentWinners.slice(0, 50);
            }

            // Add winner activity
            this.addPlayerActivity(
              winnerInfo.winner, 
              'won', 
              winnerInfo.prize,
              tx.hash
            );

            // Broadcast winner event with USD values
            const tokenName = process.env.TOKEN_NAME || 'ETH';
            const prizeFormatted = await this.formatTokenAmountWithUSD(winnerInfo.prize, tokenName);
            
            this.broadcastMessage({
              type: 'winnerDeclared',
              data: {
                winner: winnerInfo.winner,
                prize: prizeFormatted,
                playerCount: this.playerCount,
                transactionHash: tx.hash,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });

            // Reset player count for next game
            this.playerCount = 0;

            logger.info(`Winner declared: ${winnerInfo.winner} won ${winnerInfo.prize} ETH (${winner.playerCount} players)`);
          }
        } else {
          logger.error(`Winner check transaction failed: ${tx.hash}`);
        }

        this.lastWinnerCheck = Number(lastWagerTime);
        } catch (txError) {
          logger.error(`Transaction confirmation failed: ${txError}`);
          // Clear pending transaction on error
          this.pendingWinnerTx = null;
        }
      }
    } catch (error) {
      logger.error('Error checking for winner:', error);
      // Clear pending transaction on error
      this.pendingWinnerTx = null;
    }
  }

  private async getWinnerFromTransaction(receipt: any) {
    try {
      // Parse the WinnerDeclared event from transaction logs
      const winnerDeclaredEvent = receipt.logs.find((log: any) => {
        // Look for WinnerDeclared event (you'll need to decode this properly)
        return log.topics && log.topics[0] === ethers.id('WinnerDeclared(address,uint256,uint256,uint256)');
      });

      if (winnerDeclaredEvent) {
        // Decode the event data
        const decoded = this.contract?.interface.parseLog(winnerDeclaredEvent);
        if (decoded) {
          return {
            winner: decoded.args[0],
            prize: ethers.formatEther(decoded.args[1]),
            timestamp: Number(decoded.args[2]),
            vaultRemaining: ethers.formatEther(decoded.args[3])
          };
        }
      }
    } catch (error) {
      logger.error('Error parsing winner from transaction:', error);
    }
    return null;
  }

  private async updateGameState() {
    if (!this.contract) return;

    // Check if contract is ready before making calls
    if (!(await this.isContractReady())) {
      logger.warn('Contract not ready, using fallback game state');
      const fallbackState = await this.getFallbackGameState();
      this.gameState = fallbackState;
      this.broadcastMessage({
        type: 'gameState',
        data: fallbackState,
        timestamp: Date.now()
      });
      return;
    }

    try {
      // Add delay between calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

      let timeRemaining: bigint;
      let lastPlayerInfo: [string, bigint];
      let vaultBalance: bigint;
      let entryFee: bigint;
      let timerDuration: bigint;

      try {
        [
          timeRemaining,
          lastPlayerInfo,
          vaultBalance,
          entryFee,
          timerDuration
        ] = await Promise.all([
          this.contract.getTimeRemaining(),
          this.contract.getLastPlayerInfo(),
          this.contract.getVaultBalance(),
          this.contract.entryFee(),
          this.contract.timerDuration()
        ]);
      } catch (error) {
        logger.warn('Contract call failed during game state update:', error);
        // Use fallback values when contract calls fail
        timeRemaining = BigInt(0);
        lastPlayerInfo = ['0x0000000000000000000000000000000000000000', BigInt(0)];
        vaultBalance = BigInt(0);
        entryFee = BigInt(0);
        timerDuration = BigInt(300); // Default 5 minutes
      }

      const [lastPlayer, lastWagerTime] = lastPlayerInfo;

      // Format token amounts with USD values
      const tokenName = process.env.TOKEN_NAME || 'ETH';
      const vaultBalanceFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(vaultBalance), tokenName);
      const entryFeeFormatted = await this.formatTokenAmountWithUSD(ethers.formatEther(entryFee), tokenName);

      const newGameState: GameState = {
        timeRemaining: Number(timeRemaining),
        isGameStarted: lastPlayer !== '0x0000000000000000000000000000000000000000',
        lastPlayer,
        vaultBalance: vaultBalanceFormatted,
        entryFee: entryFeeFormatted,
        timerDuration: Number(timerDuration),
        gameActive: true // Assuming game is always active
      };

            // Check for new player activity
            if (lastPlayer !== '0x0000000000000000000000000000000000000000' && 
              lastPlayer !== this.lastPlayerAddress && 
              this.lastPlayerAddress !== '') {
                this.playerCount++;
            this.addPlayerActivity(lastPlayer, 'joined', ethers.formatEther(entryFee));
          }
          this.lastPlayerAddress = lastPlayer;

      // Only broadcast if state changed
      if (!this.gameState || this.hasStateChanged(this.gameState, newGameState)) {
        this.gameState = newGameState;
        this.lastUpdate = Date.now();

        this.broadcastMessage({
          type: 'gameState',
          data: this.gameState,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Failed to update game state:', error);
      
      // If rate limited, increase sync interval temporarily
      if (error instanceof Error && error.message.includes('Too Many Requests')) {
        logger.warn('Rate limited, increasing sync interval to 30 seconds');
        if (this.syncInterval) {
          clearInterval(this.syncInterval);
          this.syncInterval = setInterval(() => {
            this.updateGameState();
          }, 30000);
        }
      }
    }
  }

  private hasStateChanged(oldState: GameState, newState: GameState): boolean {
    return (
      oldState.timeRemaining !== newState.timeRemaining ||
      oldState.isGameStarted !== newState.isGameStarted ||
      oldState.lastPlayer !== newState.lastPlayer ||
      oldState.vaultBalance !== newState.vaultBalance ||
      oldState.gameActive !== newState.gameActive
    );
  }

  private handleClientMessage(ws: WebSocket, data: any) {
    switch (data.type) {
      case 'ping':
        this.sendMessage(ws, { type: 'pong', data: {}, timestamp: Date.now() });
        break;
      case 'getGameState':
        if (this.gameState) {
          this.sendMessage(ws, {
            type: 'gameState',
            data: this.gameState,
            timestamp: Date.now()
          });
        }
        break;
      default:
        logger.warn('Unknown WebSocket message type:', data.type);
    }
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private addPlayerActivity(address: string, action: 'joined' | 'won' | 'vault_funded', amount?: string, transactionHash?: string) {
    const activity: PlayerActivity = {
      address,
      action,
      timestamp: Date.now(),
      amount,
      transactionHash
    };

    // Add to recent activities (keep last 50)
    this.recentActivities.unshift(activity);
    if (this.recentActivities.length > 50) {
      this.recentActivities = this.recentActivities.slice(0, 50);
    }

    // Broadcast to all clients
    this.broadcastMessage({
      type: 'playerActivity',
      data: activity,
      timestamp: Date.now()
    });

    logger.info(`Player activity: ${address} ${action}${amount ? ` (${amount})` : ''}`);
  }

  private broadcastMessage(message: WebSocketMessage) {
    const data = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      } else {
        // Remove dead connections
        this.clients.delete(client);
      }
    });
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getGameState(): GameState | null {
    return this.gameState;
  }

    // Public method to get recent activities for API endpoints
  public getRecentActivities(limit: number = 20): PlayerActivity[] {
    return this.recentActivities.slice(0, limit);
  }

  // Public method to manually add activity (for testing or external triggers)
  public addActivity(address: string, action: 'joined' | 'won' | 'vault_funded', amount?: string, transactionHash?: string) {
    this.addPlayerActivity(address, action, amount, transactionHash);
  }

  // Public method to manually trigger winner check
  public async checkWinner() {
    return await this.checkForWinner();
  }

  // Method to save winner to database
  private async saveWinnerToDatabase(winner: Winner) {
    try {
      const contractAddress = process.env.CONTRACT_ADDRESS;
      if (!contractAddress) {
        logger.error('CONTRACT_ADDRESS environment variable not set');
        return;
      }

      await this.prisma.game.create({
        data: {
          contractAddress: contractAddress,
          networkId: parseInt(process.env.NETWORK_ID || '11155111'), // Sepolia
          tokenName: process.env.TOKEN_NAME || 'ETH',
          entryFee: process.env.ENTRY_FEE || '0.01',
          timerDuration: parseInt(process.env.TIMER_DURATION || '300'),
          status: 'completed',
          currentVault: '0',
          winnerAddress: winner.address,
          winnerPrize: winner.prize,
          playerCount: winner.playerCount,
          endedAt: new Date(winner.timestamp)
        }
      });
      logger.info(`Winner saved to database for contract ${contractAddress}: ${winner.address} won ${winner.prize} ETH`);
    } catch (error) {
      logger.error('Failed to save winner to database:', error);
    }
  }

  // Public method to clear pending transaction (for debugging)
  public clearPendingTransaction() {
    this.pendingWinnerTx = null;
    logger.info('Pending transaction cleared');
  }

      // Public method to get recent winners
  public getRecentWinners(limit: number = 10): Winner[] {
    return this.recentWinners.slice(0, limit).map((winner, index) => ({
      ...winner,
      rank: index + 1
    }));
  }


  public destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    if (this.winnerCheckInterval) {
      clearInterval(this.winnerCheckInterval);
    }
    
    this.clients.forEach(client => {
      client.close();
    });
    
    this.wss.close();
    logger.info('WebSocket server destroyed');
  }
}
