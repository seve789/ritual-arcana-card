import cardGameAbiJson from '@/lib/cardgame-abi.json';

// ABI 与链上合约完全一致（out/CardGame.sol/CardGame.json 导出）
// 使用宽松类型以兼容 wagmi/viem 的运行时校验
export const cardGameAbi = cardGameAbiJson as any;
