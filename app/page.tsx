'use client';

import { useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useSwitchChain } from 'wagmi';
import { cardGameAbi } from '@/lib/abi';
import { GAME_ADDRESS, EXPLORER } from '@/lib/addresses';
import { ritualChain } from '@/lib/chain';
import Collection from '@/components/Collection';
import DeckBuilder from '@/components/DeckBuilder';
import Battle from '@/components/Battle';

type Tab = 'collection' | 'deck' | 'battle';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'collection', label: '收藏', icon: '◇' },
  { id: 'deck', label: '卡组', icon: '⊞' },
  { id: 'battle', label: '对战', icon: '▣' },
];

export default function Page() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const [tab, setTab] = useState<Tab>('collection');
  const [walletError, setWalletError] = useState<string | null>(null);

  const { data: collection } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getCollection',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const wrongChain = isConnected && chainId !== ritualChain.id;
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  const hasWallet = typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';

  const handleConnect = async () => {
    setWalletError(null);
    const connector = connectors[0];
    if (!hasWallet) {
      setWalletError('未检测到钱包扩展 —— 请先安装 MetaMask（或任意 Web3 钱包），然后刷新本页。');
      return;
    }
    if (!connector || connector.ready === false) {
      setWalletError('检测到钱包但当前不可用（可能被浏览器隐私模式禁用）。请检查钱包扩展状态后刷新。');
      return;
    }
    try {
      await connectAsync({ connector });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '连接失败';
      setWalletError(msg.includes('rejected') || msg.includes('denied') ? '连接被拒绝 —— 请在钱包弹窗中点击批准。' : msg.split('\n')[0]);
    }
  };

  return (
    <main className="min-h-screen bg-arena bg-mascot font-body">
      {/* 顶栏 */}
      <header className="border-b border-gray-800/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/favicon.webp" alt="Ritual mascot" className="w-9 h-9 rounded-lg shadow-glow-green" />
            <div>
              <h1 className="font-display text-lg text-gray-100 tracking-wide leading-none">RITUAL ARCANA CARD</h1>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Chain 1979 · On-Chain Card Game</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <a
                  href={`${EXPLORER}/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-ritual-green border border-ritual-green/40 bg-ritual-green/5 px-3 py-1.5 rounded-lg hover:bg-ritual-green/10"
                >
                  {shortAddr(address!)}
                </a>
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-gray-500 border border-gray-700 px-3 py-1.5 rounded-lg hover:text-gray-300 hover:border-gray-500"
                >
                  断开
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connectPending}
                className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-5 py-2 rounded-lg font-semibold text-sm shadow-glow-green disabled:opacity-40"
              >
                {connectPending ? '连接中…' : '连接钱包'}
              </button>
            )}
          </div>
        </div>
        {walletError && (
          <div className="max-w-6xl mx-auto px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border border-ritual-gold/40 rounded-lg px-4 py-2.5 bg-ritual-gold/5 text-sm">
              <span className="text-ritual-gold">⚠ {walletError}</span>
              {!hasWallet && (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ritual-green border border-ritual-green/50 hover:bg-ritual-green/10 px-4 py-1.5 rounded-lg text-xs font-semibold"
                >
                  去安装 MetaMask →
                </a>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 链守卫 */}
      {wrongChain && (
        <div className="max-w-6xl mx-auto px-4 py-10 text-center">
          <div className="text-4xl mb-4 text-ritual-gold">◌</div>
          <p className="text-gray-300 mb-4">当前网络不是 Ritual Chain (1979)</p>
          <button
            onClick={() => switchChain({ chainId: ritualChain.id })}
            disabled={switchPending}
            className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-6 py-2.5 rounded-lg font-semibold disabled:opacity-40"
          >
            {switchPending ? '切换中…' : '切换到 Ritual Chain'}
          </button>
        </div>
      )}

      {/* 主内容 */}
      {!wrongChain && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* 未连接提示 */}
          {!isConnected && (
            <div className="text-center py-24">
              <img
                src="/favicon.webp"
                alt="Ritual mascot"
                className="w-24 h-24 mx-auto mb-6 rounded-2xl animate-mascot"
              />
              <h2 className="font-display text-3xl text-gray-100 mb-2">RITUAL ARCANA CARD</h2>
              <p className="text-gray-400 max-w-md mx-auto mb-8">
                开卡包收集 30 张 Ritual 主题随从卡，组 10 张卡组，挑战链上 AI —— 全部状态存在 Ritual Chain 上。
              </p>
              <button
                onClick={handleConnect}
                className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-8 py-3 rounded-lg font-semibold"
              >
                连接钱包开始
              </button>
              {!hasWallet && (
                <p className="text-gray-500 text-xs mt-4">
                  需要浏览器钱包（如{' '}
                  <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-ritual-green hover:underline">
                    MetaMask
                  </a>
                  ）才能游玩 —— 安装后刷新页面
                </p>
              )}
            </div>
          )}

          {isConnected && (
            <>
              {/* 标签栏 */}
              <nav className="flex gap-1 border-b border-gray-800 mb-6">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={[
                      'px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px',
                      tab === t.id
                        ? 'text-ritual-green border-ritual-green'
                        : 'text-gray-500 border-transparent hover:text-gray-300',
                    ].join(' ')}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </nav>

              {/* 三个面板保持挂载（避免丢失对战轮询状态），用 hidden 切换 */}
              <div className={tab === 'collection' ? '' : 'hidden'}>
                <Collection />
              </div>
              <div className={tab === 'deck' ? '' : 'hidden'}>
                <DeckBuilder collection={collection as { ids: bigint[]; counts: bigint[] } | undefined} />
              </div>
              <div className={tab === 'battle' ? '' : 'hidden'}>
                <Battle />
              </div>
            </>
          )}
        </div>
      )}

      {/* 页脚 */}
      <footer className="max-w-6xl mx-auto px-4 py-8 border-t border-gray-800/60 mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-gray-600">
          <span>
            合约{' '}
            <a href={`${EXPLORER}/address/${GAME_ADDRESS}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-ritual-green">
              {GAME_ADDRESS}
            </a>
          </span>
          <span>开包 0.001 RITUAL/包 · 对战仅需 Gas</span>
        </div>
      </footer>
    </main>
  );
}
