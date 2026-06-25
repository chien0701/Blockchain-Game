import { useState, useRef } from 'react';
import StepBar from '../../components/StepBar';
import { ErrorBox } from '../../components/CommitRevealFlow';
import { ResultBanner, CryptoProof, ResultActions } from '../../components/GameResult';
import { useCommitReveal } from '../../hooks/useCommitReveal';
import { intFromHex } from '../../games/random';
import { shortenHash, newGameId } from '../../utils/crypto';
import { saveGame } from '../../utils/storage';

const COLORS = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];
const LEN = 4, MAX = 8;

function feedback(guess, secret) {
  let exact = 0;
  const gc = Array(6).fill(0), sc = Array(6).fill(0);
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === secret[i]) exact++;
    else { gc[guess[i]]++; sc[secret[i]]++; }
  }
  let partial = 0;
  for (let c = 0; c < 6; c++) partial += Math.min(gc[c], sc[c]);
  return { exact, partial };
}

export default function Mastermind() {
  const [round, setRound] = useState(0);
  return <MastermindRound key={round} onPlayAgain={() => setRound(r => r + 1)} />;
}

function MastermindRound({ onPlayAgain }) {
  const cr = useCommitReveal();
  const [gameId] = useState(() => newGameId());
  const secret = useRef(null);
  const [draft, setDraft]   = useState([]);
  const [guesses, setGuesses] = useState([]);
  const [status, setStatus]   = useState('playing'); // playing | won | lost
  const saved = useRef(false);

  const secretFromSeed = () =>
    Array.from({ length: LEN }, (_, i) => intFromHex(cr.dealerSeed, i, 1) % 6);

  const startPlay = async () => {
    await cr.commit();
    secret.current = secretFromSeed();
  };

  const addPeg = (c) => { if (draft.length < LEN) setDraft([...draft, c]); };
  const undo   = () => setDraft(draft.slice(0, -1));

  const submitGuess = async () => {
    if (draft.length !== LEN) return;
    const fb = feedback(draft, secret.current);
    const next = [...guesses, { pegs: draft, ...fb }];
    setGuesses(next);
    setDraft([]);

    if (fb.exact === LEN)      finish('won', next);
    else if (next.length >= MAX) finish('lost', next);
  };

  const finish = async (result, allGuesses) => {
    setStatus(result);
    await cr.reveal();
    if (saved.current) return;
    saved.current = true;
    saveGame({
      gameId, gameType: 'mastermind', chainGameId: cr.chainGameId,
      playerSeed: cr.playerSeed, playerSalt: cr.playerSalt,
      dealerSeed: cr.dealerSeed, dealerSalt: cr.dealerSalt,
      playerCommit: cr.playerCommit, dealerCommit: cr.dealerCommit,
      finalRandom: cr.finalRandom,
      result: { winner: result === 'won' ? 'player' : 'dealer', reason: `${allGuesses.length} 次猜測` },
      commitTxHash: cr.commitTxHash, revealTxHash: cr.revealTxHash,
      timestamp: new Date().toISOString(),
    });
  };

  const stepPhase = cr.phase === 'commit' ? 'commit' : status === 'playing' ? 'reveal' : 'result';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepBar currentPhase={stepPhase} />
      <ErrorBox message={cr.error} onDismiss={cr.dismissError} />

      {/* Commit 階段 */}
      {cr.phase === 'commit' && !cr.loading && (
        <div className="space-y-6 animate-fade-in-up text-center">
          <h2 className="text-2xl font-bold text-white">猜數字 Mastermind</h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
            莊家會從 6 種顏色中選出一組 4 色密碼，並把<strong className="text-white">承諾雜湊上鏈</strong>。
            你有 {MAX} 次猜測機會。遊戲結束後揭露，證明莊家全程沒有偷改答案。
          </p>
          <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5">
            <div className="mono-tag text-[9px] text-gray-600 uppercase mb-1">commit_D（密碼承諾，已鎖定）</div>
            <div className="font-mono text-xs text-electric-300 break-all">{shortenHash(cr.dealerCommit, 16)}</div>
          </div>
          <button onClick={startPlay} disabled={cr.isWrongNetwork}
            className="bg-electric-600 hover:bg-electric-500 text-white font-bold rounded-2xl px-8 py-3.5
                       transition-all hover:scale-105 shadow-glow-sm disabled:bg-ink-800 disabled:text-gray-500">
            🔒 鎖定密碼並開始
          </button>
        </div>
      )}

      {cr.loading && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="flex gap-2">{[0,1,2].map(i => <div key={i} className="dot w-3 h-3 bg-electric-500 rounded-full" />)}</div>
          <p className="text-gray-400 text-sm">{cr.loadMsg}</p>
        </div>
      )}

      {/* 猜測階段 */}
      {cr.phase !== 'commit' && status === 'playing' && !cr.loading && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">破解密碼</h2>
            <p className="text-gray-500 text-sm mt-1">剩餘 {MAX - guesses.length} 次 · ●正確位置 ○顏色對位置錯</p>
          </div>

          <div className="space-y-2">
            {guesses.map((g, i) => (
              <div key={i} className="flex items-center justify-between bg-ink-850 border border-electric-900/30 rounded-xl px-4 py-2">
                <div className="flex gap-2 text-2xl">{g.pegs.map((p, j) => <span key={j}>{COLORS[p]}</span>)}</div>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-emerald-400">{'●'.repeat(g.exact)}</span>
                  <span className="text-amber-400">{'○'.repeat(g.partial)}</span>
                  {g.exact === 0 && g.partial === 0 && <span className="text-gray-600">—</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 草稿 */}
          <div className="bg-ink-850 border border-electric-800 rounded-2xl p-4 space-y-3">
            <div className="flex justify-center gap-2 min-h-[44px]">
              {Array.from({ length: LEN }).map((_, i) => (
                <div key={i} className="w-11 h-11 rounded-full border-2 border-gray-700 flex items-center justify-center text-2xl">
                  {draft[i] !== undefined ? COLORS[draft[i]] : ''}
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-2">
              {COLORS.map((c, i) => (
                <button key={i} onClick={() => addPeg(i)}
                  className="text-3xl hover:scale-110 transition-transform">{c}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={undo} disabled={!draft.length}
                className="flex-1 bg-ink-800 hover:bg-ink-700 text-gray-300 rounded-xl py-2.5 font-semibold disabled:opacity-40">↩ 退一步</button>
              <button onClick={submitGuess} disabled={draft.length !== LEN}
                className="flex-1 bg-electric-600 hover:bg-electric-500 text-white rounded-xl py-2.5 font-semibold disabled:bg-ink-800 disabled:text-gray-500">確認猜測</button>
            </div>
          </div>
        </div>
      )}

      {/* 結果階段 */}
      {status !== 'playing' && cr.phase === 'ready' && (
        <div className="space-y-6 animate-fade-in-up">
          <ResultBanner win={status === 'won'} title={status === 'won' ? '破解成功！' : '挑戰失敗'}
            sub={status === 'won' ? `用了 ${guesses.length} 次` : '次數用盡'} />
          <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5 text-center space-y-2">
            <div className="mono-tag text-[10px] text-gray-600 uppercase">揭露的密碼（由 seed_D 推導）</div>
            <div className="flex justify-center gap-2 text-3xl">{secret.current.map((p, i) => <span key={i}>{COLORS[p]}</span>)}</div>
            <div className="text-xs text-emerald-400">✅ seed_D 與承諾 commit_D 吻合 → 莊家未中途改密碼</div>
          </div>
          <CryptoProof finalRandom={cr.finalRandom} chainGameId={cr.chainGameId}
            commitTxHash={cr.commitTxHash} revealTxHash={cr.revealTxHash} />
          <ResultActions gameId={gameId} onPlayAgain={onPlayAgain} />
        </div>
      )}
    </div>
  );
}
