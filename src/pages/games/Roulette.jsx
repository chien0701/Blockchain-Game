import { useState, useEffect, useRef } from 'react';
import { useBetting } from '../../hooks/useBetting';
import CommitRevealFlow, { BetPanel, SettlementBanner } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { mapRange } from '../../games/random';
import { newGameId } from '../../utils/crypto';
import { saveGame, getPref, setPref } from '../../utils/storage';

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorOf = (n) => n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';

const BETS = [
  { id: 'red',   label: '紅', test: (n) => colorOf(n) === 'red' },
  { id: 'black', label: '黑', test: (n) => colorOf(n) === 'black' },
  { id: 'odd',   label: '單', test: (n) => n !== 0 && n % 2 === 1 },
  { id: 'even',  label: '雙', test: (n) => n !== 0 && n % 2 === 0 },
  { id: 'low',   label: '小 1-18',  test: (n) => n >= 1 && n <= 18 },
  { id: 'high',  label: '大 19-36', test: (n) => n >= 19 && n <= 36 },
];

export default function Roulette() {
  const [round, setRound] = useState(0);
  return <RouletteRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function RouletteRound({ onPlayAgain }) {
  const cr = useBetting();
  const last = getPref('bet_roulette', {});
  const [bet, setBet]       = useState(last.bet ?? null);
  const [num, setNum]       = useState(last.num ?? '');
  const [amount, setAmount] = useState(last.amount ?? '0.0005');
  const [gameId] = useState(() => newGameId());
  const [outcome, setOutcome] = useState(null);
  const saved = useRef(false);

  const isNumberBet = num !== '' && Number(num) >= 0 && Number(num) <= 36;
  const hasBet = bet !== null || isNumberBet;

  useEffect(() => {
    if (cr.phase !== 'ready' || !cr.finalRandom || saved.current) return;
    saved.current = true;

    const result = mapRange(cr.finalRandom, 0, 4, 37);
    let win, betLabel;
    if (isNumberBet) { win = Number(num) === result; betLabel = `號碼 ${num}（30倍）`; }
    else { const b = BETS.find(x => x.id === bet); win = b.test(result); betLabel = b.label; }

    const consistent = cr.settlement ? cr.settlement.outcome === result : null;
    setOutcome({ result, win, betLabel, color: colorOf(result), consistent });

    saveGame({
      gameId, gameType: 'roulette', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: win ? 'player' : 'dealer', reason: `輪盤開出 ${result}` },
      betAmount: cr.isBetting ? amount : null,
      payout: cr.settlement?.payoutEth ?? null,
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  }, [cr.phase]);

  const betSlot = (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {BETS.map(b => (
          <button key={b.id} onClick={() => { setBet(b.id); setNum(''); }}
            className={`rounded-lg py-2.5 text-sm font-semibold border transition-all
              ${bet === b.id ? 'bg-electric-600 border-electric-400 text-white shadow-glow-sm'
                : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">或押單一號碼（30倍）</span>
        <input type="number" min="0" max="36" value={num}
          onChange={e => { setNum(e.target.value); setBet(null); }}
          placeholder="0-36"
          className="w-24 bg-ink-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-electric-500" />
      </div>
      {cr.isBetting && (
        <BetPanel value={amount} onChange={setAmount}
          walletEth={cr.walletEth} poolEth={cr.poolEth}
          maxMultiplier={isNumberBet ? 30 : 2}
          payoutLabel={isNumberBet ? '30×' : '2×'} />
      )}
    </div>
  );

  const betParams = () => {
    setPref('bet_roulette', { bet, num, amount });
    return {
      gameType: 2,
      betType: isNumberBet ? 6 : BETS.findIndex(b => b.id === bet),
      param: isNumberBet ? Number(num) : 0,
      amountEth: amount,
    };
  };
  const crForFlow = {
    ...cr,
    commit:    () => cr.commit(betParams()),
    quickPlay: () => cr.quickPlay(betParams()),
  };

  const dotColor = { red: 'bg-red-600', black: 'bg-gray-900', green: 'bg-emerald-600' };

  return (
    <CommitRevealFlow cr={crForFlow} title="輪盤" revealLabel="轉動輪盤" betSlot={betSlot} canCommit={hasBet}>
      {outcome && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={outcome.win} title={outcome.win ? '中獎！' : '槓龜'} sub={`你押：${outcome.betLabel}`} />
          {cr.isBetting && <SettlementBanner settlement={cr.settlement} amountEth={amount} />}
          <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-10 flex flex-col items-center gap-3">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center text-5xl font-extrabold text-white
                            border-4 border-white/20 ${dotColor[outcome.color]}`}>
              {outcome.result}
            </div>
            <div className="mono-tag text-xs text-gray-400 uppercase">
              {outcome.color === 'red' ? '紅 RED' : outcome.color === 'black' ? '黑 BLACK' : '綠 ZERO'}
            </div>
            {outcome.consistent !== null && (
              <div className={`text-xs ${outcome.consistent ? 'text-emerald-400' : 'text-red-400'}`}>
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
