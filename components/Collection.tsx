'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { cardGameAbi } from '@/lib/abi';
import { GAME_ADDRESS, EXPLORER } from '@/lib/addresses';
import { PACK_PRICE, CARDS } from '@/lib/cards';
import { formatEther } from 'viem';
import CardView from './CardView';

export default function Collection({ onOwnedChange }: { onOwnedChange?: (ids: bigint[]) => void }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [packTxHash, setPackTxHash] = useState<`0x${string}` | null>(null);
  const [packResult, setPackResult] = useState<bigint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: collection, refetch: refetchCollection } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getCollection',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'PACK_PRICE',
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const { isLoading: packConfirming } = useWaitForTransactionReceipt({
    hash: packTxHash ?? undefined,
    query: { enabled: !!packTxHash },
  });

  const ownedMap = new Map<number, number>();
  if (collection) {
    const c = collection as any;
    const ids = c.ids as bigint[];
    const counts = c.counts as bigint[];
    ids.forEach((id, i) => ownedMap.set(Number(id), Number(counts[i])));
  }

  const openPack = async () => {
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'mintPack',
        args: [],
        value: PACK_PRICE,
        gas: 400_000n,
      });
      setPackTxHash(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '开包失败');
    }
  };

  // 交易确认后解析 PackOpened 事件
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: packTxHash ?? undefined,
    query: { enabled: !!packTxHash },
  });
  if (receipt && !packResult && packTxHash) {
    const logs = parseEventLogs({
      abi: cardGameAbi,
      logs: receipt.logs,
      eventName: 'PackOpened',
    });
    if (logs.length > 0) {
      const ids = (logs[0] as any).args.cardIds as unknown as bigint[];
      setPackResult(ids);
      refetchCollection();
      refetchBalance();
      onOwnedChange?.(ids);
    }
  }

  const ownedCount = ownedMap.size;

  return (
    <div className="animate-fade-up space-y-6">
      {/* 顶部操作区 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-gray-200">收藏 <span className="font-mono text-sm text-ritual-lime">{ownedCount}/30</span></h2>
          <p className="text-sm text-gray-400 mt-1">
            开卡包获得随从卡，5张/包 · {balance ? `${Number(formatEther(PACK_PRICE))} RITUAL/包` : '0.001 RITUAL/包'}
          </p>
        </div>
        <button
          onClick={openPack}
          disabled={packConfirming || !address}
          className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-6 py-3 rounded-lg font-semibold disabled:opacity-40 transition-all shadow-glow-green"
        >
          {packConfirming ? '开包中…' : '◇ 开卡包 (0.001 RITUAL)'}
        </button>
      </div>

      {err && <div className="text-red-400 text-sm border border-red-500/40 rounded-lg px-4 py-2 bg-red-500/5">{err}</div>}

      {/* 收藏网格 */}
      {ownedCount === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-700 rounded-xl">
          <div className="text-5xl mb-4">◇</div>
          <p className="text-gray-400">还没有卡牌 —— 先开一包吧！</p>
          {address && (
            <a
              href={`${EXPLORER}/address/${GAME_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 text-xs font-mono text-gray-500 hover:text-ritual-green"
            >
              合约 {GAME_ADDRESS.slice(0, 10)}…{GAME_ADDRESS.slice(-6)}
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {CARDS.filter((c) => ownedMap.has(c.id)).map((c) => (
            <CardView key={c.id} cardId={c.id} size="sm" count={ownedMap.get(c.id)} />
          ))}
        </div>
      )}

      {/* 开包结果弹窗 */}
      {packResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPackResult(null)}>
          <div
            className="bg-ritual-elevated border border-gray-700 rounded-xl p-8 max-w-2xl w-full shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl text-ritual-green mb-1">◇ 新卡包已开启！</h3>
            <p className="text-xs font-mono text-gray-500 mb-6">PackOpened · 5 张不重复卡</p>
            <div className="flex justify-center gap-3 flex-wrap">
              {packResult.map((id, i) => (
                <div key={i} className="animate-pack" style={{ animationDelay: `${i * 0.08}s` }}>
                  <CardView cardId={id} size="md" />
                </div>
              ))}
            </div>
            <button
              onClick={() => setPackResult(null)}
              className="mt-8 w-full border border-ritual-green text-ritual-green hover:bg-ritual-green/10 py-2.5 rounded-lg font-semibold"
            >
              收下
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
