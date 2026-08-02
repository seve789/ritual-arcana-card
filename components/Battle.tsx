'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { cardGameAbi } from '@/lib/abi';
import { GAME_ADDRESS, EXPLORER } from '@/lib/addresses';
import { cardById } from '@/lib/cards';
import { BOT_ADDRESS, MODE_LABEL, type MatchState, type BattleLogEntry } from '@/lib/types';
import CardView from './CardView';

const POLL_MS = 3000;
const LOG_EVENT = (cardGameAbi as any[]).find((e) => e.type === 'event' && e.name === 'Log');

interface ModeDef {
  id: number;
  name: string;
  desc: string;
  icon: string;
  needDeck: boolean;
  accent: string;
}

const MODES: ModeDef[] = [
  { id: 0, name: 'Solo', desc: '单人对链上 AI，经典对决', icon: '▣', needDeck: true, accent: 'border-ritual-green text-ritual-green hover:bg-ritual-green/10' },
  { id: 1, name: 'PvP', desc: '真人匹配对战，创建或加入', icon: '⚔', needDeck: true, accent: 'border-ritual-pink text-ritual-pink hover:bg-ritual-pink/10' },
  { id: 2, name: 'Endless', desc: '无尽波次，Bot 逐波变强', icon: '⟳', needDeck: true, accent: 'border-ritual-gold text-ritual-gold hover:bg-ritual-gold/10' },
  { id: 3, name: 'Daily', desc: '全服同一 Bot，最快回合上榜', icon: '◈', needDeck: true, accent: 'border-ritual-lime text-ritual-lime hover:bg-ritual-lime/10' },
  { id: 4, name: 'Quick', desc: '随机卡组免组牌，即点即玩', icon: '⚡', needDeck: false, accent: 'border-gray-400 text-gray-300 hover:bg-gray-400/10' },
];

