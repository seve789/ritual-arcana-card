import type { Address } from 'viem';

// 部署的合约地址（Ritual 测试网，Chain ID 1979）
// v1: 0xD11a44f01ea117fdE4964d7A84e9D91592a9758e（Solo only）
// v2 (多模式): 0x203d321E3383A41B56633ba50BB22CcF9AA3FD35
export const GAME_ADDRESS = (
  process.env.NEXT_PUBLIC_GAME_ADDRESS ?? '0x203d321E3383A41B56633ba50BB22CcF9AA3FD35'
) as Address;

export const EXPLORER = 'https://explorer.ritualfoundation.org';
