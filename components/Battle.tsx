'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { cardGameAbi } from '@/lib/abi';
import { GAME_ADDRESS, EXPLORER } from '@/lib/addresses';
import { cardById } from '@/lib/cards';
import { BOT_ADDRESS, type MatchState, type BattleLogEntry } from '@/lib/types';
import CardView from './CardView';

const POLL_MS = 3000;
const LOG_EVENT = (cardGameAbi as any[]).find((e) => e.type === 'event' && e.name === 'Log');

export default function Battle() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [deck, setDeck] = useState<bigint[] | null>(null);
  const [matchId, setMatchId] = useState<bigint | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [logs, setLogs] = useState<BattleLogEntry[]>([]);
  const [attackerIdx, setAttackerIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [startTx, setStartTx] = useState<`0x${string}` | null>(null);

  const lastLogBlock = useRef<bigint | null>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // 读取玩家保存的卡组
  const { data: savedDeckData } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getDeck',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: deckOk } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'deckValid',
    args: address && deck ? [address, deck] : undefined,
    query: { enabled: !!address && !!deck },
  });

  useEffect(() => {
    if (savedDeckData && !deck) {
      const d = savedDeckData as unknown as bigint[];
      if (d.some((x) => x > 0n)) setDeck(d);
    }
  }, [savedDeckData, deck]);

  // 开始对局
  const startMatch = async () => {
    if (!deck) return;
    setErr(null);
    setLogs([]);
    setMatch(null);
    setMatchId(null);
    setAttackerIdx(null);
    try {
      const hash = await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'startSoloMatch',
        args: [deck],
        gas: 1_500_000n,
      });
      setStartTx(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '开始对局失败');
    }
  };

  // 开始交易确认 → 解析 MatchStarted 事件获得 matchId
  const { data: startReceipt } = useWaitForTransactionReceipt({
    hash: startTx ?? undefined,
    query: { enabled: !!startTx },
  });
  useEffect(() => {
    if (startReceipt && !matchId) {
      const evs = parseEventLogs({
        abi: cardGameAbi,
        logs: startReceipt.logs,
        eventName: 'MatchStarted',
      }) as unknown as { args: { matchId: bigint } }[];
      if (evs.length > 0) {
        const id = evs[0].args.matchId as unknown as bigint;
        setMatchId(id);
        lastLogBlock.current = startReceipt.blockNumber - 1n;
      }
    }
  }, [startReceipt, matchId]);

  // 轮询对战状态 + 增量拉取 Log 事件
  useEffect(() => {
    if (!matchId || !publicClient) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const m = (await publicClient.readContract({
          address: GAME_ADDRESS,
          abi: cardGameAbi,
          functionName: 'getMatch',
          args: [matchId],
        })) as unknown as MatchState;
        if (!cancelled) setMatch(m);

        if (lastLogBlock.current !== null && LOG_EVENT) {
          const rawLogs = await publicClient.getLogs({
            address: GAME_ADDRESS,
            event: LOG_EVENT,
            args: { matchId } as never,
            fromBlock: lastLogBlock.current,
            toBlock: 'latest',
          });
          if (!cancelled && rawLogs.length > 0) {
            lastLogBlock.current =
              (rawLogs[rawLogs.length - 1].blockNumber ?? lastLogBlock.current) + 1n;
            setLogs((prev) => {
              const seen = new Set(prev.map((l) => l.id));
              const next = [...prev];
              for (const l of rawLogs) {
                const key = `${l.transactionHash}:${l.logIndex}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const args = (l as any).args as { text: string; actor: string };
                next.push({ id: key, matchId, actor: args.actor, text: args.text, txHash: l.transactionHash });
              }
              return next;
            });
          }
        }
      } catch {
        // 瞬时 RPC 错误忽略，下轮重试
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [matchId, publicClient]);

  // 日志自动滚动到底部
  useEffect(() => {
    if (logPanelRef.current) logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
  }, [logs]);

  // 行动封装
  const act = async (fn: 'playCard' | 'attack' | 'endTurn', args: unknown[]) => {
    if (!matchId || busy) return;
    setErr(null);
    setBusy(true);
    try {
      await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: fn,
        args,
        gas: fn === 'endTurn' ? 2_000_000n : 500_000n,
      });
      setAttackerIdx(null);
      const m = (await publicClient!.readContract({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'getMatch',
        args: [matchId],
      })) as unknown as MatchState;
      setMatch(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const myTurn = match !== null && match.phase === 1 && match.turn === 0n;
  const finished = match !== null && match.phase === 2;
  const victory = finished && match!.winner.toLowerCase() === address?.toLowerCase();
  const player = match?.players[0];
  const bot = match?.players[1];

  const heroHpPct = (hp: bigint) => Math.max(0, Math.min(100, (Number(hp) / 30) * 100));

  return (
    <div className="animate-fade-up space-y-4">
      {/* 对局前：卡组预览 + 开始按钮 */}
      {!matchId && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-gray-200">对战 · 单人对链上AI</h2>
              <p className="text-sm text-gray-400 mt-1">
                Bot 由合约内确定性策略驱动，每回合自动出牌并攻击
              </p>
            </div>
            <button
              onClick={startMatch}
              disabled={!deck || !deckOk || busy}
              className="border border-ritual-pink text-ritual-pink hover:bg-ritual-pink/10 px-6 py-3 rounded-lg font-semibold disabled:opacity-40 shadow-glow-pink transition-all"
            >
              {busy ? '发起中…' : '▣ 开始对战 (消耗 Gas)'}
            </button>
          </div>

          {err && <div className="text-red-400 text-sm border border-red-500/40 rounded-lg px-4 py-2 bg-red-500/5">{err}</div>}

          {deck && deckOk === false && (
            <div className="text-ritual-gold text-sm border border-ritual-gold/40 rounded-lg px-4 py-2 bg-ritual-gold/5">
              ⚠ 当前卡组无效 —— 请先在「卡组」页保存 10 张不重复且已拥有的卡
            </div>
          )}

          {deck && deckOk === true && (
            <div className="border border-gray-800 rounded-xl p-4 bg-ritual-elevated/60">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">你的卡组（将洗牌后对战）</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {deck.map((id, i) => (
                  <CardView key={i} cardId={id} size="xs" />
                ))}
              </div>
            </div>
          )}

          {!deck && (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-700 rounded-xl">
              未找到已保存的卡组 —— 先去「卡组」页组一套 10 张的卡
            </p>
          )}
        </div>
      )}

      {/* 对局中 */}
      {matchId && match && (
        <div className="space-y-4">
          {err && <div className="text-red-400 text-sm border border-red-500/40 rounded-lg px-4 py-2 bg-red-500/5">{err}</div>}

          {/* 结算横幅 */}
          {finished && (
            <div className={`rounded-xl border px-6 py-4 text-center ${victory ? 'border-ritual-green bg-ritual-green/10' : 'border-red-500/50 bg-red-500/10'}`}>
              <p className={`font-display text-2xl ${victory ? 'text-ritual-green' : 'text-red-400'}`}>
                {victory ? '✦ 胜利！' : '✕ 战败'}
              </p>
              <button
                onClick={startMatch}
                className="mt-3 border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-5 py-2 rounded-lg text-sm font-semibold"
              >
                再来一局
              </button>
            </div>
          )}

          {/* 敌方区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            <div className="space-y-3">
              {/* 敌方英雄（选中攻击者后可点击攻击英雄） */}
              <div
                onClick={attackerIdx !== null && myTurn && !finished ? () => act('attack', [matchId, attackerIdx, 1, 0]) : undefined}
                className={`flex items-center gap-3 border border-gray-800 rounded-xl p-3 bg-ritual-elevated ${attackerIdx !== null && myTurn && !finished ? 'cursor-crosshair hover:border-ritual-pink transition-colors' : ''}`}
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-ritual-surface border border-ritual-pink/50 text-ritual-pink text-2xl">
                  ▣
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-gray-300">Enemy AI</span>
                    <span className="font-mono text-ritual-pink text-lg font-bold">{bot?.heroHp.toString()}/30</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 mt-1 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-ritual-pink to-ritual-pink/60 transition-all duration-500" style={{ width: `${heroHpPct(bot?.heroHp ?? 0n)}%` }} />
                  </div>
                </div>
              </div>

              {/* 敌方随从 */}
              <div className="grid grid-cols-5 gap-2 min-h-[120px]">
                {Array.from({ length: 5 }).map((_, i) => {
                  const min = bot?.board[i];
                  if (!min || min.cardId === 0n) {
                    return <div key={i} className="rounded-lg border border-dashed border-gray-700/70 min-h-[120px]" />;
                  }
                  const selectable = attackerIdx !== null && myTurn && !finished;
                  return (
                    <CardView
                      key={i}
                      cardId={min.cardId}
                      size="sm"
                      onClick={selectable ? () => act('attack', [matchId, attackerIdx, 0, i]) : undefined}
                      hpOverride={min.hp}
                      atkOverride={min.atk}
                      dimmed={!selectable}
                    />
                  );
                })}
              </div>
            </div>

            {/* 战斗日志 */}
            <div className="border border-gray-800 rounded-xl bg-ritual-elevated/60 flex flex-col max-h-[340px]">
              <p className="text-xs uppercase tracking-widest text-gray-500 px-4 py-2 border-b border-gray-800">战斗日志</p>
              <div ref={logPanelRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 text-xs">
                {logs.length === 0 && <p className="text-gray-600 text-center py-6">等待第一回合…</p>}
                {logs.map((l) => (
                  <p key={l.id} className={l.actor.toLowerCase() === BOT_ADDRESS.toLowerCase() ? 'text-ritual-pink/90' : 'text-ritual-green/90'}>
                    {l.actor.toLowerCase() === BOT_ADDRESS.toLowerCase() ? '🤖 ' : '◆ '}
                    {l.text}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* 玩家手牌 */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              手牌 {myTurn ? '（你的回合）' : ''}
            </p>
            <div className="grid grid-cols-5 gap-2 min-h-[120px]">
              {Array.from({ length: 5 }).map((_, i) => {
                const cid = player?.hand[i];
                if (!cid || cid === 0n) {
                  return <div key={i} className="rounded-lg border border-dashed border-gray-700/70 min-h-[120px]" />;
                }
                const meta = cardById(cid);
                const affordable = myTurn && player!.mana >= BigInt(meta.cost) && !finished;
                const boardFull = player!.board.filter((b) => b.cardId !== 0n).length >= 5;
                return (
                  <CardView
                    key={i}
                    cardId={cid}
                    size="sm"
                    onClick={affordable && !boardFull ? () => act('playCard', [matchId, i]) : undefined}
                    dimmed={!affordable || boardFull || !myTurn}
                  />
                );
              })}
            </div>
          </div>

          {/* 玩家区域：随从 + 英雄 + 法力 + 结束回合 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid grid-cols-5 gap-2 flex-1 min-w-[300px]">
              {Array.from({ length: 5 }).map((_, i) => {
                const min = player?.board[i];
                if (!min || min.cardId === 0n) {
                  return <div key={i} className="rounded-lg border border-dashed border-gray-700/70 min-h-[120px]" />;
                }
                const canAttack = myTurn && min.canAct && !finished;
                const selected = attackerIdx === i;
                return (
                  <CardView
                    key={i}
                    cardId={min.cardId}
                    size="sm"
                    onClick={canAttack ? () => setAttackerIdx(selected ? null : i) : undefined}
                    hpOverride={min.hp}
                    atkOverride={min.atk}
                    canAttack={canAttack}
                    selected={selected}
                    label={selected ? '选为攻击者' : canAttack ? '可攻击' : '沉睡'}
                  />
                );
              })}
            </div>

            {/* 玩家英雄 */}
            <div className="flex items-center gap-3 border border-gray-800 rounded-xl p-3 bg-ritual-elevated min-w-[220px]">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-ritual-surface border border-ritual-green/50 text-ritual-green text-2xl">
                ◈
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-300">你</span>
                  <span className="font-mono text-ritual-green text-lg font-bold">{player?.heroHp.toString()}/30</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 mt-1 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-ritual-green to-ritual-green/60 transition-all duration-500" style={{ width: `${heroHpPct(player?.heroHp ?? 0n)}%` }} />
                </div>
                <div className="flex gap-0.5 mt-2">
                  {Array.from({ length: Number(player?.maxMana ?? 0) }).map((_, i) => (
                    <span key={i} className={`text-xs ${i < Number(player?.mana ?? 0) ? 'text-ritual-gold' : 'text-gray-700'}`}>◆</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => act('endTurn', [matchId])}
                disabled={!myTurn || busy || finished}
                className="border border-ritual-gold text-ritual-gold hover:bg-ritual-gold/10 px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40"
              >
                {busy ? '处理中…' : '结束回合 ⏭'}
              </button>
            </div>
          </div>

          {/* 攻击提示 */}
          {attackerIdx !== null && myTurn && (
            <p className="text-xs text-ritual-lime">
              ⚔ 已选择随从 #{attackerIdx + 1} —— 点击敌方随从或英雄头像发起攻击
            </p>
          )}
        </div>
      )}

      {matchId && !match && (
        <p className="text-gray-500 text-sm text-center py-16">对局已创建，等待链上确认…</p>
      )}

      {matchId && (
        <p className="text-xs font-mono text-gray-600">
          对局 #{matchId.toString()} ·{' '}
          <a href={`${EXPLORER}/tx/${startTx ?? ''}`} target="_blank" rel="noreferrer" className="hover:text-ritual-green">
            查看交易
          </a>
        </p>
      )}
    </div>
  );
}
