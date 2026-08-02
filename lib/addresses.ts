import type { Address } from 'viem';

// 部署的合约地址（Ritual 测试网，Chain ID 1979）
// 部署交易: 0xd282ac1193364787c2c619cb9cdac51d8c4b8e8bb3cb4f1b7a37400b9eb13dc4 (v1, 废弃)
// 最终部署: 0xD11a44f01ea117fdE4964d7A84e9D91592a9758e
export const GAME_ADDRESS = (
  process.env.NEXT_PUBLIC_GAME_ADDRESS ?? '0xD11a44f01ea117fdE4964d7A84e9D91592a9758e'
) as Address;

export const EXPLORER = 'https://explorer.ritualfoundation.org';
