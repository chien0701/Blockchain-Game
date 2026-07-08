import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { plinkoBucket, PLINKO, bpsToX } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const bucketColor = (m) => m >= 90000 ? 'bg-red-600' : m >= 20000 ? 'bg-amber-600' : m >= 11000 ? 'bg-electric-700' : 'bg-ink-700';

export default function Plinko() {
  const [round, setRound] = useState(0);
  return <PlinkoRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function PlinkoRound({ onPlayAgain }) {
  const cr = useBetting();
  const [amount, setAmount] = useState(() => getPref('bet_plinko', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;
    const bucket = plinkoBucket(cr.finalRandom);
    const mult = PLINKO[bucket] / 10000;
    const win = mult >= 1;
    const consistent = cr.settlement ? cr.settlement.outcome === bucket : null;
    setOutcome({ bucket, mult, win, consistent });
    saveGame({
      gameId, gameType: 'plinko', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `Plinko ${mult}×` },
      betAmount: cr.isBetting ? amount : null, payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-gray-400">🔻 彈珠掉落 16 排釘子，落到哪個槽就是幾倍（中間低、兩邊高）</div>
      <div className="flex justify-center gap-0.5 flex-wrap">
        {PLINKO.map((m, i) => (
          <div key={i} className={`w-8 h-8 rounded ${bucketColor(m)} flex items-center justify-center text-[8px] font-bold text-white`}>
            {bpsToX(m)}
          </div>
        ))}
      </div>
      {cr.isBetting && (
        <BetPanel value={amount} onChange={setAmount} walletEth={cr.walletEth} poolEth={cr.poolEth}
          maxMultiplier={16} payoutLabel="最高 16×" />
      )}
    </div>
  );

  const params = () => {
    setPref('bet_plinko', { amount });
    return { gameType: 7, betType: 0, param: 0, amountEth: amount };
  };
  const crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: () => cr.quickPlay(params()) };

  return (
    <CommitRevealFlow cr={crForFlow} title="Plinko 彈珠" revealLabel="投球！" betSlot={betSlot}>
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.mult >= 5 ? `💎 ${outcome.mult}×！` : outcome.win ? `${outcome.mult}×` : `${outcome.mult}×`}
            sub={`彈珠落在第 ${outcome.bucket + 1} 槽`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-gradient-to-b from-electric-950 to-ink-900 border border-electric-800 rounded-2xl p-8">
            <div className="flex justify-center gap-0.5 flex-wrap">
              {PLINKO.map((m, i) => (
                <div key={i} className={`w-8 h-10 rounded flex items-center justify-center text-[8px] font-bold text-white
                  ${i === outcome.bucket ? 'ring-2 ring-white scale-110 ' + bucketColor(m) : bucketColor(m) + ' opacity-50'}`}>
                  {i === outcome.bucket ? '🔴' : bpsToX(m)}
                </div>
              ))}
            </div>
            {outcome.consistent !== null && (
              <div className={`text-center text-xs mt-3 ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
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
