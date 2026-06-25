import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import StepBar from '../../components/StepBar';
import { ResultBanner, ResultActions } from '../../components/GameResult';
import { shortenHash, newGameId } from '../../utils/crypto';
import { saveGame } from '../../utils/storage';

const hashOf = (data, nonce) => ethers.keccak256(ethers.toUtf8Bytes(`${data}:${nonce}`));
const meetsTarget = (hash, diff) => hash.slice(2, 2 + diff) === '0'.repeat(diff);

export default function Mining() {
  const [round, setRound] = useState(0);
  return <MiningRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function MiningRound({ onPlayAgain }) {
  const [gameId] = useState(() => newGameId());
  const [blockData] = useState(() => `FairChain Block #${Math.floor(Date.now() / 1000)}`);
  const [diff, setDiff]       = useState(4);
  const [nonce, setNonce]     = useState(0);
  const [hash, setHash]       = useState(() => hashOf(`FairChain Block`, 0));
  const [mining, setMining]   = useState(false);
  const [found, setFound]     = useState(false);
  const [attempts, setAttempts] = useState(0);
  const nonceRef = useRef(0);
  const saved = useRef(false);

  useEffect(() => { setHash(hashOf(blockData, nonce)); }, [blockData]);

  useEffect(() => {
    if (!mining) return;
    const timer = setInterval(() => {
      let n = nonceRef.current;
      for (let i = 0; i < 400; i++) {
        n++;
        const h = hashOf(blockData, n);
        if (meetsTarget(h, diff)) {
          nonceRef.current = n;
          setNonce(n); setHash(h); setAttempts(a => a + i + 1);
          setMining(false); setFound(true);
          if (!saved.current) {
            saved.current = true;
            saveGame({
              gameId, gameType: 'mining', blockData, nonce: n, hash: h, difficulty: diff,
              result: { winner: 'player', reason: `難度 ${diff}，nonce=${n}` },
              timestamp: new Date().toISOString(),
            });
          }
          return;
        }
      }
      nonceRef.current = n;
      setNonce(n); setHash(hashOf(blockData, n)); setAttempts(a => a + 400);
    }, 16);
    return () => clearInterval(timer);
  }, [mining, diff, blockData]);

  const valid = meetsTarget(hash, diff);

  const manualNonce = (v) => {
    const n = Math.max(0, Number(v) || 0);
    nonceRef.current = n; setNonce(n); setHash(hashOf(blockData, n));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepBar currentPhase={found ? 'result' : 'reveal'} />

      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">⛏️ 挖礦模擬 · Proof of Work</h2>
          <p className="text-gray-400 mt-1 text-sm max-w-md mx-auto">
            不斷調整 <span className="font-mono text-electric-300">nonce</span>，找出讓
            <span className="font-mono text-electric-300"> keccak256(block‖nonce)</span> 開頭有 {diff} 個 0 的解。
          </p>
        </div>

        {/* 難度 */}
        <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">難度（前導 0 的數量）</span>
            <span className="mono-tag text-electric-400">{'0'.repeat(diff)}…</span>
          </div>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map(d => (
              <button key={d} disabled={mining} onClick={() => { setDiff(d); setFound(false); saved.current = false; }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-40
                  ${diff === d ? 'bg-electric-700 text-white' : 'bg-ink-800 text-gray-400'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 區塊 */}
        <div className="bg-ink-950 border border-electric-900/40 rounded-2xl p-5 font-mono text-sm space-y-3">
          <div><span className="text-gray-600">block:</span> <span className="text-gray-300">{blockData}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">nonce:</span>
            <input type="number" value={nonce} disabled={mining}
              onChange={e => manualNonce(e.target.value)}
              className="w-32 bg-ink-800 border border-gray-700 rounded px-2 py-1 text-electric-300 outline-none focus:border-electric-500 disabled:opacity-60" />
          </div>
          <div className="break-all">
            <span className="text-gray-600">hash:</span>{' '}
            <span className={valid ? 'text-emerald-400' : 'text-gray-400'}>
              <span className="bg-electric-950 px-1 rounded">{hash.slice(0, 2 + diff)}</span>{hash.slice(2 + diff, 24)}…
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-electric-900/30 text-xs">
            <span className="text-gray-600">嘗試次數：<span className="text-gray-400">{attempts.toLocaleString()}</span></span>
            <span className={valid ? 'text-emerald-400' : 'text-gray-600'}>{valid ? '✅ 符合難度' : '✗ 不符合'}</span>
          </div>
        </div>

        {found ? (
          <div className="space-y-6 animate-fade-in-up">
            <ResultBanner win title="⛏️ 挖礦成功！" sub={`難度 ${diff} · 嘗試 ${attempts.toLocaleString()} 次 · nonce=${nonce}`} />
            <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-4 text-sm text-emerald-300">
              找到符合條件的 nonce 很<strong>難</strong>（要試很多次），但任何人用這個 nonce 重算 hash 來<strong>驗證只需一次</strong>——這就是工作量證明的核心。
            </div>
            <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
          </div>
        ) : (
          <button onClick={() => setMining(m => !m)}
            className={`w-full font-bold rounded-2xl py-4 text-lg transition-all
              ${mining ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-electric-600 hover:bg-electric-500 text-white hover:scale-[1.02] shadow-glow-sm'}`}>
            {mining ? '⏸ 停止挖礦' : '⛏️ 開始自動挖礦'}
          </button>
        )}
      </div>
    </div>
  );
}
