import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { mapRange } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];

export default function Slots() {
  const [round, setRound] = useState(0);
  return <SlotsRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function SlotsRound({ onPlayAgain }) {
  const cr = useBetting();
  const [amount, setAmount] = useState(() => getPref('bet_slots', {}).amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;

    const reels = [0, 1, 2].map(i => mapRange(cr.finalRandom, i * 4, 4, SYMBOLS.length));
    const symbols = reels.map(i => SYMBOLS[i]);
    const allSame = reels[0] === reels[1] && reels[1] === reels[2];
    const twoSame = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
    const win = allSame || twoSame;
    const tier = allSame ? 'JACKPOT 三連線（8倍）！' : twoSame ? '兩連線（2倍）' : '未中獎';

    const localOutcome = reels[0] * 100 + reels[1] * 10 + reels[2];
    const consistent = cr.settlement ? cr.settlement.outcome === localOutcome : null;
    setOutcome({ symbols, win, allSame, tier, consistent });

    saveGame({
      gameId, gameType: 'slots', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `拉霸：${symbols.join(' ')}` },
      betAmount: cr.isBetting ? amount : null,
      payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = cr.isBetting ? (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-2">
      <div className="text-sm text-gray-400">賠率：三連線 8 倍 · 兩連線 2 倍</div>
      <BetPanel value={amount} onChange={setAmount}
        walletEth={cr.walletEth} poolEth={cr.poolEth}
        maxMultiplier={8} payoutLabel="最高 8×" />
    </div>
  ) : null;

  const betParams = () => {
    setPref('bet_slots', { amount });
    return { gameType: 3, betType: 0, param: 0, amountEth: amount };
  };
  const crForFlow = {
    ...cr,
    commit:    () => cr.commit(betParams()),
    quickPlay: () => cr.quickPlay(betParams()),
  };

  return (
    <CommitRevealFlow cr={crForFlow} title="拉霸" revealLabel="拉下拉桿" betSlot={betSlot} loaderTheme="slots">
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.allSame ? '🎉 JACKPOT！' : outcome.win ? '中獎！' : '再接再厲'} sub={outcome.tier} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-gradient-to-b from-electric-950 to-ink-900 border border-electric-800 rounded-2xl p-8">
            <div className="flex justify-center gap-3">
              {outcome.symbols.map((s, i) => (
                <div key={i}
                  style={{ animationDelay: `${i * 150}ms` }}
                  className="w-24 h-28 bg-white rounded-xl flex items-center justify-center text-6xl
                             shadow-glow animate-fade-in-up">
                  {s}
                </div>
              ))}
            </div>
            <div className="text-center mono-tag text-[10px] text-gray-500 mt-4 uppercase">
              REEL = finalRandom[byte i·4 : +4] mod {SYMBOLS.length}
            </div>
            {outcome.consistent !== null && (
              <div className={`text-center text-xs mt-2 ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
                {outcome.consistent ? '✅ 合約判定結果與本地重算完全一致' : '🚨 合約結果與本地重算不一致！'}
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
