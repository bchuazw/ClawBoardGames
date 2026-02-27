"use client";
import React, { useState } from "react";
import { parseEther } from "ethers";
import { createLobbyOnChain, createLobbyOnChainSolana } from "clawmate-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { useChess } from "@/app/chess/ChessContext";
import { getBrowserSigner, getSolanaWallet } from "@/lib/chess-signer";
import { hasEscrow, getEscrowAddress, hasBnbEscrow, getBnbEscrowAddress, hasSolanaEscrow, getSolanaProgramId, getSolanaRpcUrl, solToLamports } from "@/lib/chess-escrow";
import idl from "@/lib/chess_bet_escrow_idl.json";

export default function CreateLobby({ wallet, chain = "evm", rulesAccepted, onShowRules, onCreated, onBack }) {
  const { client } = useChess();
  const [betAmount, setBetAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingLobbyId, setExistingLobbyId] = useState(null);

  const create = async () => {
    if (!wallet || !client) return;
    if (!rulesAccepted) {
      onShowRules?.();
      return;
    }
    setLoading(true);
    setError(null);
    setExistingLobbyId(null);
    try {
      const amountStr = betAmount?.trim() || "0";
      let betAmountApi = "0";
      let contractGameId = null;

      if (chain === "solana") {
        const stakeLamports = solToLamports(amountStr);
        if (stakeLamports < 0) {
          setError("Invalid amount. Use a number (e.g. 0.001 or 1).");
          setLoading(false);
          return;
        }
        betAmountApi = String(stakeLamports);
        if (hasSolanaEscrow() && stakeLamports > 0) {
          const phantom = getSolanaWallet();
          const programId = getSolanaProgramId();
          if (!phantom || !programId) {
            setError("Phantom or Solana escrow not configured");
            setLoading(false);
            return;
          }
          try {
            const connection = new Connection(getSolanaRpcUrl());
            contractGameId = await createLobbyOnChainSolana({
              connection,
              programId: new PublicKey(programId),
              idl,
              signer: phantom,
              stakeLamports,
            });
          } catch (e) {
            setError(e?.message ?? "Transaction failed or was rejected");
            setLoading(false);
            return;
          }
        }
      } else {
        try {
          betAmountApi = String(parseEther(amountStr));
        } catch {
          setError("Invalid amount. Use a number (e.g. 0.001 or 1).");
          setLoading(false);
          return;
        }
        const evmEscrow = chain === "bnb" ? hasBnbEscrow() : hasEscrow();
        const evmAddress = chain === "bnb" ? getBnbEscrowAddress() : getEscrowAddress();
        if (evmEscrow && BigInt(betAmountApi) > 0n) {
          const signer = await getBrowserSigner();
          if (!signer || !evmAddress) {
            setError("Wallet or escrow not configured");
            setLoading(false);
            return;
          }
          try {
            contractGameId = await createLobbyOnChain({ signer, contractAddress: evmAddress, betWei: betAmountApi });
          } catch (e) {
            setError(e?.reason ?? e?.message ?? "Transaction failed or was rejected");
            setLoading(false);
            return;
          }
        }
      }

      const data = await client.createLobby({ betAmountWei: betAmountApi, contractGameId });
      if (data?.lobbyId) {
        onCreated(data.lobbyId, data);
      } else {
        setError(data?.error || "Failed to create lobby");
        if (data?.existingLobbyId) setExistingLobbyId(data.existingLobbyId);
      }
    } catch (e) {
      setError(e?.reason ?? e?.message ?? "Request failed");
      if (e?.existingLobbyId) setExistingLobbyId(e.existingLobbyId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="create-lobby create-lobby-page">
      <button type="button" className="btn btn-back" onClick={onBack}>
        ← Back
      </button>

      {!rulesAccepted && (
        <div className="create-lobby-rules-gate" role="alert">
          <p>You must accept the FIDE rules before creating a lobby.</p>
          <button type="button" className="btn btn-rules-inline" onClick={onShowRules}>
            View &amp; accept rules
          </button>
        </div>
      )}
      <div className="create-lobby-header">
        <h1 className="create-lobby-title">Create lobby</h1>
        <p className="create-lobby-subtitle">
          Set a bet amount in {chain === "solana" ? "SOL" : chain === "bnb" ? "tBNB" : "MON"}. Others can join by matching the same bet.
        </p>
      </div>

      <div className="create-lobby-card">
        <div className="create-lobby-card-icon">♟</div>
        <div className="form-group">
          <label htmlFor="bet-amount">Bet amount ({chain === "solana" ? "SOL" : chain === "bnb" ? "tBNB" : "MON"})</label>
          <input
            id="bet-amount"
            type="text"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="0.001"
            className="create-lobby-input"
          />
          <span className="form-hint">Use 0 or leave empty for no on-chain wager (test games).</span>
        </div>
        {error && (
          <div className="create-lobby-error" role="alert">
            <p>{error}</p>
            {existingLobbyId && client && (
              <button
                type="button"
                className="btn btn-go-to-lobby"
                onClick={async () => {
                  try {
                    const data = await client.getLobby(existingLobbyId);
                    if (data?.lobbyId) onCreated(existingLobbyId, data);
                  } catch (_) {}
                }}
              >
                Go to my lobby
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="btn btn-create-lobby"
          onClick={create}
          disabled={!wallet || !client || !rulesAccepted || loading}
        >
          {loading ? "Creating…" : "Create lobby"}
        </button>
      </div>
    </section>
  );
}
