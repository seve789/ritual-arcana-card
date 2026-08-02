# ◈ RITUAL ARCANA — 卡牌链游 (Ritual Chain)

轻量级卡牌对战 dApp，部署在 **Ritual Chain 测试网 (Chain ID 1979)**。
开卡包收集 30 张 Ritual 主题随从卡 → 组 10 张卡组 → 挑战链上 AI Bot。

全部游戏状态（收藏、卡组、对局、战斗日志）都存在链上，**无中心化服务器**。

## ✦ 玩法

| 模式 | 说明 | 要求 |
|---|---|---|
| **Solo** | 单人对链上 AI，经典对决 | 卡组（10张） |
| **PvP** ⚔ | 真人匹配：创建对局分享 ID，好友加入对战 | 卡组 |
| **Endless** ⟳ | 无尽波次：每波 Bot 更强（卡费上限+血量），波间回复 5 HP，记录最高波 | 卡组 |
| **Daily** ◈ | 全服同一 Bot（当日种子），最快回合数上榜（Top 5） | 卡组 |
| **Quick** ⚡ | 随机卡组免组牌，即点即玩 | 无需收藏 |

通用规则：双方 30 点英雄生命（无尽波次 Bot 逐波 +2 上限 50），法力每回合 +1（上限 10），出牌消耗法力，随从「召唤失调」，Bot 击杀优先级：能杀死的血最少随从 > 打脸。

## ✦ 部署信息

| 项目 | 值 |
|---|---|
| 链 | Ritual Chain (1979) |
| 合约 (v2 多模式) | [`0x203d321E3383A41B56633ba50BB22CcF9AA3FD35`](https://explorer.ritualfoundation.org/address/0x203d321E3383A41B56633ba50BB22CcF9AA3FD35) |
| v1 (Solo only) | `0xD11a44f01ea117fdE4964d7A84e9D91592a9758e` |
| 开包价 | 0.001 RITUAL / 包（5 张不重复） |
| RPC | `https://rpc.ritualfoundation.org` |

## ✦ 合约架构 (`contracts/src/CardGame.sol`)

- **Card** — id/name/rarity/cost/atk/hp（30 张，index 0 占位，cardId == arrayIndex）
- **mintPack()** — payable 开包，`prevrandao`+nonce 随机，5 张不重复
- **saveDeck() / deckValid()** — 10 张不重复且已拥有的卡组
- **startSoloMatch()** — 洗牌（Fisher-Yates，seeded）→ 双方各抽 3 张，英雄 30 HP
- **playCard() / attack()** — 出牌 / 随从攻击（目标：随从或英雄）
- **endTurn()** — Bot 回合在交易内自动执行（确定性策略），然后回到玩家回合
- 纯 EVM 确定性逻辑，无异步 precompile 依赖 → 轻量、gas 低、无 sender-lock 问题

## ✦ 本地开发

```bash
# 合约
cd contracts
cp .env.example .env   # 填入 PRIVATE_KEY
forge build && forge test
forge script script/DeployCardGame.s.sol --rpc-url $RITUAL_RPC_URL --broadcast

# 前端
npm install
npm run dev            # http://localhost:3000
```

前端技术栈：Next.js 14 + wagmi 2 + viem 2 + Tailwind（Ritual 设计系统：黑底 / 绿=信任 / 粉=AI / 金=稀有）。

## ✦ 卡牌列表（30）

| id | 名称 | 稀有度 | 费用 | 攻/血 |
|---|---|---|---|---|
| 1 | Ember Sprite | Common | 1 | 2/1 |
| 2 | Void Pup | Common | 1 | 1/2 |
| ... | （见 `lib/cards.ts` 与合约构造函数） | | | |
| 28 | Async Overlord | Legendary | 8 | 9/7 |
| 29 | Ritual Phoenix | Legendary | 9 | 8/8 |
| 30 | The Enshrined One | Legendary | 10 | 10/10 |

## ✦ 路线图

- [x] 五种玩法：Solo / PvP / Endless / Daily / Quick
- [ ] LLM precompile 驱动的 AI 对手（0x0802）
- [ ] 赛季排行 / 成就 / 卡牌合成
