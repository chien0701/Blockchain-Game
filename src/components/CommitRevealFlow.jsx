import { useState } from 'react';
import StepBar from './StepBar';
import { shortenHash } from '../utils/crypto';
import { getTxUrl } from '../utils/contract';
import { getPref, setPref } from '../utils/storage';

function HashBox({ label, value, hidden }) {
  return (
    <div className="bg-ink-950 border border-gray-700 rounded-xl p-3 space-y-1">
      <div className="mono-tag text-[9px] text-gray-600 uppercase">{label}</div>
      {hidden
        ? <div className="font-mono text-xs text-gray-700">{'█'.repeat(24)} 隱藏</div>
        : <div className="font-mono text-xs text-electric-300 break-all">{shortenHash(value, 12)}</div>}
    </div>
  );
}

function Loader({ text, url }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="flex gap-2">{[0,1,2].map(i => <div key={i} className="dot w-3 h-3 bg-electric-500 rounded-full" />)}</div>
      <p className="text-gray-400 text-sm">{text}</p>
      {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs text-electric-400 underline">在區塊瀏覽器查看 ↗</a>}
    </div>
  );
}

const AMOUNTS = ['0.0001', '0.0005', '0.001'];

export function BetAmountPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-sm text-gray-500 shrink-0">💰 注金</span>
      <div className="flex gap-2 flex-1">
        {AMOUNTS.map((a) => (
          <button key={a} onClick={() => onChange(a)}
            className={`flex-1 rounded-lg py-2 text-xs font-mono font-semibold border transition-all
              ${value === a ? 'bg-electric-600 border-electric-400 text-white shadow-glow-sm'
                : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
            {a} ETH
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettlementBanner({ settlement, amountEth }) {
  if (!settlement) return null;
  return settlement.won ? (
    <div className="bg-emerald-950/50 border border-emerald-700 rounded-xl p-4 text-center">
      <span className="text-emerald-300 font-bold text-lg">
        💰 合約已賠付 {settlement.payoutEth} ETH 至你的錢包
      </span>
      <div className="text-xs text-emerald-500 mt-1">下注 {amountEth} ETH → 淨賺 {(Number(settlement.payoutEth) - Number(amountEth)).toFixed(4)} ETH</div>
    </div>
  ) : (
    <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-center">
      <span className="text-red-300 font-bold text-lg">💸 注金 {amountEth} ETH 已進入莊家資金池</span>
    </div>
  );
}

export function ErrorBox({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="mb-6 bg-red-950/60 border border-red-700 rounded-xl p-4 flex items-start gap-3 animate-fade-in-up">
      <span className="text-xl mt-0.5">⚠️</span>
      <p className="flex-1 text-red-300 text-sm leading-relaxed">{message}</p>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-300 text-lg leading-none">✕</button>
    </div>
  );
}

/**
 * 共用的 Commit + Reveal 流程 UI。
 * phase === 'ready' 時改渲染 children（交給各遊戲自己的玩法）。
 */
export default function CommitRevealFlow({ cr, title, revealLabel = '揭露並開始', betSlot, canCommit = true, children }) {
  const {
    phase, loading, loadMsg, loadUrl, error, dismissError,
    playerSeed, playerCommit, dealerSeed, dealerCommit,
    commitTxHash, chainGameId, onChain, isMock, isWrongNetwork,
    commit, reveal,
  } = cr;

  const [quick, setQuick] = useState(() => getPref('quickMode', true));
  const toggleQuick = (v) => { setQuick(v); setPref('quickMode', v); };
  const useQuick = quick && typeof cr.quickPlay === 'function';

  const stepPhase = phase === 'ready' ? 'play' : phase;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepBar currentPhase={stepPhase} />
      <ErrorBox message={error} onDismiss={dismissError} />

      {loading ? (
        <Loader text={loadMsg} url={loadUrl} />
      ) : phase === 'commit' ? (
        <div className="space-y-6 animate-fade-in-up">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{title} · 承諾階段</h2>
            <p className="text-gray-400 mt-1 text-sm">雙方種子承諾將被永久寫入區塊鏈，無法事後竄改</p>
          </div>

          {cr.isBetting
            ? <div className="bg-electric-950/50 border border-electric-700 rounded-xl px-4 py-2.5 text-sm text-electric-300">🎰 真實下注模式 — 注金將實際進出 FairBet 合約，贏了自動賠付</div>
            : onChain
            ? <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl px-4 py-2.5 text-sm text-emerald-300">⛓️ 真實上鏈模式</div>
            : <div className="bg-amber-950/40 border border-amber-800 rounded-xl px-4 py-2.5 text-sm text-amber-300">🎭 {isMock ? '模擬模式（無 MetaMask）' : '模擬模式（未設定合約地址）'}</div>}

          {betSlot}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-ink-850 border border-electric-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2"><span className="text-2xl">🧑</span><span className="font-bold text-white">玩家（你）</span></div>
              <HashBox label="seed_P（保密）" value={playerSeed} />
              <HashBox label="commit_P = keccak256(seed‖salt)" value={playerCommit} />
            </div>
            <div className="bg-ink-850 border border-gray-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2"><span className="text-2xl">🏦</span><span className="font-bold text-white">莊家（系統）</span></div>
              <HashBox label="seed_D（隱藏）" value={dealerSeed} hidden />
              <HashBox label="commit_D = keccak256(seed‖salt)" value={dealerCommit} />
            </div>
          </div>

          {typeof cr.quickPlay === 'function' && (
            <div className="flex justify-center gap-1 bg-ink-900 border border-electric-900/40 rounded-xl p-1 w-fit mx-auto">
              <button onClick={() => toggleQuick(true)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors
                  ${quick ? 'bg-electric-700 text-white' : 'text-gray-500 hover:text-white'}`}>
                ⚡ 快速
              </button>
              <button onClick={() => toggleQuick(false)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors
                  ${!quick ? 'bg-electric-700 text-white' : 'text-gray-500 hover:text-white'}`}>
                🔬 詳細（教學）
              </button>
            </div>
          )}

          <button onClick={useQuick ? cr.quickPlay : commit} disabled={isWrongNetwork || !canCommit}
            className={`w-full font-bold rounded-2xl py-4 text-lg transition-all
              ${isWrongNetwork || !canCommit ? 'bg-ink-800 text-gray-500 cursor-not-allowed'
                : 'bg-electric-600 hover:bg-electric-500 text-white hover:scale-[1.02] shadow-glow-sm hover:shadow-glow'}`}>
            {isWrongNetwork ? '⚠️ 請先切換至正確網路'
              : !canCommit ? '請先完成下注'
              : useQuick ? '⚡ 下注並直接開獎' : '🔒 提交承諾至區塊鏈'}
          </button>
        </div>
      ) : phase === 'reveal' ? (
        <div className="space-y-6 animate-fade-in-up">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{title} · 揭露階段</h2>
            <p className="text-gray-400 mt-1 text-sm">公開種子，合約驗證承諾並計算最終隨機數</p>
          </div>

          {onChain && chainGameId && (
            <div className="bg-ink-850 border border-gray-700 rounded-xl p-4 font-mono text-xs space-y-2">
              <div className="text-gray-500">✅ 承諾已上鏈</div>
              <div className="flex justify-between"><span className="text-gray-600">Commit TX</span>
                <a href={getTxUrl(commitTxHash)} target="_blank" rel="noreferrer" className="text-electric-400">{shortenHash(commitTxHash, 8)} ↗</a></div>
              <div className="flex justify-between"><span className="text-gray-600">鏈上 Game ID</span><span className="text-electric-400">#{chainGameId}</span></div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-ink-850 border border-emerald-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2"><span className="text-2xl">🧑</span><span className="font-bold text-white">玩家</span></div>
              <HashBox label="seed_P" value={playerSeed} />
            </div>
            <div className="bg-ink-850 border border-emerald-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2"><span className="text-2xl">🏦</span><span className="font-bold text-white">莊家（現在公開）</span></div>
              <HashBox label="seed_D" value={dealerSeed} />
            </div>
          </div>

          <button onClick={reveal}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl py-4 text-lg
                       transition-all hover:scale-[1.02] shadow-lg shadow-emerald-950">
            🎲 {revealLabel}
          </button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
