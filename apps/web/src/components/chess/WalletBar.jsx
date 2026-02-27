"use client";
import React, { useState, useEffect } from "react";
import { useChess } from "@/app/chess/ChessContext";
import { api } from "@/lib/chess-api";
import { getSolanaWallet, connectSolanaWallet } from "@/lib/chess-signer";

// Monad Mainnet (chain ID 143)
const MONAD_CHAIN_ID = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_CHAIN_ID) || "0x8f";
const MONAD_RPC_URL = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_RPC_URL) || "https://rpc.monad.xyz";
const MONAD_CHAIN_NAME = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_CHAIN_NAME) || "Monad";
const MONAD_BLOCK_EXPLORER = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BLOCK_EXPLORER_URL) || "https://explorer.monad.xyz";

// BNB testnet (chain ID 97)
const BNB_CHAIN_ID = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BNB_CHAIN_ID) || "0x61";
const BNB_RPC_URL = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BNB_RPC_URL) || "https://data-seed-prebsc-1-s1.binance.org:8545";
const BNB_CHAIN_NAME = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BNB_CHAIN_NAME) || "BNB Smart Chain Testnet";
const BNB_BLOCK_EXPLORER = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BNB_BLOCK_EXPLORER_URL) || "https://testnet.bscscan.com";

function getEvmChainConfig(chain) {
  if (chain === "bnb") {
    return { chainId: BNB_CHAIN_ID, rpcUrl: BNB_RPC_URL, chainName: BNB_CHAIN_NAME, blockExplorer: BNB_BLOCK_EXPLORER, symbol: "tBNB" };
  }
  return { chainId: MONAD_CHAIN_ID, rpcUrl: MONAD_RPC_URL, chainName: MONAD_CHAIN_NAME, blockExplorer: MONAD_BLOCK_EXPLORER, symbol: "MON" };
}

const WALLET_STORAGE_KEY = "clawmate_wallet";
const CHAIN_STORAGE_KEY = "clawmate_chain";
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

