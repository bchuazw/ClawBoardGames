"use client";
import React, { useState, useEffect } from "react";
import { useChess } from "@/app/chess/ChessContext";
import { api } from "@/lib/chess-api";

// Network config — defaults to Monad Mainnet (chain ID 143 / 0x8f).
// Override with NEXT_PUBLIC_CLAWMATE_CHAIN_ID, NEXT_PUBLIC_CLAWMATE_RPC_URL, etc.
const CHAIN_ID = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_CHAIN_ID) || "0x8f"; // Monad Mainnet 143
const RPC_URL = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_RPC_URL) || "https://rpc.monad.xyz";
const CHAIN_NAME = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_CHAIN_NAME) || "Monad";
const BLOCK_EXPLORER_URL = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BLOCK_EXPLORER_URL) || "https://explorer.monad.xyz";

const WALLET_STORAGE_KEY = "clawmate_wallet";
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

export default function WalletBar({ wallet, setWallet }) {
  const { client } = useChess();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [myUsername, setMyUsername] = useState(null);
  const [showSetName, setShowSetName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState(null);
  const [savingName, setSavingName] = useState(false);

  // Restore wallet from localStorage on load (no popup; only reconnects if wallet is still unlocked/connected)
  useEffect(() => {
    if (wallet) return;
    const stored = (() => {
      try {
        return localStorage.getItem(WALLET_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!stored || !window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (!accounts?.length) return;
        const lower = stored.toLowerCase();
        const found = accounts.find((a) => a.toLowerCase() === lower);
        if (found) setWallet(found);
        else try {
          localStorage.removeItem(WALLET_STORAGE_KEY);
        } catch (_) {}
      })
      .catch(() => {
        try {
          localStorage.removeItem(WALLET_STORAGE_KEY);
        } catch (_) {}
      });
  }, []);

  // Sync when user switches account in wallet (e.g. MetaMask)
  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccountsChanged = (accounts) => {
      if (!accounts?.length) {
        setWallet(null);
        try {
          localStorage.removeItem(WALLET_STORAGE_KEY);
        } catch (_) {}
      } else {
        setWallet(accounts[0]);
        try {
          localStorage.setItem(WALLET_STORAGE_KEY, accounts[0]);
        } catch (_) {}
      }
    };
    window.ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      window.ethereum.off?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connect = async () => {
    if (!window.ethereum) {
      setError("No wallet found. Install a compatible wallet to play.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_ID }],
          });
        } catch (e) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CHAIN_ID,
              chainName: CHAIN_NAME,
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [BLOCK_EXPLORER_URL],
            }],
          });
        }
      }
      const account = accounts[0];
      setWallet(account);
      try {
        if (account) localStorage.setItem(WALLET_STORAGE_KEY, account);
      } catch (_) {}
    } catch (e) {
      setError(e.message || "Connection failed");
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
    const w = wallet.toLowerCase();
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
