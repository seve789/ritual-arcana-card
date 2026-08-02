'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { cardGameAbi } from '@/lib/abi';
import { GAME_ADDRESS } from '@/lib/addresses';
import { CARDS } from '@/lib/cards';
import CardView from './CardView';

interface DeckBuilderProps {
  collection: { ids: bigint[]; counts: bigint[] } | undefined;
}

export default function DeckBuilder({ collection }: DeckBuilderProps) {
  const { address } = useAccount();
  const [selected, setSelected] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  const { data: savedDeck } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getDeck',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const ownedMap = useMemo(() => {
    const m = new Map<number, number>();
    if (collection) {
      collection.ids.forEach((id, i) => m.set(Number(id), Number(collection.counts[i])));
    }
    return m;
  }, [collection]);

  // 初始加载已保存卡组
  useEffect(() => {
    if (savedDeck && selected.length === 0) {
      const deck = savedDeck as unknown as bigint[];
      const ids = deck.filter((d) => d > 0n).map(Number);
      if (ids.length === 10) setSelected(ids);
    }
  }, [savedDeck, selected.length]);

  const toggle = (id: number) => {
    setSaved(false);
    setErr(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 10) {
        setErr('卡组已满（10张）');
        return prev;
      }
      return [...prev, id];
    });
  };

  const save = async () => {
    if (selected.length !== 10) {
      setErr('需要正好 10 张卡');
      return;
    }
    setErr(null);
    try {
      await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'saveDeck',
        args: [selected.map(BigInt)],
        gas: 300_000n,
      });
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '保存失败');
    }
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-gray-200">卡组</h2>
          <p className="text-sm text-gray-400 mt-1">从收藏中选择 10 张不重复的卡</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`font-mono text-lg ${selected.length === 10 ? 'text-ritual-green' : 'text-ritual-gold'}`}>
            {selected.length}/10
          </span>
          <button
            onClick={save}
            disabled={selected.length !== 10}
            className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-6 py-2.5 rounded-lg font-semibold disabled:opacity-40"
          >
            {saved ? '✓ 已保存' : '保存卡组'}
          </button>
        </div>
      </div>

      {err && <div className="text-red-400 text-sm border border-red-500/40 rounded-lg px-4 py-2 bg-red-500/5">{err}</div>}

      {/* 当前选中的卡组 */}
      {selected.length > 0 && (
        <div className="border border-gray-800 rounded-xl p-4 bg-ritual-elevated/60">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">当前卡组</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selected.map((id, i) => (
              <CardView key={i} cardId={id} size="xs" onClick={() => toggle(id)} />
            ))}
          </div>
        </div>
      )}

      {/* 收藏选择区 */}
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">收藏（点击选择 / 取消）</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-3">
          {CARDS.filter((c) => ownedMap.has(c.id)).map((c) => (
            <CardView
              key={c.id}
              cardId={c.id}
              size="xs"
              onClick={() => toggle(c.id)}
              selected={selected.includes(c.id)}
              count={ownedMap.get(c.id)}
            />
          ))}
        </div>
        {ownedMap.size === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-700 rounded-xl">
            暂无卡牌，先去「收藏」页开卡包
          </p>
        )}
      </div>
    </div>
  );
}
