import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { shortenHash } from '../utils/crypto';
import { getTxUrl, getFinality, getReadOnlyProvider } from '../utils/contract';

export function ResultBanner({ win, draw, title, sub }) {
  return (
    <div className={`rounded-2xl border p-5 text-center
      ${win ? 'bg-emerald-950/50 border-emerald-700' : draw ? 'bg-ink-800/50 border-gray-700' : 'bg-red-950/50 border-red-800'}`}>
      <div className="text-5xl mb-3">{win ? '🏆' : draw ? '🤝' : '😞'}</div>
      <div className="text-2xl font-extrabold text-white">{title}</div>
      {sub && <div className={`text-sm mt-1 ${win ? 'text-emerald-400' : draw ? 'text-gray-400' : 'text-red-400'}`}>{sub}</div>}
    </div>
  );
}

export function SimulationNotice() {
  return (
    <div className="bg-amber-950/50 border border-amber-700 rounded-xl p-4 flex items-start gap-3">
      <span className="text-xl">🎭</span>
      <div className="text-sm text-amber-300 leading-relaxed">
        <strong>此局為模擬，未上鏈。</strong>
        密碼學流程與結果計算皆為真實邏輯，但交易 Hash 為模擬產生，
        鏈上查不到這一局，也沒有任何金流。要真實上鏈請連接 MetaMask 並切換至正確網路。
      </div>
    </div>
  );
}

export function FinalityBadge({ blockNumber }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!blockNumber) return;
    let alive = true, timer;
    const provider = getReadOnlyProvider();
    const tick = async () => {
      const f = await getFinality(provider, blockNumber);
      if (!alive) return;
      setState(f);
      if (!f?.finalized) timer = setTimeout(tick, 15000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [blockNumber]);
  if (!blockNumber) return null;
  if (!state) return <div className="text-xs text-gray-500">⏳ 區塊 #{blockNumber} 已確認，正在查詢最終性…</div>;
  return state.finalized
    ? <div className="text-xs text-emerald-400">✅ 區塊 #{blockNumber} 已最終確定，結果不會再因重組改變</div>
    : <div className="text-xs text-amber-300">⏳ 區塊 #{blockNumber} 已確認，尚未最終確定（目前最終確定至 #{state.finalizedBlock}，約需 13 分鐘）；在此之前若發生區塊重組，結算交易可能需要重新上鏈</div>;
}

export function CryptoProof({ finalRandom, chainGameId, commitTxHash, revealTxHash, settleBlock }) {
  const Row = ({ label, hash, link }) => (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono text-gray-400 flex items-center gap-1.5">
        {shortenHash(hash, 8)}
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-electric-400">↗</a>}
      </span>
    </div>
  );
  return (
    <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-2">
      <div className="text-sm font-bold text-gray-300 mb-1">🔐 密碼學證明</div>
      <div className="font-mono text-xs space-y-2 break-all">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">最終隨機數</span>
          <span className="text-electric-400">{shortenHash(finalRandom, 10)}</span>
        </div>
        {chainGameId && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">鏈上 Game ID</span><span className="text-emerald-400">#{chainGameId}</span>
          </div>
        )}
        {commitTxHash && <Row label="Commit TX" hash={commitTxHash} link={getTxUrl(commitTxHash)} />}
        {revealTxHash && <Row label="Reveal TX" hash={revealTxHash} link={getTxUrl(revealTxHash)} />}
      </div>
      {settleBlock && <FinalityBadge blockNumber={settleBlock} />}
    </div>
  );
}

export function ResultActions({ gameId, onPlayAgain }) {
  const navigate = useNavigate();
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <Link to={`/verifier?id=${gameId}`}
        className="flex items-center justify-center gap-2 bg-electric-950 hover:bg-electric-900
                   border border-electric-700 text-electric-300 rounded-2xl py-3.5 font-semibold transition-colors">
        🔍 驗證公平性
      </Link>
      <button onClick={onPlayAgain}
        className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl py-3.5 font-semibold transition-colors">
        🔄 再玩一局
      </button>
      <button onClick={() => navigate('/lobby')}
        className="bg-ink-800 hover:bg-ink-700 text-white rounded-2xl py-3.5 font-semibold transition-colors">
        🏠 返回大廳
      </button>
    </div>
  );
}
