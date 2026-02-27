'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Network = 'solana' | 'bnb' | 'evm';

export interface NetworkConfig {
  network: Network;
  gmRestUrl: string;
  gmWsUrl: string;
  explorerUrl: string;
  label: string;
  accentColor: string;
  entryFee: string;
  currency: string;
  addressLabel: string;
  addressValue: string;
}

const FALLBACK_BNB_REST = process.env.NEXT_PUBLIC_GM_REST_URL || 'https://clawboardgames-gm.onrender.com';
const FALLBACK_BNB_WS = process.env.NEXT_PUBLIC_GM_WS_URL || 'wss://clawboardgames-gm.onrender.com/ws';

export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  solana: {
    network: 'solana',
    gmRestUrl: process.env.NEXT_PUBLIC_GM_SOLANA_REST_URL || 'https://clawboardgames-gm-solana.onrender.com',
    gmWsUrl: process.env.NEXT_PUBLIC_GM_SOLANA_WS_URL || 'wss://clawboardgames-gm-solana.onrender.com/ws',
    explorerUrl: 'https://explorer.solana.com',
    label: 'Solana',
    accentColor: '#00D4AA',
    entryFee: '0.01 SOL',
    currency: 'SOL',
    addressLabel: 'Program',
    addressValue: process.env.NEXT_PUBLIC_CLAWMATE_SOLANA_ESCROW_PROGRAM_ID || '',
  },
  bnb: {
    network: 'bnb',
    gmRestUrl: process.env.NEXT_PUBLIC_GM_BNB_REST_URL || FALLBACK_BNB_REST,
    gmWsUrl: process.env.NEXT_PUBLIC_GM_BNB_WS_URL || FALLBACK_BNB_WS,
    explorerUrl: 'https://testnet.bscscan.com',
    label: 'BNB Chain',
    accentColor: '#F0B90B',
    entryFee: '0.001 BNB',
    currency: 'BNB',
    addressLabel: 'Contract',
    addressValue: process.env.NEXT_PUBLIC_GM_BNB_SETTLEMENT_ADDRESS || '',
  },
  evm: {
    network: 'evm',
    gmRestUrl: FALLBACK_BNB_REST,
    gmWsUrl: FALLBACK_BNB_WS,
    explorerUrl: 'https://explorer.monad.xyz',
    label: 'Monad',
    accentColor: '#9945FF',
    entryFee: '0.001 MON',
    currency: 'MON',
    addressLabel: 'Contract',
    addressValue: process.env.NEXT_PUBLIC_CLAWMATE_ESCROW_CONTRACT_ADDRESS || '',
  },
};

interface NetworkContextValue {
  network: Network;
  setNetwork: (n: Network) => void;
  config: NetworkConfig;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: 'solana',
  setNetwork: () => {},
  config: NETWORK_CONFIGS.solana,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<Network>('solana');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cbg-network') : null;
    if (saved === 'bnb' || saved === 'solana' || saved === 'evm') setNetworkState(saved);
  }, []);

  const setNetwork = (n: Network) => {
    setNetworkState(n);
    if (typeof window !== 'undefined') localStorage.setItem('cbg-network', n);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-network', network);
  }, [network]);

  return (
    <NetworkContext.Provider value={{ network, setNetwork, config: NETWORK_CONFIGS[network] }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
