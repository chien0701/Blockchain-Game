import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { wheelSeg, WHEEL, bpsToX } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const COLORS = ['#374151', '#1a5cff', '#374151', '#10b981', '#374151', '#f59e0b', '#374151', '#8b5cf6'];

export default function Wheel() {
  const [round, setRound] = useState(0);
  return <WheelRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function WheelRound({ onPlayAgain }) {
  const cr = useBetting();
  const [amount, setAmount] = useState(() => getPref('bet_wheel', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;
    const seg = wheelSeg(cr.finalRandom);
    const mult = WHEEL[seg] / 10000;
    const win = WHEEL[seg] > 0;
    const consistent = cr.settlement ? cr.settlement.outcome === seg : null;
    setOutcome({ seg, mult, win, consistent });
    saveGame({
      gameId, gameType: 'wheel', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `轉盤 ${mult}×` },
      betAmount: cr.isBetting ? amount : null, payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-gray-400">🎡 轉盤 8 段 — 停在哪段就是幾倍（0× 代表輸）</div>
      <div className="flex justify-center gap-1.5">
        {WHEEL.map((m, i) => (
          <div key={i} className="w-9 h-9 rounded flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: COLORS[i] }}>
            {m > 0 ? `${bpsToX(m)}×` : '0'}
          </div>
        ))}
      </div>
      {cr.isBetting && (
        <BetPanel value={amount} onChange={setAmount} walletEth={cr.walletEth} poolEth={cr.poolEth}
          maxMultiplier={2.5} payoutLabel="最高 2.5×" />
      )}
    </div>
  );

  const params = () => {
    setPref('bet_wheel', { amount });
    return { gameType: 6, betType: 0, param: 0, amountEth: amount };
  };
  const crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: () => cr.quickPlay(params()) };

  return (
    <CommitRevealFlow cr={crForFlow} title="幸運轉盤" revealLabel="轉！" betSlot={betSlot}>
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.win ? `${outcome.mult}× 中獎！` : '停在 0×'}
            sub={`轉盤落在第 ${outcome.seg + 1} 段`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-10 flex flex-col items-center gap-3">
            <div className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-extrabold text-white border-4 border-white/20"
              style={{ background: COLORS[outcome.seg] }}>
              {outcome.mult}×
            </div>
            {outcome.consistent !== null && (
              <div className={`text-xs ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
                {outcome.consistent ? '✅ 合約與本地重算一致' : '🚨 不一致！'}
              </div>
            )}
          </div>
          <CryptoProof finalRandom={cr.finalRandom} chainGameId={cr.chainGameId}
            commitTxHash={cr.commitTxHash} revealTxHash={cr.revealTxHash} />
          <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
        </div>
      )}
    </CommitRevealFlow>
  );
}
