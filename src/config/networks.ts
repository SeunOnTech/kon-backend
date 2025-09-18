interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    symbol: string;
    decimals: number;
  };
  contractAddress: string;
  priceUpdateThreshold: number;
}

// All the available networks for the contract
const ALL_NETWORKS: { [key: string]: NetworkConfig } = {
  'ethereum-sepolia': {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL!,
    nativeCurrency: {
      symbol: 'ETH',
      decimals: 18
    },
    contractAddress: process.env.SEPOLIA_CONTRACT_ADDRESS!,
    priceUpdateThreshold: parseInt(process.env.SEPOLIA_PRICE_THRESHOLD || '5')
  },
  // 'polygon-mumbai': {
  //   name: 'Polygon Mumbai',
  //   chainId: 80001,
  //   rpcUrl: process.env.MUMBAI_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'MATIC',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.MUMBAI_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.MUMBAI_PRICE_THRESHOLD || '5')
  // },
  // 'bsc-testnet': {
  //   name: 'BSC Testnet',
  //   chainId: 97,
  //   rpcUrl: process.env.BSC_TESTNET_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'BNB',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.BSC_TESTNET_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.BSC_TESTNET_PRICE_THRESHOLD || '5')
  // },
  // 'avalanche-fuji': {
  //   name: 'Avalanche Fuji',
  //   chainId: 43113,
  //   rpcUrl: process.env.FUJI_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'AVAX',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.FUJI_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.FUJI_PRICE_THRESHOLD || '5')
  // },
  // 'base-sepolia': {
  //   name: 'Base Sepolia',
  //   chainId: 84532,
  //   rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'ETH',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.BASE_SEPOLIA_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.BASE_SEPOLIA_PRICE_THRESHOLD || '5')
  // },
  // 'arbitrum-sepolia': {
  //   name: 'Arbitrum Sepolia',
  //   chainId: 421614,
  //   rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'ETH',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.ARBITRUM_SEPOLIA_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.ARBITRUM_SEPOLIA_PRICE_THRESHOLD || '5')
  // },
  // 'optimism-sepolia': {
  //   name: 'Optimism Sepolia',
  //   chainId: 11155420,
  //   rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL!,
  //   nativeCurrency: {
  //     symbol: 'ETH',
  //     decimals: 18
  //   },
  //   contractAddress: process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS!,
  //   priceUpdateThreshold: parseInt(process.env.OPTIMISM_SEPOLIA_PRICE_THRESHOLD || '5')
  // },
  '0g': {
    name: '0g Testnet',
    chainId: 16600,
    rpcUrl: process.env.ZEROG_RPC_URL!,
    nativeCurrency: {
      symbol: '0G',
      decimals: 18
    },
    contractAddress: process.env.ZEROG_CONTRACT_ADDRESS!,
    priceUpdateThreshold: parseInt(process.env.ZEROG_PRICE_THRESHOLD || '5')
  }
};

// Get enabled networks from environment variable
const getEnabledNetworks = (): NetworkConfig[] => {
  const enabledNetworks = process.env.ENABLED_NETWORKS?.split(',').map(n => n.trim()) || ['ethereum-sepolia'];
  
  return enabledNetworks
    .map(networkKey => ALL_NETWORKS[networkKey])
    .filter(network => {
      if (!network) {
        console.warn(`Network configuration not found for key: ${network}`);
        return false;
      }
      
      if (!network.rpcUrl || !network.contractAddress) {
        console.warn(`Missing environment variables for ${network.name}. Skipping...`);
        return false;
      }
      
      return true;
    });
};
export const NETWORK_CONFIGS: NetworkConfig[] = getEnabledNetworks();