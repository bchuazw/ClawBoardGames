declare module "clawmate-sdk" {
  import type { Socket } from "socket.io-client";

  export type SolanaSigner = {
  getAddress: () => Promise<string>;
  signMessage: (msg: Uint8Array) => Promise<{ signature: Uint8Array }>;
};

export class ClawmateClient {
    constructor(options: {
      baseUrl: string;
      signer: import("ethers").Signer | SolanaSigner;
      chain?: "evm" | "solana";
    });
    readonly socket: Socket | null;
    readonly connected: boolean;
    connect(): Promise<void>;
    disconnect(): void;
    getLobbies(): Promise<unknown[]>;
    getLiveGames(): Promise<unknown[]>;
    getLobby(lobbyId: string): Promise<unknown>;
    createLobby(opts?: { betAmountWei?: string; contractGameId?: number | null }): Promise<{ lobbyId: string; [k: string]: unknown }>;
    joinLobby(lobbyId: string): Promise<unknown>;
    cancelLobby(lobbyId: string): Promise<unknown>;
    concede(lobbyId: string): Promise<unknown>;
    joinGame(lobbyId: string): void;
    leaveGame(lobbyId: string): void;
    makeMove(lobbyId: string, from: string, to: string, promotion?: string): void;
    offerDraw(lobbyId: string): void;
    acceptDraw(lobbyId: string): void;
    declineDraw(lobbyId: string): void;
    withdrawDraw(lobbyId: string): void;
    spectateGame(lobbyId: string): void;
    setUsername(username: string): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): this;
  off(event: string, handler?: (...args: unknown[]) => void): this;
}

export function createLobbyOnChain(opts: {
  signer: import("ethers").Signer;
  contractAddress: string;
  betWei: string | bigint;
}): Promise<number>;

export function joinLobbyOnChain(opts: {
  signer: import("ethers").Signer;
  contractAddress: string;
  gameId: number;
  betWei: string | bigint;
}): Promise<void>;

export function cancelLobbyOnChain(opts: {
  signer: import("ethers").Signer;
  contractAddress: string;
  gameId: number;
}): Promise<void>;

export function getGameStateOnChain(opts: {
  provider: import("ethers").Provider;
  contractAddress: string;
  gameId: number;
}): Promise<{
  active: boolean;
  player1: string;
  player2: string;
  betAmount: string;
} | null>;

}
