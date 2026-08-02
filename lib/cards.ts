// 卡牌目录 —— 与链上 CardGame 合约构造函数完全一致（id 1..30）
// rarity: 0=common 1=rare 2=epic 3=legendary
export interface CardMeta {
  id: number;
  name: string;
  rarity: number;
  cost: number;
  atk: number;
  hp: number;
  glyph: string; // 视觉符号（Ritual 主题）
}

export const RARITY_LABEL = ['Common', 'Rare', 'Epic', 'Legendary'];

// Ritual 设计系统配色：绿=信任/稀有, 粉=AI/史诗, 金=传奇, 灰=普通
export const RARITY_STYLE: Record<number, { border: string; text: string; glow: string }> = {
  0: { border: 'border-gray-600', text: 'text-gray-400', glow: '' },
  1: { border: 'border-ritual-green/70', text: 'text-ritual-green', glow: 'shadow-glow-green' },
  2: { border: 'border-ritual-pink/70', text: 'text-ritual-pink', glow: 'shadow-glow-pink' },
  3: { border: 'border-ritual-gold/80', text: 'text-ritual-gold', glow: 'shadow-glow-gold' },
};

export const CARDS: CardMeta[] = [
  { id: 1, name: 'Ember Sprite', rarity: 0, cost: 1, atk: 2, hp: 1, glyph: '◈' },
  { id: 2, name: 'Void Pup', rarity: 0, cost: 1, atk: 1, hp: 2, glyph: '⬡' },
  { id: 3, name: 'Cipher Wisp', rarity: 0, cost: 1, atk: 1, hp: 1, glyph: '◇' },
  { id: 4, name: 'Bone Guard', rarity: 0, cost: 2, atk: 2, hp: 2, glyph: '▣' },
  { id: 5, name: 'Tinker Drone', rarity: 0, cost: 2, atk: 1, hp: 3, glyph: '⇄' },
  { id: 6, name: 'Ritual Initiate', rarity: 0, cost: 2, atk: 2, hp: 3, glyph: '⊞' },
  { id: 7, name: 'Arcane Raven', rarity: 0, cost: 3, atk: 2, hp: 3, glyph: '◐' },
  { id: 8, name: 'Stone Acolyte', rarity: 0, cost: 2, atk: 1, hp: 4, glyph: '△' },
  { id: 9, name: 'Glass Golem', rarity: 0, cost: 3, atk: 3, hp: 3, glyph: '◈' },
  { id: 10, name: 'Chain Ward', rarity: 0, cost: 3, atk: 2, hp: 4, glyph: '⊞' },
  { id: 11, name: 'Rust Sentinel', rarity: 0, cost: 4, atk: 3, hp: 4, glyph: '▣' },
  { id: 12, name: 'Ember Fang', rarity: 0, cost: 4, atk: 4, hp: 3, glyph: '⬡' },
  { id: 13, name: 'Hash Hound', rarity: 1, cost: 3, atk: 3, hp: 3, glyph: '⟳' },
  { id: 14, name: 'Enclave Witch', rarity: 1, cost: 4, atk: 3, hp: 5, glyph: '◇' },
  { id: 15, name: 'TEE Guardian', rarity: 1, cost: 4, atk: 4, hp: 4, glyph: '⊞' },
  { id: 16, name: 'Fault-Slip Rogue', rarity: 1, cost: 3, atk: 4, hp: 2, glyph: '⇄' },
  { id: 17, name: 'Merkle Druid', rarity: 1, cost: 5, atk: 4, hp: 5, glyph: '△' },
  { id: 18, name: 'Scheduler Sage', rarity: 1, cost: 5, atk: 4, hp: 4, glyph: '⏲' },
  { id: 19, name: 'Zero-Knowledge Monk', rarity: 1, cost: 5, atk: 3, hp: 6, glyph: '◈' },
  { id: 20, name: 'Dapp Raider', rarity: 1, cost: 4, atk: 5, hp: 3, glyph: '▣' },
  { id: 21, name: 'Onyx Oracle', rarity: 1, cost: 6, atk: 5, hp: 5, glyph: '◇' },
  { id: 22, name: 'Shard Shaman', rarity: 1, cost: 6, atk: 4, hp: 6, glyph: '⬡' },
  { id: 23, name: 'Genesis Fork', rarity: 2, cost: 6, atk: 6, hp: 5, glyph: '⟳' },
  { id: 24, name: 'Attestation Angel', rarity: 2, cost: 7, atk: 6, hp: 6, glyph: '⊞' },
  { id: 25, name: 'Node Master', rarity: 2, cost: 7, atk: 5, hp: 8, glyph: '△' },
  { id: 26, name: 'Precompile Titan', rarity: 2, cost: 8, atk: 7, hp: 7, glyph: '▣' },
  { id: 27, name: 'TEE Seraph', rarity: 2, cost: 8, atk: 6, hp: 8, glyph: '◈' },
  { id: 28, name: 'Async Overlord', rarity: 3, cost: 8, atk: 9, hp: 7, glyph: '⟳' },
  { id: 29, name: 'Ritual Phoenix', rarity: 3, cost: 9, atk: 8, hp: 8, glyph: '◐' },
  { id: 30, name: 'The Enshrined One', rarity: 3, cost: 10, atk: 10, hp: 10, glyph: '⊞' },
];

export const cardById = (id: number | bigint): CardMeta =>
  CARDS[Number(id) - 1] ?? { id: Number(id), name: `Card #${id}`, rarity: 0, cost: 0, atk: 0, hp: 0, glyph: '?' };

export const PACK_PRICE = 1000000000000000n; // 0.001 RITUAL
