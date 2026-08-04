import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { revolverChamber } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const multOf = (bullets) => 6 / (6 - bullets);

export default function Revolver() {
  const [round, setRound] = useState(0);
  return <RevolverRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function RevolverRound({ onPlayAgain }) {
  const cr = useBetting();
  const [bullets, setBullets] = useState(() => getPref('bet_revolver', {}).bullets ?? 1);
  const [amount, setAmount]   = useState(() => getPref('bet_revolver', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;
    const chamber = revolverChamber(cr.finalRandom);
    const survived = chamber >= bullets;
    const consistent = cr.settlement ? cr.settlement.outcome === chamber : null;
    setOutcome({ chamber, survived, consistent });
    saveGame({
      gameId, gameType: 'revolver', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: survived ? 'player' : 'dealer', reason: `${bullets} 發子彈，轉出第 ${chamber + 1} 膛` },
      betAmount: cr.isBetting ? amount : null, payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const mult = multOf(bullets);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-gray-400">🔫 6 個彈膛裝 N 發子彈 — 裝越多賠越高，但存活率越低</div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setBullets(n)}
            className={`rounded-lg py-2 text-sm font-bold border transition-all flex flex-col items-center
              ${bullets === n ? 'bg-electric-600 border-electric-400 text-white shadow-glow-sm'
                : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
            <span>{n} 發</span>
            <span className="text-[9px] text-emerald-400">{multOf(n).toFixed(2)}×</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500">存活率 {Math.round((6 - bullets) / 6 * 100)}%</div>
      {cr.isBetting && (
        <BetPanel value={amount} onChange={setAmount} walletEth={cr.walletEth} poolEth={cr.poolEth}
          maxMultiplier={mult} payoutLabel={`${mult.toFixed(2)}×`} exact />
      )}
    </div>
  );

  const params = () => {
    setPref('bet_revolver', { bullets, amount });
    return { gameType: 8, betType: bullets, param: 0, amountEth: amount };
  };
  const crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: () => cr.quickPlay(params()) };

  return (
    <CommitRevealFlow cr={crForFlow} title="左輪輪盤" revealLabel="扣扳機" betSlot={betSlot} loaderTheme="revolver">
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.survived} title={outcome.survived ? '😮‍💨 存活！' : '💀 中彈'}
            sub={`裝 ${bullets} 發 · 轉出第 ${outcome.chamber + 1} 膛`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-ink-900 border border-electric-800 rounded-2xl p-8 flex flex-col items-center gap-4">
            <div className="grid grid-cols-6 gap-2">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg
                  ${i < bullets ? 'border-red-700' : 'border-gray-700'}
                  ${i === outcome.chamber ? (outcome.survived ? 'bg-emerald-800 border-emerald-400' : 'bg-red-800 border-red-400') : 'bg-ink-950'}`}>
                  {i === outcome.chamber ? (outcome.survived ? '✓' : '💥') : (i < bullets ? '🔴' : '')}
                </div>
              ))}
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
