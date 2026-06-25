import { useState, useEffect, useRef } from 'react';
import { useCommitReveal } from '../../hooks/useCommitReveal';
import CommitRevealFlow from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { rollDie, intFromHex } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame } from '../../utils/storage';

const DICE_BETS = [
  { id: 'big',   label: '大 (4-6)', test: (r) => r >= 4 },
  { id: 'small', label: '小 (1-3)', test: (r) => r <= 3 },
  { id: 'odd',   label: '單', test: (r) => r % 2 === 1 },
  { id: 'even',  label: '雙', test: (r) => r % 2 === 0 },
];
const COIN_BETS = [
  { id: 'heads', label: '正面 🙂' },
  { id: 'tails', label: '反面 ⛓️' },
];

export default function Dice() {
  const [round, setRound] = useState(0);
  return <DiceRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function DiceRound({ onPlayAgain }) {
  const cr = useCommitReveal();
  const [mode, setMode] = useState('dice');
  const [bet, setBet]   = useState(null);
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;

    let win, faceText, resultNum;
    if (mode === 'dice') {
      resultNum = rollDie(cr.finalRandom);
      win = DICE_BETS.find(b => b.id === bet).test(resultNum);
      faceText = `${['','⚀','⚁','⚂','⚃','⚄','⚅'][resultNum]} ${resultNum} 點`;
    } else {
      const coin = intFromHex(cr.finalRandom, 0, 4) % 2;
      resultNum = coin;
      const side = coin === 0 ? 'heads' : 'tails';
      win = bet === side;
      faceText = coin === 0 ? '正面 🙂' : '反面 ⛓️';
    }
    setOutcome({ win, faceText, resultNum });

    saveGame({
      gameId, gameType: 'dice', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `${mode === 'dice' ? '骰子' : '硬幣'}：${faceText}` },
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const bets = mode === 'dice' ? DICE_BETS : COIN_BETS;

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="flex gap-2">
        {[['dice', '🎲 骰子'], ['coin', '🪙 硬幣']].map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setBet(null); }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors
              ${mode === m ? 'bg-electric-700 text-white' : 'bg-ink-800 text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {bets.map(b => (
          <button key={b.id} onClick={() => setBet(b.id)}
            className={`rounded-lg py-2.5 text-sm font-semibold border transition-all
              ${bet === b.id ? 'bg-electric-600 border-electric-400 text-white shadow-glow-sm'
                : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <CommitRevealFlow cr={cr} title="骰子 / 猜硬幣" revealLabel="開獎" betSlot={betSlot} canCommit={!!bet}>
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.win ? '猜中了！' : '沒猜中'} sub={`開出 ${outcome.faceText}`} />
          <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-10 text-center">
            <div className="text-7xl mb-2">{outcome.faceText.split(' ')[0]}</div>
            <div className="text-gray-400 text-sm">你押：{(mode === 'dice' ? DICE_BETS : COIN_BETS).find(b => b.id === bet)?.label}</div>
          </div>
          <CryptoProof finalRandom={cr.finalRandom} chainGameId={cr.chainGameId}
            commitTxHash={cr.commitTxHash} revealTxHash={cr.revealTxHash} />
          <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
        </div>
      )}
    </CommitRevealFlow>
  );
}
