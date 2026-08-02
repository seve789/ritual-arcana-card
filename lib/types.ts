// 链上 Match 结构体对应的 TypeScript 类型（与 CardGame.sol 对齐）
export interface MinionState {
  cardId: bigint;
  atk: bigint;
  hp: bigint;
  maxHp: bigint;
  canAct: boolean;
}

export interface PlayerState {
  heroHp: bigint;
  mana: bigint;
  maxMana: bigint;
  deckIdx: bigint;
  deck: readonly bigint[];
  hand: readonly bigint[];
  board: MinionState[];
  isBot: boolean;
}

export interface MatchState {
  id: bigint;
  players: [PlayerState, PlayerState];
  turn: bigint;
  seed: bigint;
  phase: number;
  winner: string;
}

export interface BattleLogEntry {
  id: string;
  matchId: bigint;
  actor: string;
  text: string;
  txHash?: string;
}

export const BOT_ADDRESS = '0x0000000000000000000000000000000000000B0B';
