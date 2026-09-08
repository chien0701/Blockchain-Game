import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions, SimulationNotice } from '../../components/GameResult';
import { crashBps, bpsToX } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const TARGETS = [1.5, 2, 3, 5, 10];

export default function Crash() {
  const [round, setRound] = useState(0);
  return <CrashRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function CrashRound({ onPlayAgain }) {
  const cr = useBetting();
  const [target, setTarget] = useState(() => getPref('bet_crash', {}).target ?? 2);
  const [amount, setAmount] = useState(() => getPref('bet_crash', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;
    const crashX = crashBps(cr.finalRandom) / 10000;
    const win = crashX >= target;
    const consistent = cr.settlement ? cr.settlement.outcome === crashBps(cr.finalRandom) : null;
    setOutcome({ crashX, win, consistent });
    saveGame({
      gameId, gameType: 'crash', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `崩於 ${crashX.toFixed(2)}×（目標 ${target}×）` },
      betAmount: cr.isBetting ? amount : null, payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-gray-400">🚀 選擇目標倍率 — 火箭撐到目標前沒崩盤就贏</div>
      <div className="grid grid-cols-5 gap-2">
        {TARGETS.map(t => (
          <button key={t} onClick={() => setTarget(t)}
            className={`rounded-lg py-2.5 text-sm font-bold border transition-all
              ${target === t ? 'bg-electric-600 border-electric-400 text-white shadow-glow-sm'
                : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
            {t}×
          </button>
        ))}
      </div>
      {cr.isBetting && (
        <BetPanel value={amount} onChange={setAmount} walletEth={cr.walletEth} poolEth={cr.poolEth}
          maxMultiplier={target} payoutLabel={`${target}×`} exact />
      )}
    </div>
  );

  const params = () => {
    setPref('bet_crash', { target, amount });
    return { gameType: 4, betType: 0, param: Math.round(target * 10000), amountEth: amount };
  };
  const crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: () => cr.quickPlay(params()) };

  return (
    <CommitRevealFlow cr={crForFlow} title="Crash 火箭" revealLabel="發射！" betSlot={betSlot} loaderTheme="crash">
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.win ? '🚀 成功脫離！' : '💥 火箭墜毀'}
            sub={`崩於 ${outcome.crashX.toFixed(2)}× · 你的目標 ${target}×`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-gradient-to-b from-electric-950 to-ink-900 border border-electric-800 rounded-2xl p-10 text-center">
            <div className="text-6xl mb-3">{outcome.win ? '🚀' : '💥'}</div>
            <div className={`text-5xl font-extrabold font-mono ${outcome.win ? 'text-emerald-400' : 'text-red-400'}`}>
              {outcome.crashX.toFixed(2)}×
            </div>
            <div className="mono-tag text-[10px] text-gray-500 mt-3 uppercase">崩盤點 = 10000·2⁵²/(2⁵²−h)</div>
            {outcome.consistent !== null && (
              <div className={`text-xs mt-2 ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
                {outcome.consistent ? '✅ 合約與本地重算一致' : '🚨 不一致！'}
              </div>
            )}
          </div>
          {!cr.onChain && <SimulationNotice />}
          <CryptoProof finalRandom={cr.finalRandom} chainGameId={cr.chainGameId}
            commitTxHash={cr.commitTxHash} revealTxHash={cr.revealTxHash} />
          <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
        </div>
      )}
    </CommitRevealFlow>
  );
}
