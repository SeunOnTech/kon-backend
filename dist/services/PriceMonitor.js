"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
class PriceMonitor {
    constructor(networks, updateInterval = 30) {
        this.TARGET_USD_VALUE = 10;
        this.networks = networks;
        this.updateInterval = updateInterval;
    }
    async getTokenPrice(tokenSymbol) {
        console.log(`🔍 Fetching current price for ${tokenSymbol}...`);
        try {
            const price = await this.getPriceFromCoinGecko(tokenSymbol);
            console.log(`Price from CoinGecko: $${price.price}`);
            return price;
        }
        catch (error) {
            console.error(`Failed to fetch price for ${tokenSymbol}:`, error);
            throw new Error(`Unable to fetch current price for ${tokenSymbol}. Deployment requires live price data.`);
        }
    }
    async getPriceFromCoinGecko(tokenSymbol) {
        const coinGeckoIds = {
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
        const data = await response.json();
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
    async startMonitoring() {
        console.log(`Starting price monitoring for ${this.networks.length} networks`);
        console.log(`Update interval: ${this.updateInterval} minutes`);
        await this.checkAndUpdateAllNetworks();
        // Schedule recurring updates
        setInterval(async () => {
            await this.checkAndUpdateAllNetworks();
        }, this.updateInterval * 60 * 1000);
    }
    async checkAndUpdateAllNetworks() {
        for (const network of this.networks) {
            try {
                await this.checkAndUpdateNetwork(network);
            }
            catch (error) {
                console.error(`Failed to update ${network.name}:`, error);
            }
        }
    }
    async checkAndUpdateNetwork(network) {
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
        }
        else {
            console.log(`${network.name} entry fee is still accurate (${priceChange.toFixed(2)}% change)`);
        }
    }
    calculateEntryFee(tokenPrice, tokenSymbol) {
        const tokenAmount = this.TARGET_USD_VALUE / tokenPrice;
        const tokenAmountString = tokenAmount.toFixed(18);
        return ethers_1.ethers.parseUnits(tokenAmountString, 18);
    }
    calculatePriceChange(currentFee, newFee) {
        const current = Number(ethers_1.ethers.formatEther(currentFee));
        const newAmount = Number(ethers_1.ethers.formatEther(newFee));
        return ((newAmount - current) / current) * 100;
    }
    async getCurrentEntryFee(network) {
        const provider = new ethers_1.ethers.JsonRpcProvider(network.rpcUrl);
        const contract = new ethers_1.ethers.Contract(network.contractAddress, ['function entryFee() external view returns (uint256)'], provider);
        return await contract.entryFee();
    }
    async updateEntryFee(network, newEntryFee, priceData) {
        const provider = new ethers_1.ethers.JsonRpcProvider(network.rpcUrl);
        const wallet = new ethers_1.ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const contract = new ethers_1.ethers.Contract(network.contractAddress, [
            'function updateEntryFee(uint256 _newEntryFee) external onlyOwner',
            'function entryFee() external view returns (uint256)'
        ], wallet);
        const gasEstimate = await contract.updateEntryFee.estimateGas(newEntryFee);
        const tx = await contract.updateEntryFee(newEntryFee, {
            gasLimit: gasEstimate * 120n / 100n
        });
        console.log(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        await this.logEntryFeeUpdate(network, newEntryFee, priceData, tx.hash);
    }
    async logEntryFeeUpdate(network, newEntryFee, priceData, txHash) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            network: network.name,
            contractAddress: network.contractAddress,
            newEntryFee: ethers_1.ethers.formatEther(newEntryFee),
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
exports.default = PriceMonitor;
