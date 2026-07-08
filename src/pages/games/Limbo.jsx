import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { crashBps } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const TARGETS = [1.5, 2, 5, 10, 25];

export default function Limbo() {
  const [round, setRound] = useState(0);
  return <LimboRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function LimboRound({ onPlayAgain }) {
  const cr = useBetting();
  const [target, setTarget] = useState(() => getPref('bet_limbo', {}).target ?? 2);
  const [amount, setAmount] = useState(() => getPref('bet_limbo', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;
    const rolledX = crashBps(cr.finalRandom) / 10000;
    const win = rolledX >= target;
    const consistent = cr.settlement ? cr.settlement.outcome === crashBps(cr.finalRandom) : null;
    setOutcome({ rolledX, win, consistent });
    saveGame({
      gameId, gameType: 'limbo', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `擲出 ${rolledX.toFixed(2)}×（目標 ${target}×）` },
      betAmount: cr.isBetting ? amount : null, payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-gray-400">💥 選目標倍率 — 系統擲出的倍率 ≥ 你的目標就贏</div>
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
    setPref('bet_limbo', { target, amount });
    return { gameType: 5, betType: 0, param: Math.round(target * 10000), amountEth: amount };
  };
  const crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: () => cr.quickPlay(params()) };

  return (
    <CommitRevealFlow cr={crForFlow} title="Limbo" revealLabel="擲倍率" betSlot={betSlot}>
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.win ? '突破！' : '未達標'}
            sub={`擲出 ${outcome.rolledX.toFixed(2)}× · 目標 ${target}×`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-gradient-to-b from-electric-950 to-ink-900 border border-electric-800 rounded-2xl p-12 text-center">
            <div className={`text-6xl font-extrabold font-mono ${outcome.win ? 'text-emerald-400' : 'text-red-400'}`}>
              {outcome.rolledX.toFixed(2)}×
            </div>
            {outcome.consistent !== null && (
              <div className={`text-xs mt-3 ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
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
