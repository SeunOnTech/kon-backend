"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const PriceMonitor_1 = __importDefault(require("./PriceMonitor"));
const networks_1 = require("../config/networks");
class EntryFeeManager {
    constructor() {
        this.isRunning = false;
        this.priceMonitor = new PriceMonitor_1.default(networks_1.NETWORK_CONFIGS, 30); // Check every 30 minutes
    }
    async start() {
        if (this.isRunning) {
            console.log('Entry fee manager is already running');
            return;
        }
        console.log('Starting Entry Fee Manager...');
        this.isRunning = true;
        try {
            await this.priceMonitor.startMonitoring();
        }
        catch (error) {
            console.error('Failed to start price monitoring:', error);
            this.isRunning = false;
            throw error;
        }
    }
    async stop() {
        console.log('Stopping Entry Fee Manager...');
        this.isRunning = false;
    }
    async forceUpdate(networkName) {
        const network = networks_1.NETWORK_CONFIGS.find(n => n.name === networkName);
        if (!network) {
            throw new Error(`Network ${networkName} not found`);
        }
        console.log(`Force updating entry fee for ${networkName}...`);
        await this.checkAndUpdateNetwork(network);
    }
    async checkAndUpdateNetwork(network) {
        console.log(`Checking ${network.name}...`);
        // Get current price
        const priceData = await this.priceMonitor.getTokenPrice(network.nativeCurrency.symbol);
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
        const TARGET_USD_VALUE = 10;
        const tokenAmount = TARGET_USD_VALUE / tokenPrice;
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
            gasLimit: gasEstimate * 120n / 100n // 20% buffer
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
            usdValue: 10,
            transactionHash: txHash
        };
        console.log(`Entry fee update logged:`, logEntry);
    }
    getStatus() {
        return {
            isRunning: this.isRunning,
            networks: networks_1.NETWORK_CONFIGS.map(n => n.name)
        };
    }
    async getCurrentFees() {
        const fees = [];
        for (const network of networks_1.NETWORK_CONFIGS) {
            try {
                const provider = new ethers_1.ethers.JsonRpcProvider(network.rpcUrl);
                const contract = new ethers_1.ethers.Contract(network.contractAddress, ['function entryFee() external view returns (uint256)'], provider);
                const entryFee = await contract.entryFee();
                const priceData = await this.priceMonitor.getTokenPrice(network.nativeCurrency.symbol);
                const usdValue = priceData.price * parseFloat(ethers_1.ethers.formatEther(entryFee));
                fees.push({
                    network: network.name,
                    contractAddress: network.contractAddress,
                    entryFee: ethers_1.ethers.formatEther(entryFee),
                    entryFeeWei: entryFee.toString(),
                    tokenSymbol: network.nativeCurrency.symbol,
                    tokenPrice: priceData.price,
                    usdValue: usdValue,
                    priceSource: priceData.source,
                    lastUpdated: new Date().toISOString()
                });
            }
            catch (error) {
                console.error(`Failed to get fee for ${network.name}:`, error);
                fees.push({
                    network: network.name,
                    contractAddress: network.contractAddress,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        return fees;
    }
}
exports.default = EntryFeeManager;
