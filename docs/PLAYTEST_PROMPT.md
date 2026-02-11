# OpenClaw Agent Playtest Prompt

Feed this prompt to your OpenClaw agent to have it spawn a subagent that plays a 4-player Monopoly game.

---

## The Prompt

```
You are playing ClawBoardGames Monopoly v2. The GameMaster server is running and ready for games. Your job is to create a game, then connect 4 AI agents that each play with a different strategy, and play a full Monopoly game to completion.

== SETUP ==

You need Node.js with the `ws` package installed.

Run: npm install ws

The GM server is at: GM_URL (replace with actual URL, e.g. http://localhost:3001 or https://your-service.onrender.com)
The GM WebSocket is at: GM_WS (replace with actual WS URL, e.g. ws://localhost:3001/ws or wss://your-service.onrender.com/ws)

== STEP 1: CREATE A GAME ==

POST to GM_URL/games/create with 4 unique Ethereum-style addresses. These are just identifiers in local mode — no real wallets needed.

fetch("GM_URL/games/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    players: [
      "0xAA00000000000000000000000000000000000001",
      "0xBB00000000000000000000000000000000000002",
      "0xCC00000000000000000000000000000000000003",
      "0xDD00000000000000000000000000000000000004"
    ]
  })
});

The response gives you a gameId (starts at 0). Save it.

== STEP 2: CONNECT 4 AGENTS VIA WEBSOCKET ==

Each agent connects to: GM_WS?gameId=GAME_ID&address=PLAYER_ADDRESS

The game auto-starts when all 4 WebSocket connections are established.

== STEP 3: HANDLE MESSAGES AND PLAY ==

The GM sends these message types to each agent:

1. { type: "yourTurn", snapshot: {...}, legalActions: [...] }
   → It's your turn. Pick one action from legalActions and send it back.

2. { type: "snapshot", snapshot: {...} }
   → Broadcast of current game state to all players. Informational.

3. { type: "events", events: [...] }
   → Game events that just happened (dice rolls, purchases, rent, etc). Informational.

4. { type: "gameEnded", winner: N, winnerAddress: "0x...", snapshot: {...} }
   → Game is over. Disconnect.

5. { type: "error", message: "..." }
   → Something went wrong. Usually "Not your turn".

To respond to yourTurn, send:
  { type: "action", action: CHOSEN_ACTION }

Where CHOSEN_ACTION is one of the objects from the legalActions array. You have 10 seconds before the GM auto-plays for you.

== LEGAL ACTIONS ==

These are the possible actions that can appear in legalActions:

- { type: "rollDice" }                           — Roll dice and move
- { type: "buyProperty" }                        — Buy the unowned property you landed on
- { type: "declineBuy" }                         — Skip buying (triggers auction for all players)
- { type: "bid", amount: N }                     — Bid N dollars in auction (N = minimum bid)
- { type: "passBid" }                            — Pass in auction
- { type: "payJailFee" }                         — Pay $50 to leave jail
- { type: "endTurn" }                            — End your turn
- { type: "mortgageProperty", propertyIndex: N } — Mortgage property #N for half its value
- { type: "unmortgageProperty", propertyIndex: N } — Unmortgage for 110% of mortgage value

== STRATEGY FOR EACH AGENT ==

Give each agent a DIFFERENT strategy so the game is interesting:

Agent 0 — AGGRESSIVE:
  - Always buyProperty when available
  - Always bid in auctions
  - Pay jail fee immediately
  - Never mortgage unless forced
  Priority: buyProperty > bid > payJailFee > rollDice > endTurn

Agent 1 — CONSERVATIVE:
  - Only buyProperty if cash > $800
  - Always passBid in auctions
  - Roll for doubles in jail (prefer rollDice over payJailFee)
  - Mortgage if cash < $100
  Priority: rollDice > declineBuy > passBid > endTurn

Agent 2 — SMART (Balanced):
  - buyProperty if cash > $400
  - bid in auctions only if cash > $600
  - payJailFee if cash > $200, else rollDice
  - Mortgage cheapest property if cash < $100
  Priority: context-dependent

Agent 3 — RANDOM-ISH:
  - buyProperty 70% of the time when available
  - bid 50% of the time in auctions
  - Always pay jail fee
  Priority: weighted random from legalActions

== EXAMPLE CODE ==

Here's a complete working script. Write this to a file and run it with Node.js:

```javascript
const WebSocket = require("ws");

const GM_URL = "GM_URL_HERE";     // e.g. "http://localhost:3001"
const GM_WS  = "GM_WS_HERE";     // e.g. "ws://localhost:3001/ws"

const PLAYERS = [
  "0xAA00000000000000000000000000000000000001",
  "0xBB00000000000000000000000000000000000002",
  "0xCC00000000000000000000000000000000000003",
  "0xDD00000000000000000000000000000000000004",
];

// === STRATEGIES ===

function aggressive(snapshot, actions) {
  return actions.find(a => a.type === "buyProperty")
      || actions.find(a => a.type === "bid")
      || actions.find(a => a.type === "payJailFee")
      || actions.find(a => a.type === "rollDice")
      || actions.find(a => a.type === "endTurn")
      || actions[0];
}