export default function WalletBar({ wallet, setWallet, chain, setChain }) {
  const { client } = useChess();
  const effectiveChain = chain ?? "evm";
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [myUsername, setMyUsername] = useState(null);
  const [showSetName, setShowSetName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState(null);
  const [savingName, setSavingName] = useState(false);

  // Restore chain from localStorage
  useEffect(() => {
    if (setChain) {
      try {
        const stored = localStorage.getItem(CHAIN_STORAGE_KEY);
        if (stored === "solana" || stored === "evm" || stored === "bnb") setChain(stored);
      } catch (_) {}
    }
  }, [setChain]);

  // Restore wallet from localStorage on load (no popup; only reconnects if wallet is still unlocked/connected)
  useEffect(() => {
    if (wallet) return;
    const storedChain = (() => {
      try { return localStorage.getItem(CHAIN_STORAGE_KEY); } catch { return null; }
    })();
    const stored = (() => {
      try { return localStorage.getItem(WALLET_STORAGE_KEY); } catch { return null; }
    })();
    if (!stored) return;
    if (storedChain === "solana") {
      const solana = getSolanaWallet();
      if (solana && solana.publicKey?.toBase58?.() === stored) setWallet(stored);
      else try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
      return;
    }
    if (storedChain === "evm" || storedChain === "bnb" || !storedChain) {
      if (!window.ethereum) return;
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if (!accounts?.length) return;
          const lower = stored.toLowerCase();
          const found = accounts.find((a) => a.toLowerCase() === lower);
          if (found) setWallet(found);
          else try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
        })
        .catch(() => {
          try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
        });
    }
  }, []);

  // Sync when user switches account in wallet (e.g. MetaMask) — EVM & BNB
  useEffect(() => {
    if ((effectiveChain !== "evm" && effectiveChain !== "bnb") || !window.ethereum?.on) return;
    const onAccountsChanged = (accounts) => {
      if (!accounts?.length) {
        setWallet(null);
        try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
      } else {
        setWallet(accounts[0]);
        try { localStorage.setItem(WALLET_STORAGE_KEY, accounts[0]); } catch (_) {}
      }
    };
    window.ethereum.on("accountsChanged", onAccountsChanged);
    return () => { window.ethereum.off?.("accountsChanged", onAccountsChanged); };
  }, [effectiveChain]);

  // Sync when Phantom account changes
  useEffect(() => {
    if (effectiveChain !== "solana" || typeof window === "undefined") return;
    const w = typeof window !== "undefined" ? window.solana : null;
    if (!w?.on) return;
    const onAccountChanged = (pk) => {
      if (pk) {
        const addr = pk.toBase58?.() ?? String(pk);
        setWallet(addr);
        try { localStorage.setItem(WALLET_STORAGE_KEY, addr); } catch (_) {}
      } else {
        setWallet(null);
        try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
      }
    };
    w.on("accountChanged", onAccountChanged);
    return () => { w.off?.("accountChanged", onAccountChanged); };
  }, [effectiveChain]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      if (effectiveChain === "solana") {
        const addr = await connectSolanaWallet();
        if (!addr) {
          setError("Phantom not found. Install Phantom wallet to play on Solana.");
          return;
        }
        setWallet(addr);
        try { if (addr) localStorage.setItem(WALLET_STORAGE_KEY, addr); } catch (_) {}
        if (setChain) {
          setChain("solana");
          try { localStorage.setItem(CHAIN_STORAGE_KEY, "solana"); } catch (_) {}
        }
      } else {
        if (!window.ethereum) {
          setError("No wallet found. Install MetaMask or a compatible wallet to play.");
          return;
        }
        const cfg = getEvmChainConfig(effectiveChain);
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== cfg.chainId) {
          try {
            await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainId }] });
          } catch (e) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: cfg.chainId,
                chainName: cfg.chainName,
                nativeCurrency: { name: cfg.symbol, symbol: cfg.symbol, decimals: 18 },
                rpcUrls: [cfg.rpcUrl],
                blockExplorerUrls: [cfg.blockExplorer],
              }],
            });
          }
        }
        const account = accounts[0];
        setWallet(account);
        try { if (account) localStorage.setItem(WALLET_STORAGE_KEY, account); } catch (_) {}
        if (setChain) {
          setChain(effectiveChain);
          try { localStorage.setItem(CHAIN_STORAGE_KEY, effectiveChain); } catch (_) {}
        }
      }
    } catch (e) {
      setError(e?.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  // Fetch username when wallet is set
  useEffect(() => {
    if (!wallet) {
      setMyUsername(null);
      return;
    }
    let cancelled = false;
    const w = effectiveChain === "solana" ? wallet : wallet.toLowerCase();
    api(`/api/profile/username?wallet=${encodeURIComponent(w)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMyUsername(d.username || null); })
      .catch(() => { if (!cancelled) setMyUsername(null); });
    return () => { cancelled = true; };
  }, [wallet]);

  const disconnect = () => {
    setWallet(null);
    setMyUsername(null);
    setShowSetName(false);
    try {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    } catch (_) {}
  };

  const openSetName = () => {
    setNameInput(myUsername || "");
    setNameError(null);
    setShowSetName(true);
  };

  const saveUsername = async () => {
    const trimmed = nameInput.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      setNameError("3–20 characters, letters, numbers, underscore, or hyphen");
      return;
    }
    if (!client) {
      setNameError("Wallet not connected");
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const data = await client.setUsername(trimmed);
      setMyUsername(data?.username || trimmed);
      setShowSetName(false);
    } catch (e) {
      setNameError(e?.message || "Failed to set username");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="wallet-bar">
      {setChain && (
        <select
          className="wallet-chain-select"
          value={effectiveChain}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "solana" || v === "evm" || v === "bnb") {
              setChain(v);
              setWallet(null);
              try {
                localStorage.setItem(CHAIN_STORAGE_KEY, v);
                localStorage.removeItem(WALLET_STORAGE_KEY);
              } catch (_) {}
            }
          }}
          disabled={!!wallet}
          title={wallet ? "Disconnect to switch chain" : "Select network"}
        >
          <option value="evm">Monad (EVM)</option>
          <option value="bnb">BNB Testnet</option>
          <option value="solana">Solana</option>
        </select>
      )}
      {error && <span className="wallet-error">{error}</span>}
      {wallet ? (
        <>
          <span className="wallet-addr" title={wallet}>
            {myUsername || `${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
          </span>
          <button type="button" className="btn btn-ghost wallet-set-name" onClick={openSetName} title="Set username for leaderboard">
            Set Username
          </button>
          <button type="button" className="btn btn-ghost" onClick={disconnect}>Disconnect</button>
          {showSetName && (
            <div className="wallet-name-modal" role="dialog" aria-label="Set username">
              <div className="wallet-name-modal-inner">
                <label htmlFor="wallet-username-input">Username</label>
                <input
                  id="wallet-username-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="3–20 characters"
                  maxLength={20}
                  autoFocus
                />
                {nameError && <p className="wallet-name-error">{nameError}</p>}
                <div className="wallet-name-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowSetName(false)}>Cancel</button>
                  <button type="button" className="btn" onClick={saveUsername} disabled={savingName}>
                    {savingName ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <button type="button" className="btn" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
      )}
    </div>
  );
}
