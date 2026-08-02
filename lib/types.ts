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
}

export interface MatchState {
  id: bigint;
  mode: number; // 0=solo 1=pvp 2=endless 3=daily 4=quick
  phase: number; // 0=waiting(pvp) 1=active 2=finished
  turn: bigint;
  seed: bigint;
  winner: string;
  playerAddr: [string, string];
  wave: bigint;
  turnCount: bigint;
  dailyDay: bigint;
  players: [PlayerState, PlayerState];
}

export interface BattleLogEntry {
  id: string;
  matchId: bigint;
  actor: string;
  text: string;
  txHash?: string;
}

export const BOT_ADDRESS = '0x0000000000000000000000000000000000000B0B';

export const MODE_LABEL: Record<number, string> = {
  0: 'Solo',
  1: 'PvP',
  2: 'Endless',
  3: 'Daily',
  4: 'Quick',
};
