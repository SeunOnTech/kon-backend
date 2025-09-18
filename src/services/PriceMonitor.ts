import { ethers } from 'ethers';

interface PriceData {
  price: number;
  source: string;
  timestamp: number;
  network: string;
}

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    symbol: string;
    decimals: number;
  };
  contractAddress: string;
  priceUpdateThreshold: number; // Percentage change to trigger update
}

class PriceMonitor {
  private readonly TARGET_USD_VALUE = 10;
  private readonly networks: NetworkConfig[];
  private readonly updateInterval: number; // in minutes

  constructor(networks: NetworkConfig[], updateInterval: number = 30) {
    this.networks = networks;
    this.updateInterval = updateInterval;
  }

  async getTokenPrice(tokenSymbol: string): Promise<PriceData> {
    console.log(`🔍 Fetching current price for ${tokenSymbol}...`);
    
    try {
      const price = await this.getPriceFromCoinGecko(tokenSymbol);
      console.log(`Price from CoinGecko: $${price.price}`);
      return price;
    } catch (error) {
      console.error(`Failed to fetch price for ${tokenSymbol}:`, error);
      throw new Error(`Unable to fetch current price for ${tokenSymbol}. Deployment requires live price data.`);
    }
  }

  private async getPriceFromCoinGecko(tokenSymbol: string): Promise<PriceData> {
    const coinGeckoIds: { [key: string]: string } = {
      'ETH': 'ethereum',
      'MATIC': 'matic-network',
      'BNB': 'binancecoin',
      'AVAX': 'avalanche-2',
      '0G': '0g'
    };

    const coinId = coinGeckoIds[tokenSymbol];
    if (!coinId) {
      throw new Error(`No CoinGecko ID found for ${tokenSymbol}`);
    }

    if (tokenSymbol === '0G') {
      return {
        price: 18.0,
        source: 'Fixed Price',
        timestamp: Date.now(),
        network: tokenSymbol
      };
    }

    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const price = data[coinId]?.usd;
    
    if (!price || typeof price !== 'number') {
      throw new Error(`No valid price data for ${coinId}`);
    }

    return {
      price,
      source: 'CoinGecko',
      timestamp: Date.now(),
      network: tokenSymbol
    };
  }

  async startMonitoring(): Promise<void> {
    console.log(`Starting price monitoring for ${this.networks.length} networks`);
    console.log(`Update interval: ${this.updateInterval} minutes`);
    
    await this.checkAndUpdateAllNetworks();
    
    // Schedule recurring updates
    setInterval(async () => {
      await this.checkAndUpdateAllNetworks();
    }, this.updateInterval * 60 * 1000);
  }

  private async checkAndUpdateAllNetworks(): Promise<void> {
    for (const network of this.networks) {
      try {
        await this.checkAndUpdateNetwork(network);
      } catch (error) {
        console.error(`Failed to update ${network.name}:`, error);
      }
    }
  }

  private async checkAndUpdateNetwork(network: NetworkConfig): Promise<void> {
    console.log(`🔍 Checking ${network.name}...`);
   
    const priceData = await this.getTokenPrice(network.nativeCurrency.symbol);
    console.log(`${network.nativeCurrency.symbol} price: $${priceData.price} (${priceData.source})`);
    
    const newEntryFee = this.calculateEntryFee(priceData.price, network.nativeCurrency.symbol);
    
    const currentEntryFee = await this.getCurrentEntryFee(network);
    
    const priceChange = this.calculatePriceChange(currentEntryFee, newEntryFee);
    
    if (Math.abs(priceChange) >= network.priceUpdateThreshold) {
      console.log(`Price change detected: ${priceChange.toFixed(2)}%`);
      console.log(`Updating entry fee for ${network.name}...`);
      
      await this.updateEntryFee(network, newEntryFee, priceData);
      
      console.log(`Entry fee updated for ${network.name}`);
    } else {
      console.log(`${network.name} entry fee is still accurate (${priceChange.toFixed(2)}% change)`);
    }
  }

  private calculateEntryFee(tokenPrice: number, tokenSymbol: string): bigint {
    const tokenAmount = this.TARGET_USD_VALUE / tokenPrice;
    const tokenAmountString = tokenAmount.toFixed(18);
    return ethers.parseUnits(tokenAmountString, 18);
  }

  private calculatePriceChange(currentFee: bigint, newFee: bigint): number {
    const current = Number(ethers.formatEther(currentFee));
    const newAmount = Number(ethers.formatEther(newFee));
    return ((newAmount - current) / current) * 100;
  }

  private async getCurrentEntryFee(network: NetworkConfig): Promise<bigint> {
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const contract = new ethers.Contract(
      network.contractAddress,
      ['function entryFee() external view returns (uint256)'],
      provider
    );
    
    return await contract.entryFee();
  }

  private async updateEntryFee(network: NetworkConfig, newEntryFee: bigint, priceData: PriceData): Promise<void> {
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    
    const contract = new ethers.Contract(
      network.contractAddress,
      [
        'function updateEntryFee(uint256 _newEntryFee) external onlyOwner',
        'function entryFee() external view returns (uint256)'
      ],
      wallet
    );
    
    const gasEstimate = await contract.updateEntryFee.estimateGas(newEntryFee);
    
    const tx = await contract.updateEntryFee(newEntryFee, {
      gasLimit: gasEstimate * 120n / 100n 
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    await this.logEntryFeeUpdate(network, newEntryFee, priceData, tx.hash);
  }

  private async logEntryFeeUpdate(network: NetworkConfig, newEntryFee: bigint, priceData: PriceData, txHash: string): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      network: network.name,
      contractAddress: network.contractAddress,
      newEntryFee: ethers.formatEther(newEntryFee),
      newEntryFeeWei: newEntryFee.toString(),
      tokenPrice: priceData.price,
      priceSource: priceData.source,
      usdValue: this.TARGET_USD_VALUE,
      transactionHash: txHash
    };
    
    console.log(`Entry fee update logged:`, logEntry);
    
    // TODO: Save to database, send to monitoring service, etc.
    // await this.saveToDatabase(logEntry);
  }
}

export default PriceMonitor;