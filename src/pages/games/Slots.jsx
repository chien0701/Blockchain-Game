import { useState, useEffect, useRef } from 'react';
import { useCommitReveal } from '../../hooks/useCommitReveal';
import CommitRevealFlow from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { mapRange } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame } from '../../utils/storage';

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];

export default function Slots() {
  const [round, setRound] = useState(0);
  return <SlotsRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function SlotsRound({ onPlayAgain }) {
  const cr = useCommitReveal();
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
    const tier = allSame ? 'JACKPOT 三連線！' : twoSame ? '兩連線小獎' : '未中獎';

    setOutcome({ symbols, win, allSame, tier });
    saveGame({
      gameId, gameType: 'slots', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `拉霸：${symbols.join(' ')}` },
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  return (
    <CommitRevealFlow cr={cr} title="拉霸" revealLabel="拉下拉桿">
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.allSame ? '🎉 JACKPOT！' : outcome.win ? '中獎！' : '再接再厲'} sub={outcome.tier} />
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
          </div>
          <CryptoProof finalRandom={cr.finalRandom} chainGameId={cr.chainGameId}
            commitTxHash={cr.commitTxHash} revealTxHash={cr.revealTxHash} />
          <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
        </div>
      )}
    </CommitRevealFlow>
  );
}