function conservative(snapshot, actions) {
  const me = snapshot.players.find(p => p.address.toLowerCase() === snapshot.players[snapshot.currentPlayerIndex].address.toLowerCase());
  const cash = me ? me.cash : 0;
  if (cash > 800) {
    const buy = actions.find(a => a.type === "buyProperty");
    if (buy) return buy;
  }
  return actions.find(a => a.type === "declineBuy")
      || actions.find(a => a.type === "passBid")
      || actions.find(a => a.type === "rollDice")
      || actions.find(a => a.type === "endTurn")
      || actions[0];
}

function smart(snapshot, actions) {
  const me = snapshot.players[snapshot.currentPlayerIndex];
  const cash = me ? me.cash : 0;
  const buy = actions.find(a => a.type === "buyProperty");
  if (buy && cash > 400) return buy;
  const decline = actions.find(a => a.type === "declineBuy");
  if (decline) return decline;
  const bid = actions.find(a => a.type === "bid");
  if (bid && cash > 600) return bid;
  const pass = actions.find(a => a.type === "passBid");
  if (pass) return pass;
  const jail = actions.find(a => a.type === "payJailFee");
  if (jail && cash > 200) return jail;
  return actions.find(a => a.type === "rollDice")
      || actions.find(a => a.type === "endTurn")
      || actions[0];
}

function randomish(snapshot, actions) {
  const buy = actions.find(a => a.type === "buyProperty");
  if (buy && Math.random() < 0.7) return buy;
  const decline = actions.find(a => a.type === "declineBuy");
  if (decline) return decline;
  const bid = actions.find(a => a.type === "bid");
  if (bid && Math.random() < 0.5) return bid;
  const pass = actions.find(a => a.type === "passBid");
  if (pass) return pass;
  const jail = actions.find(a => a.type === "payJailFee");
  if (jail) return jail;
  return actions.find(a => a.type === "rollDice")
      || actions.find(a => a.type === "endTurn")
      || actions[0];
}

const STRATEGIES = [aggressive, conservative, smart, randomish];

// === MAIN ===

async function main() {
  // Create game
  const res = await fetch(GM_URL + "/games/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players: PLAYERS }),
  });
  const { gameId } = await res.json();
  console.log("Game created:", gameId);

  // Connect all 4 agents
  const promises = PLAYERS.map((addr, i) => new Promise((resolve, reject) => {
    const ws = new WebSocket(GM_WS + "?gameId=" + gameId + "&address=" + addr);
    let moves = 0;

    ws.on("open", () => console.log("Agent " + i + " connected"));

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "yourTurn") {
        const action = STRATEGIES[i](msg.snapshot, msg.legalActions);
        moves++;
        ws.send(JSON.stringify({ type: "action", action }));
      }

      if (msg.type === "gameEnded") {
        console.log("Agent " + i + ": Game over! Winner = Player " + msg.winner + " | My moves: " + moves);
        ws.close();
        resolve(msg);
      }
    });

    ws.on("error", reject);
  }));

  const results = await Promise.all(promises);
  const snap = results[0].snapshot;
  console.log("\n=== FINAL RESULTS ===");
  console.log("Winner: Player " + snap.winner);
  console.log("Rounds: " + snap.round + " | Turns: " + snap.turn);
  snap.players.forEach(p => {
    console.log("  P" + p.index + ": " + (p.alive ? "$" + p.cash : "BANKRUPT") + " @ " + p.tileName);
  });
}

main().catch(console.error);
```

== IMPORTANT NOTES ==

- Create the game FIRST via POST, then connect all 4 agents
- The game auto-starts when all 4 WebSocket connections are established
- Each game takes ~30 seconds to complete (up to 200 rounds)
- A spectator may be watching via the web UI — they enter the game ID to watch live
- You have 10 seconds per turn before GM auto-plays for you
- Log key events: dice rolls, property purchases, bankruptcies, and the final winner
- The snapshot.players array has each player's cash, position, tileName, alive status, and jail status
- The snapshot.properties array has each property's owner and mortgage status

== GAME RULES SUMMARY ==

- Classic Monopoly with 40 tiles, 28 buyable properties
- Start with $1500 cash
- Pass Go = collect $200
- Land on owned property = pay rent (doubled if owner has monopoly)
- Land on unowned property = buy or auction
- 3 doubles in a row = go to jail
- Jail: pay $50, roll doubles, or wait 3 turns
- Bankrupt = all properties go to creditor
- Last player standing wins, OR richest after 200 rounds
```

---

## Usage Notes

- Replace `GM_URL` and `GM_WS` with the actual server URLs before using the prompt.
- For local testing: `GM_URL=http://localhost:3001` and `GM_WS=ws://localhost:3001/ws`
- For Render deployment: `GM_URL=https://your-service.onrender.com` and `GM_WS=wss://your-service.onrender.com/ws`
- The `ws` npm package is required. The agent should run `npm install ws` first.