export default function Battle() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<number | null>(null);
  const [deck, setDeck] = useState<bigint[] | null>(null);
  const [matchId, setMatchId] = useState<bigint | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [logs, setLogs] = useState<BattleLogEntry[]>([]);
  const [attackerIdx, setAttackerIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [startTx, setStartTx] = useState<`0x${string}` | null>(null);
  const [joinId, setJoinId] = useState('');
  const [copied, setCopied] = useState(false);

  const lastLogBlock = useRef<bigint | null>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<boolean>(false);

  // ---------- 数据读取 ----------
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

  const { data: bestWaveData, refetch: refetchBestWave } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getBestWave',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: dailyBoard, refetch: refetchDaily } = useReadContract({
    address: GAME_ADDRESS,
    abi: cardGameAbi,
    functionName: 'getDailyLeaderboard',
    args: match ? [match.dailyDay] : undefined,
    query: { enabled: !!match && match.mode === 3, refetchInterval: 10_000 },
  });

  useEffect(() => {
    if (savedDeckData && !deck) {
      const d = savedDeckData as unknown as bigint[];
      if (d.some((x) => x > 0n)) setDeck(d);
    }
  }, [savedDeckData, deck]);

  // ---------- 开始对局 ----------
  const startMatch = async (m: number) => {
    if (mode === 1) return; // PvP 走独立流程
    if (MODES[m].needDeck && !deck) return;
    setErr(null);
    setLogs([]);
    setMatch(null);
    setMatchId(null);
    setAttackerIdx(null);
    try {
      const fn =
        m === 0 ? 'startSoloMatch' : m === 2 ? 'startEndlessMatch' : m === 3 ? 'startDailyMatch' : 'startQuickMatch';
      const args = m === 4 ? [] : [deck!];
      const hash = await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: fn,
        args,
        gas: 1_500_000n,
      });
      setStartTx(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '开始对局失败');
    }
  };

  const createPvP = async () => {
    if (!deck) return;
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'createPvPMatch',
        args: [deck],
        gas: 1_500_000n,
      });
      setStartTx(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '创建失败');
    }
  };

  const joinPvP = async () => {
    if (!deck || !joinId) return;
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'joinPvPMatch',
        args: [BigInt(joinId), deck],
        gas: 1_500_000n,
      });
      setStartTx(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '加入失败');
    }
  };

  const cancelPvP = async () => {
    if (!matchId) return;
    setErr(null);
    try {
      await writeContractAsync({
        address: GAME_ADDRESS,
        abi: cardGameAbi,
        functionName: 'cancelPvPMatch',
        args: [matchId],
        gas: 300_000n,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : '取消失败');
    }
  };

  // 开始交易确认 → 解析 MatchStarted
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
      const joins = parseEventLogs({
        abi: cardGameAbi,
        logs: startReceipt.logs,
        eventName: 'MatchJoined',
      }) as unknown as { args: { matchId: bigint } }[];
      const ev = evs[0] ?? joins[0];
      if (ev) {
        setMatchId(ev.args.matchId);
        lastLogBlock.current = startReceipt.blockNumber - 1n;
      }
    }
  }, [startReceipt, matchId]);

  // ---------- 轮询对战状态 + 日志 ----------
  useEffect(() => {
    if (!matchId || !publicClient || pollingRef.current) return;
    pollingRef.current = true;
    let cancelled = false;
    const tick = async () => {
      try {
        const m = (await publicClient.readContract({
          address: GAME_ADDRESS,
          abi: cardGameAbi,
          functionName: 'getMatch',
          args: [matchId],
        })) as unknown as MatchState;
        if (!cancelled) {
          setMatch(m);
          if (m.mode === 2) refetchBestWave();
          if (m.mode === 3) refetchDaily();
        }
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
        // 瞬时 RPC 错误忽略
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      pollingRef.current = false;
    };
  }, [matchId, publicClient, refetchBestWave, refetchDaily]);

  useEffect(() => {
    if (logPanelRef.current) logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
  }, [logs]);

  // ---------- 行动 ----------
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

  const copyMatchId = () => {
    if (!matchId) return;
    navigator.clipboard?.writeText(matchId.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---------- 派生状态 ----------
  const isPvP = match?.mode === 1;
  const myTurn =
    match !== null &&
    match.phase === 1 &&
    (isPvP ? match.playerAddr[Number(match.turn)]?.toLowerCase() === address?.toLowerCase() : match.turn === 0n);
  const finished = match !== null && match.phase === 2;
  const victory = finished && match!.winner.toLowerCase() === address?.toLowerCase();
  const me = isPvP ? (match!.playerAddr[0]?.toLowerCase() === address?.toLowerCase() ? 0 : 1) : 0;
  const enemy = me === 0 ? 1 : 0;
  const myState = match?.players[me];
  const enemyState = match?.players[enemy];
  const enemyIsBot = match?.playerAddr[enemy]?.toLowerCase() === BOT_ADDRESS.toLowerCase();
  const heroHpPct = (hp: bigint) => Math.max(0, Math.min(100, (Number(hp) / 50) * 100));
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const enemyLabel = enemyIsBot ? 'Enemy AI' : `对手 ${match ? short(match.playerAddr[enemy]) : ''}`;

  const dailyTurns = dailyBoard as unknown as { players: string[]; turns: bigint[] } | undefined;

  return (
    <div className="animate-fade-up space-y-4">
      {/* ========== 模式选择 / 未开战 ========== */}
      {!matchId && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-gray-200">选择玩法</h2>
              <p className="text-sm text-gray-400 mt-1">五种模式，全部状态存于 Ritual Chain</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {MODES.map((md) => (
              <button
                key={md.id}
                onClick={() => setMode(md.id)}
                className={`border rounded-xl p-4 text-left transition-all ${md.accent} ${mode === md.id ? 'ring-2 ring-ritual-lime shadow-glow-green' : 'opacity-70 hover:opacity-100'}`}
              >
                <div className="text-2xl mb-2">{md.icon}</div>
                <div className="font-semibold">{md.name}</div>
                <div className="text-xs mt-1 opacity-70 leading-snug">{md.desc}</div>
              </button>
            ))}
          </div>

          {err && <div className="text-red-400 text-sm border border-red-500/40 rounded-lg px-4 py-2 bg-red-500/5">{err}</div>}

          {mode !== null && (
            <div className="border border-gray-800 rounded-xl p-5 bg-ritual-elevated/60 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-200">
                    {MODES[mode].icon} {MODES[mode].name} 模式
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{MODES[mode].desc}</p>
                </div>

                {mode === 1 ? (
                  <div className="flex gap-2">
                    <button
                      onClick={createPvP}
                      disabled={!deck || !deckOk || busy}
                      className="border border-ritual-pink text-ritual-pink hover:bg-ritual-pink/10 px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40"
                    >
                      ⚔ 创建匹配
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startMatch(mode)}
                    disabled={(MODES[mode].needDeck && (!deck || !deckOk)) || busy}
                    className={`px-6 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 border ${MODES[mode].accent.split(' ')[0]} ${MODES[mode].accent.split(' ')[1]}`}
                  >
                    {busy ? '发起中…' : `开始 ${MODES[mode].name}`}
                  </button>
                )}
              </div>

              {MODES[mode].needDeck && deckOk === false && (
                <div className="text-ritual-gold text-xs border border-ritual-gold/40 rounded-lg px-3 py-2 bg-ritual-gold/5">
                  ⚠ 卡组无效 —— 请先在「卡组」页保存 10 张不重复且已拥有的卡
                </div>
              )}
              {MODES[mode].needDeck && !deck && (
                <div className="text-gray-500 text-xs border border-dashed border-gray-700 rounded-lg px-3 py-2">
                  未找到已保存的卡组
                </div>
              )}

              {deck && MODES[mode].needDeck && deckOk === true && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {deck.map((id, i) => (
                    <CardView key={i} cardId={id} size="xs" />
                  ))}
                </div>
              )}

              {/* PvP 加入区 */}
              {mode === 1 && (
                <div className="border-t border-gray-800 pt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs uppercase tracking-widest text-gray-500 block mb-1.5">
                      加入好友的对局（输入 matchId）
                    </label>
                    <input
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="例如 42"
                      className="w-full bg-ritual-surface border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-ritual-pink"
                    />
                  </div>
                  <button
                    onClick={joinPvP}
                    disabled={!deck || !deckOk || !joinId || busy}
                    className="border border-gray-400 text-gray-300 hover:bg-gray-400/10 px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40"
                  >
                    加入对局
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== PvP 等待对手 ========== */}
      {matchId && isPvP && match?.phase === 0 && (
        <div className="border border-ritual-pink/40 rounded-xl p-8 text-center bg-ritual-pink/5 space-y-4">
          <div className="text-4xl animate-pulse">⚔</div>
          <p className="font-display text-xl text-ritual-pink">等待对手加入…</p>
          <p className="text-sm text-gray-400">把你的对局 ID 发给好友：</p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-3xl text-ritual-lime">{matchId.toString()}</span>
            <button
              onClick={copyMatchId}
              className="border border-ritual-green text-ritual-green hover:bg-ritual-green/10 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {copied ? '✓ 已复制' : '复制 ID'}
            </button>
          </div>
          <button
            onClick={cancelPvP}
            className="text-xs text-gray-500 border border-gray-700 px-4 py-2 rounded-lg hover:text-red-400 hover:border-red-500/50"
          >
            取消匹配
          </button>
        </div>
      )}

      {/* ========== 对局中 ========== */}
      {matchId && match && match.phase > 0 && (
        <div className="space-y-4">
          {/* 模式横幅 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-gray-500">#{matchId.toString()}</span>
              <span className="font-semibold text-ritual-green">{MODE_LABEL[match.mode]}</span>
              {match.mode === 2 && <span className="text-ritual-gold font-semibold">第 {match.wave.toString()} 波</span>}
              {match.mode === 3 && <span className="text-ritual-lime font-mono">回合数 {match.turnCount.toString()}</span>}
              {match.mode === 2 && (
                <span className="text-gray-500 font-mono text-xs">最高波: {bestWaveData?.toString() ?? '0'}</span>
              )}
            </div>
            {err && <span className="text-red-400 text-xs">{err}</span>}
          </div>

          {/* 结算横幅 */}
          {finished && (
            <div className={`rounded-xl border px-6 py-4 text-center ${victory ? 'border-ritual-green bg-ritual-green/10' : 'border-red-500/50 bg-red-500/10'}`}>
              <p className={`font-display text-2xl ${victory ? 'text-ritual-green' : 'text-red-400'}`}>
                {victory ? '✦ 胜利！' : '✕ 战败'}
                {match.mode === 2 && victory && ` —— 通过第 ${match.wave.toString()} 波`}
                {match.mode === 3 && victory && `（${match.turnCount.toString()} 回合）`}
              </p>
              <div className="flex justify-center gap-3 mt-3 flex-wrap">
                <button
                  onClick={() => { setMatchId(null); setMatch(null); setMode(null); setLogs([]); }}
                  className="border border-gray-600 text-gray-300 hover:border-gray-400 px-5 py-2 rounded-lg text-sm"
                >
                  返回选模式
                </button>
                {victory && match.mode === 2 && (
                  <button onClick={() => startMatch(2)} className="border border-ritual-gold text-ritual-gold hover:bg-ritual-gold/10 px-5 py-2 rounded-lg text-sm font-semibold">
                    ⟳ 继续下一波
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 回合指示 */}
          {!finished && isPvP && (
            <div className={`text-center text-sm py-1.5 rounded-lg border ${myTurn ? 'border-ritual-green/50 bg-ritual-green/5 text-ritual-green' : 'border-gray-700 text-gray-400'}`}>
              {myTurn ? '⚔ 你的回合' : `⏳ ${enemyLabel} 的回合…`}
            </div>
          )}

          {/* 敌方区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            <div className="space-y-3">
              {/* 敌方英雄（选中攻击者可点击） */}
              <div
                onClick={attackerIdx !== null && myTurn && !finished ? () => act('attack', [matchId, attackerIdx, 1, 0]) : undefined}
                className={`flex items-center gap-3 border border-gray-800 rounded-xl p-3 bg-ritual-elevated ${attackerIdx !== null && myTurn && !finished ? 'cursor-crosshair hover:border-ritual-pink transition-colors' : ''}`}
              >
                <div className={`flex items-center justify-center w-12 h-12 rounded-lg bg-ritual-surface border text-2xl ${enemyIsBot ? 'border-ritual-pink/50 text-ritual-pink' : 'border-ritual-lime/50 text-ritual-lime'}`}>
                  {enemyIsBot ? '▣' : '⚔'}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-gray-300">{enemyLabel}</span>
                    <span className={`font-mono text-lg font-bold ${enemyIsBot ? 'text-ritual-pink' : 'text-ritual-lime'}`}>
                      {enemyState?.heroHp.toString()}
                      {match.mode === 2 ? '/50' : '/30'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 mt-1 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${enemyIsBot ? 'bg-gradient-to-r from-ritual-pink to-ritual-pink/60' : 'bg-gradient-to-r from-ritual-lime to-ritual-lime/60'}`}
                      style={{ width: `${heroHpPct(enemyState?.heroHp ?? 0n)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 敌方随从 */}
              <div className="grid grid-cols-5 gap-2 min-h-[120px]">
                {Array.from({ length: 5 }).map((_, i) => {
                  const min = enemyState?.board[i];
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

            {/* 日志 */}
            <div className="border border-gray-800 rounded-xl bg-ritual-elevated/60 flex flex-col max-h-[340px]">
              <p className="text-xs uppercase tracking-widest text-gray-500 px-4 py-2 border-b border-gray-800">战斗日志</p>
              <div ref={logPanelRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 text-xs">
                {logs.length === 0 && <p className="text-gray-600 text-center py-6">等待第一回合…</p>}
                {logs.map((l) => {
                  const isBot = l.actor.toLowerCase() === BOT_ADDRESS.toLowerCase();
                  const isMe = l.actor.toLowerCase() === address?.toLowerCase();
                  return (
                    <p key={l.id} className={isBot ? 'text-ritual-pink/90' : isMe ? 'text-ritual-green/90' : 'text-ritual-lime/90'}>
                      {isBot ? '🤖 ' : isMe ? '◆ ' : '⚔ '}
                      {l.text}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 玩家手牌 */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-gray-500">手牌 {myTurn ? '（你的回合）' : ''}</p>
            <div className="grid grid-cols-5 gap-2 min-h-[120px]">
              {Array.from({ length: 5 }).map((_, i) => {
                const cid = myState?.hand[i];
                if (!cid || cid === 0n) {
                  return <div key={i} className="rounded-lg border border-dashed border-gray-700/70 min-h-[120px]" />;
                }
                const meta = cardById(cid);
                const affordable = myTurn && (myState?.mana ?? 0n) >= BigInt(meta.cost) && !finished;
                const boardFull = (myState?.board.filter((b) => b.cardId !== 0n).length ?? 0) >= 5;
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

          {/* 玩家区域 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid grid-cols-5 gap-2 flex-1 min-w-[300px]">
              {Array.from({ length: 5 }).map((_, i) => {
                const min = myState?.board[i];
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

            {/* 玩家英雄 + 法力 + 结束回合 */}
            <div className="flex items-center gap-3 border border-gray-800 rounded-xl p-3 bg-ritual-elevated min-w-[240px]">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-ritual-surface border border-ritual-green/50 text-ritual-green text-2xl">◈</div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-300">你</span>
                  <span className="font-mono text-ritual-green text-lg font-bold">{myState?.heroHp.toString()}/30</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 mt-1 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-ritual-green to-ritual-green/60 transition-all duration-500" style={{ width: `${heroHpPct(myState?.heroHp ?? 0n)}%` }} />
                </div>
                <div className="flex gap-0.5 mt-2">
                  {Array.from({ length: Number(myState?.maxMana ?? 0) }).map((_, i) => (
                    <span key={i} className={`text-xs ${i < Number(myState?.mana ?? 0) ? 'text-ritual-gold' : 'text-gray-700'}`}>◆</span>
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

          {attackerIdx !== null && myTurn && (
            <p className="text-xs text-ritual-lime">⚔ 已选择随从 #{attackerIdx + 1} —— 点击敌方随从或英雄头像发起攻击</p>
          )}

          {/* Daily 排行榜 */}
          {match.mode === 3 && (
            <div className="border border-gray-800 rounded-xl p-4 bg-ritual-elevated/60">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">今日排行榜（最快回合）</p>
              <div className="space-y-1.5">
                {(dailyTurns?.players ?? []).map((p, i) =>
                  dailyTurns!.turns[i] > 0n ? (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className={`font-mono w-6 ${i === 0 ? 'text-ritual-gold' : 'text-gray-500'}`}>{i + 1}</span>
                      <span className={`font-mono text-xs flex-1 ${p.toLowerCase() === address?.toLowerCase() ? 'text-ritual-green' : 'text-gray-300'}`}>
                        {p.slice(0, 6)}…{p.slice(-4)}
                        {p.toLowerCase() === address?.toLowerCase() ? ' (你)' : ''}
                      </span>
                      <span className="font-mono text-ritual-lime">{dailyTurns!.turns[i].toString()} 回合</span>
                    </div>
                  ) : null,
                )}
                {(dailyTurns?.players ?? []).filter((_, i) => dailyTurns!.turns[i] > 0n).length === 0 && (
                  <p className="text-gray-600 text-xs py-2">还没有人上榜 —— 赢下每日挑战即可上榜</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {matchId && !match && <p className="text-gray-500 text-sm text-center py-16">对局已创建，等待链上确认…</p>}

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
