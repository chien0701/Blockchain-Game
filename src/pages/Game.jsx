import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PlayingCard from '../components/PlayingCard';
import StepBar     from '../components/StepBar';
import { useWallet } from '../context/WalletContext';
import {
  generateSeed, generateSalt, commitHash, verifyCommit,
  combineSeeds, shortenHash, mockTxHash,
} from '../utils/crypto';
import {
  createDeck, calcScore, determineWinner,
} from '../utils/gameLogic';
import { saveGame } from '../utils/storage';
import {
  commitGame  as contractCommit,
  revealGame  as contractReveal,
  getTxUrl,
} from '../utils/contract';
import { IS_ON_CHAIN } from '../config/contractConfig';

/* ── 共用 UI ─────────────────────────────────────────────────────────────── */

function HashBox({ label, value, reveal }) {
  return (
    <div className="bg-ink-950 border border-gray-700 rounded-xl p-3 space-y-1">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      {reveal
        ? <div className="font-mono text-xs text-emerald-400 break-all">{value}</div>
        : <div className="font-mono text-xs text-gray-600">{'█'.repeat(32)} (隱藏)</div>
      }
    </div>
  );
}

function CheckRow({ label, ok }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✅' : '❌'}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

function Loader({ text, txUrl }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="dot w-3 h-3 bg-electric-500 rounded-full" />
        ))}
      </div>
      <p className="text-gray-400 text-sm">{text}</p>
      {txUrl && (
        <a href={txUrl} target="_blank" rel="noreferrer"
           className="text-xs text-electric-400 underline hover:text-electric-300">
          在 Arbiscan 查看交易 ↗
        </a>
      )}
    </div>
  );
}

/** 錯誤提示框 */
function ErrorBox({ message, onDismiss }) {
  return (
    <div className="bg-red-950/60 border border-red-700 rounded-xl p-4
                    flex items-start gap-3 animate-fade-in-up">
      <span className="text-xl mt-0.5">⚠️</span>
      <div className="flex-1">
        <p className="text-red-300 text-sm leading-relaxed">{message}</p>
      </div>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-300 text-lg leading-none">✕</button>
    </div>
  );
}

/** 鏈上交易資訊列 */
function TxRow({ label, txHash, txUrl }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono text-gray-400 flex items-center gap-1.5">
        {shortenHash(txHash, 8)}
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noreferrer"
             className="text-electric-400 hover:text-electric-300">↗</a>
        )}
      </span>
    </div>
  );
}

/* ── Phase 元件（定義在模組頂層，避免每次 render 重新掛載）─────────────────── */

function CommitPhase({ playerSeed, playerCommit, dealerSeed, dealerCommit,
                       isOnChain, isMock, isWrongNetwork, onCommit }) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">承諾階段</h2>
        <p className="text-gray-400 mt-1 text-sm">
          雙方種子的雜湊值將被永久寫入區塊鏈，任何人都無法在事後偷換
        </p>
      </div>

      {/* 模式提示 */}
      {isOnChain && !isMock ? (
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800
                        rounded-xl px-4 py-2.5 text-sm text-emerald-300">
          <span>⛓️</span>
          <span>真實上鏈模式 — 交易將送至 Arbitrum Sepolia</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800
                        rounded-xl px-4 py-2.5 text-sm text-amber-300">
          <span>🎭</span>
          <span>{isMock ? '模擬模式（無 MetaMask）— 模擬區塊鏈操作' : '模擬模式（未設定合約地址）— 在 .env 填入 VITE_CONTRACT_ADDRESS 可啟用真實上鏈'}</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* 玩家 */}
        <div className="bg-ink-850 border border-electric-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧑</span>
            <span className="font-bold text-white">玩家（你）</span>
            <span className="ml-auto text-xs bg-electric-950 border border-electric-700
                             text-electric-300 rounded-full px-2 py-0.5">你的角色</span>
          </div>
          <HashBox label="明文種子（保密）" value={playerSeed} reveal={true} />
          <HashBox label="承諾 Commit = keccak256(seed‖salt)" value={playerCommit} reveal={true} />
          <p className="text-xs text-gray-600">✦ 種子由你的瀏覽器隨機生成，莊家完全看不到</p>
        </div>

        {/* 莊家 */}
        <div className="bg-ink-850 border border-gray-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏦</span>
            <span className="font-bold text-white">莊家（系統）</span>
          </div>
          <HashBox label="明文種子（隱藏）" value={dealerSeed} reveal={false} />
          <HashBox label="承諾 Commit = keccak256(seed‖salt)" value={dealerCommit} reveal={true} />
          <p className="text-xs text-gray-600">✦ 莊家種子此時已鎖定，揭露前你無法得知其內容</p>
        </div>
      </div>

      <button
        onClick={onCommit}
        disabled={isWrongNetwork}
        className={`w-full font-bold rounded-2xl py-4 text-lg transition-all
          ${isWrongNetwork
            ? 'bg-ink-800 text-gray-500 cursor-not-allowed'
            : 'bg-electric-600 hover:bg-electric-500 text-white hover:scale-[1.02] shadow-lg shadow-electric-950'}`}
      >
        {isWrongNetwork ? '⚠️ 請先切換至正確網路' : '🔒 提交承諾至區塊鏈'}
      </button>
    </div>
  );
}

function RevealPhase({ playerSeed, playerSalt, playerCommit, dealerSeed, dealerSalt, dealerCommit,
                       commitTxHash, chainGameId, isOnChain, isMock, onReveal }) {
  const p_ok = verifyCommit(playerSeed, playerSalt, playerCommit);
  const d_ok = verifyCommit(dealerSeed, dealerSalt, dealerCommit);
  const commitTxUrl = getTxUrl(commitTxHash);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">揭露階段</h2>
        <p className="text-gray-400 mt-1 text-sm">
          雙方公開明文種子，系統自動驗證與鏈上承諾是否一致
        </p>
      </div>

      {/* Commit 交易資訊 */}
      {isOnChain && !isMock && chainGameId && (
        <div className="bg-ink-850 border border-gray-700 rounded-xl p-4
                        font-mono text-xs space-y-2">
          <div className="text-gray-500 mb-1">✅ 承諾已上鏈</div>
          <TxRow label="Commit TX"  txHash={commitTxHash} txUrl={commitTxUrl} />
          <div className="flex items-center justify-between">
            <span className="text-gray-600">鏈上 Game ID</span>
            <span className="text-electric-400">#{chainGameId}</span>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-ink-850 border border-emerald-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧑</span>
            <span className="font-bold text-white">玩家</span>
            <span className="ml-auto text-xs text-emerald-400">✅ 已揭露</span>
          </div>
          <HashBox label="明文種子 seed" value={playerSeed} reveal={true} />
          <HashBox label="明文 salt" value={playerSalt} reveal={true} />
          <CheckRow
            label={`keccak256(seed‖salt) === 承諾 → ${p_ok ? '吻合' : '不吻合'}`}
            ok={p_ok}
          />
        </div>

        <div className="bg-ink-850 border border-emerald-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏦</span>
            <span className="font-bold text-white">莊家</span>
            <span className="ml-auto text-xs text-emerald-400">✅ 已揭露</span>
          </div>
          <HashBox label="明文種子 seed（現在公開）" value={dealerSeed} reveal={true} />
          <HashBox label="明文 salt（現在公開）" value={dealerSalt} reveal={true} />
          <CheckRow
            label={`keccak256(seed‖salt) === 承諾 → ${d_ok ? '吻合' : '不吻合'}`}
            ok={d_ok}
          />
        </div>
      </div>

      <div className="bg-electric-950/40 border border-electric-800 rounded-2xl p-5 space-y-3">
        <div className="text-sm font-bold text-electric-300">🎲 最終隨機數計算方式</div>
        <div className="font-mono text-xs text-gray-400 space-y-1">
          <div>
            final_random = <span className="text-electric-400">keccak256</span>(
            playerSeed <span className="text-gray-600">||</span> dealerSeed
            )
          </div>
          <div className="text-gray-600">— 任何一方都無法單獨控制此結果</div>
          <div className="text-gray-600">— 合約將在鏈上驗證並永久記錄</div>
        </div>
      </div>

      <button
        onClick={onReveal}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold
                   rounded-2xl py-4 text-lg transition-all hover:scale-[1.02]
                   shadow-lg shadow-emerald-950"
      >
        🎴 {isOnChain && !isMock ? '揭露種子並上鏈發牌' : '發牌並開始遊戲'}
      </button>
    </div>
  );
}

function PlayPhase({ playerHand, dealerHand, onHit, onStand }) {
  const ps        = calcScore(playerHand);
  const dsVisible = calcScore([dealerHand[0]]);
  const isBust    = ps > 21;
  const is21      = ps === 21;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">遊戲進行中</h2>
        <p className="text-gray-400 mt-1 text-sm">目標：點數盡量接近 21，但不能超過</p>
      </div>

      <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-6 space-y-6">
        <div className="text-center text-xs text-emerald-700 tracking-widest uppercase font-bold">
          ── 牌桌 ──
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-medium">🏦 莊家</span>
            <span className="text-gray-500 text-xs">明牌 {dsVisible} 點（一張隱藏）</span>
          </div>
          <div className="flex gap-3">
            <PlayingCard suit={dealerHand[0].suit} value={dealerHand[0].value} size="lg" delay={0} />
            <PlayingCard hidden size="lg" delay={1} />
          </div>
        </div>

        <div className="border-t border-emerald-900" />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-medium">🧑 你</span>
            <span className={`font-bold text-lg transition-colors
              ${isBust ? 'text-red-400' : is21 ? 'text-yellow-400' : 'text-white'}`}>
              {ps} 點{isBust ? ' 💥 爆牌' : is21 ? ' 🎯 21點！' : ''}
            </span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {playerHand.map((card, i) => (
              <PlayingCard key={i} suit={card.suit} value={card.value} size="lg" delay={i} />
            ))}
          </div>
        </div>
      </div>

      {is21 && (
        <div className="text-center text-yellow-400 text-sm animate-fade-in-up font-medium">
          🎯 已達 21 點！建議直接停牌
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onHit}
          disabled={ps >= 21}
          className={`py-4 text-lg font-bold rounded-2xl transition-all
            ${ps >= 21
              ? 'bg-ink-800 text-gray-600 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] shadow-lg shadow-emerald-950'}`}
        >
          ➕ 補牌 (Hit)
        </button>
        <button
          onClick={onStand}
          className="py-4 text-lg font-bold rounded-2xl bg-amber-600 hover:bg-amber-500
                     text-white hover:scale-[1.02] transition-all shadow-lg shadow-amber-950"
        >
          ✋ 停牌 (Stand)
        </button>
      </div>

      <div className="text-center text-xs text-gray-600">莊家規則：點數低於 17 時必須補牌</div>
    </div>
  );
}

function ResultPhase({ playerHand, dealerHand, result, finalRandom, gameId,
                       chainGameId, commitTxHash, revealTxHash,
                       isOnChain, isMock, onPlayAgain }) {
  const ps          = calcScore(playerHand);
  const ds          = calcScore(dealerHand);
  const isPlayerWin = result?.winner === 'player';
  const isDraw      = result?.winner === 'draw';
  const commitUrl   = getTxUrl(commitTxHash);
  const revealUrl   = getTxUrl(revealTxHash);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 勝負橫幅 */}
      <div className={`rounded-2xl border p-5 text-center
        ${isPlayerWin           ? 'bg-emerald-950/50 border-emerald-700' : ''}
        ${isDraw                ? 'bg-ink-800/50 border-gray-700'       : ''}
        ${!isPlayerWin && !isDraw ? 'bg-red-950/50 border-red-800'       : ''}`}>
        <div className="text-5xl mb-3">{isPlayerWin ? '🏆' : isDraw ? '🤝' : '😞'}</div>
        <div className="text-2xl font-extrabold text-white">
          {isPlayerWin ? '玩家獲勝！' : isDraw ? '平手' : '莊家獲勝'}
        </div>
        <div className={`text-sm mt-1
          ${isPlayerWin ? 'text-emerald-400' : isDraw ? 'text-gray-400' : 'text-red-400'}`}>
          {result?.reason}
        </div>
      </div>

      {/* 牌桌 */}
      <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-6 space-y-6">
        <div className="text-center text-xs text-emerald-700 tracking-widest uppercase font-bold">
          ── 最終牌面 ──
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-medium">🏦 莊家</span>
            <span className={`font-bold ${ds > 21 ? 'text-red-400' : 'text-white'}`}>
              {ds} 點{ds > 21 ? ' 💥爆牌' : ''}
            </span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {dealerHand.map((card, i) => (
              <PlayingCard key={i} suit={card.suit} value={card.value} size="lg" delay={i} />
            ))}
          </div>
        </div>
        <div className="border-t border-emerald-900" />
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-medium">🧑 玩家</span>
            <span className={`font-bold ${ps > 21 ? 'text-red-400' : 'text-white'}`}>
              {ps} 點{ps > 21 ? ' 💥爆牌' : ''}
            </span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {playerHand.map((card, i) => (
              <PlayingCard key={i} suit={card.suit} value={card.value} size="lg" delay={i} />
            ))}
          </div>
        </div>
      </div>

      {/* 密碼學證明 */}
      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <div className="text-sm font-bold text-gray-300">🔐 密碼學證明</div>
        <div className="font-mono text-xs space-y-2 break-all">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">最終隨機數</span>
            <span className="text-electric-400">{shortenHash(finalRandom, 10)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">前端 Game ID</span>
            <span className="text-gray-400 text-right max-w-[180px] truncate">{gameId}</span>
          </div>
          {isOnChain && !isMock && chainGameId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">鏈上 Game ID</span>
              <span className="text-emerald-400">#{chainGameId}</span>
            </div>
          )}
          {commitTxHash && (
            <TxRow label="Commit TX" txHash={commitTxHash} txUrl={commitUrl} />
          )}
          {revealTxHash && (
            <TxRow label="Reveal TX" txHash={revealTxHash} txUrl={revealUrl} />
          )}
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Link
          to={`/verifier?id=${gameId}`}
          className="flex items-center justify-center gap-2 bg-electric-950 hover:bg-electric-900
                     border border-electric-700 text-electric-300 rounded-2xl py-3.5
                     font-semibold transition-colors"
        >
          🔍 驗證公平性
        </Link>
        <button
          onClick={onPlayAgain}
          className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl py-3.5
                     font-semibold transition-colors"
        >
          🔄 再玩一局
        </button>
        <Link
          to="/lobby"
          className="flex items-center justify-center bg-ink-800 hover:bg-gray-700
                     text-white rounded-2xl py-3.5 font-semibold transition-colors"
        >
          🏠 返回大廳
        </Link>
      </div>
    </div>
  );
}

/* ── 錯誤訊息轉換（MetaMask 錯誤碼 → 中文）──────────────────────────────────── */

function parseError(err) {
  const msg = err?.message || '';
  if (err?.code === 4001 || msg.includes('user rejected'))
    return '你取消了交易，請重試。';
  if (msg.includes('insufficient funds'))
    return '錢包餘額不足以支付 Gas 費用，請先領取測試幣。';
  if (msg.includes('network') || msg.includes('could not detect'))
    return '網路連線異常，請確認 MetaMask 已連上 Arbitrum Sepolia。';
  if (msg.includes('InvalidPlayerHash'))
    return '玩家種子 Hash 驗證失敗（前端與合約計算不一致）。';
  if (msg.includes('InvalidDealerHash'))
    return '莊家種子 Hash 驗證失敗（前端與合約計算不一致）。';
  if (msg.includes('AlreadyRevealed'))
    return '這局遊戲已經揭露過了。';
  if (msg.includes('VITE_CONTRACT_ADDRESS'))
    return '尚未設定合約地址，請在 .env 填入 VITE_CONTRACT_ADDRESS。';
  return `交易失敗：${msg.slice(0, 120)}`;
}

/* ── 主元件 ──────────────────────────────────────────────────────────────── */

export default function Game() {
  const { id: roomId } = useParams();
  const navigate       = useNavigate();
  const { getSigner, isMock, isWrongNetwork } = useWallet();

  // 種子與 salt（惰性初始化，永不重新生成）
  const [playerSeed] = useState(() => generateSeed());
  const [dealerSeed] = useState(() => generateSeed());
  const [playerSalt] = useState(() => generateSalt());
  const [dealerSalt] = useState(() => generateSalt());
  const playerCommit = commitHash(playerSeed, playerSalt);
  const dealerCommit = commitHash(dealerSeed, dealerSalt);

  // 遊戲流程狀態
  const [phase,   setPhase]   = useState('commit');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadUrl, setLoadUrl] = useState('');   // 顯示在 Loader 的 TX 連結
  const [error,   setError]   = useState('');

  // 識別碼
  const [gameId]      = useState(() => roomId || `game_${Date.now()}`);
  const [chainGameId, setChainGameId] = useState('');    // 鏈上 uint256 ID

  // 交易雜湊
  const [commitTxHash, setCommitTxHash] = useState('');
  const [revealTxHash, setRevealTxHash] = useState('');

  // 遊戲資料
  const [finalRandom, setFinalRandom] = useState('');
  const [deck,        setDeck]        = useState([]);
  const [playerHand,  setPlayerHand]  = useState([]);
  const [dealerHand,  setDealerHand]  = useState([]);
  const [result,      setResult]      = useState(null);

  /* ── Commit ──────────────────────────────────────────────────────────────── */
  const handleCommit = async () => {
    setError('');
    setLoading(true);

    try {
      if (IS_ON_CHAIN && !isMock) {
        // ── 真實上鏈 ──────────────────────────────────────────────────────────
        setLoadMsg('📡 等待 MetaMask 簽署交易…');
        setLoadUrl('');

        const signer = await getSigner();
        const { chainGameId: cid, txHash } = await contractCommit(
          signer, playerCommit, dealerCommit
        );

        setLoadMsg('⏳ 等待區塊確認…');
        setLoadUrl(getTxUrl(txHash));

        setChainGameId(cid);
        setCommitTxHash(txHash);
      } else {
        // ── 模擬模式 ──────────────────────────────────────────────────────────
        setLoadMsg('🎭 模擬寫入區塊鏈…');
        await new Promise(r => setTimeout(r, 1400));
        setCommitTxHash(mockTxHash());
      }

      setPhase('reveal');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
      setLoadUrl('');
    }
  };

  /* ── Reveal ──────────────────────────────────────────────────────────────── */
  const handleReveal = async () => {
    setError('');
    setLoading(true);

    try {
      let combined;

      if (IS_ON_CHAIN && !isMock) {
        // ── 真實上鏈 ──────────────────────────────────────────────────────────
        setLoadMsg('📡 等待 MetaMask 簽署揭露交易…');
        setLoadUrl('');

        const signer = await getSigner();
        const { finalRandom: fr, txHash } = await contractReveal(
          signer, chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt
        );

        setLoadMsg('⏳ 等待區塊確認…');
        setLoadUrl(getTxUrl(txHash));

        setRevealTxHash(txHash);
        combined = fr;   // 直接使用合約回傳的 finalRandom
      } else {
        // ── 模擬模式 ──────────────────────────────────────────────────────────
        setLoadMsg('🎭 驗證雜湊值並計算最終隨機數…');
        await new Promise(r => setTimeout(r, 1400));
        combined = combineSeeds(playerSeed, dealerSeed);
        setRevealTxHash(mockTxHash());
      }

      setFinalRandom(combined);

      // 發牌（前端用 finalRandom 確定性洗牌）
      const fullDeck = createDeck(combined);
      setPlayerHand([fullDeck[0], fullDeck[2]]);
      setDealerHand([fullDeck[1], fullDeck[3]]);
      setDeck(fullDeck.slice(4));
      setPhase('play');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
      setLoadUrl('');
    }
  };

  /* ── 遊戲邏輯 ────────────────────────────────────────────────────────────── */
  const finishGame = (ph, dh, combined) => {
    const res = determineWinner(ph, dh);
    setResult(res);
    setPhase('result');
    saveGame({
      gameId, chainGameId, gameType: 'blackjack',
      playerSeed, playerSalt, dealerSeed, dealerSalt,
      playerCommit, dealerCommit,
      finalRandom: combined, playerHand: ph, dealerHand: dh,
      result: res,
      commitTxHash, revealTxHash,
      timestamp: new Date().toISOString(),
    });
  };

  const handleHit = () => {
    const [card, ...rest] = deck;
    const newHand = [...playerHand, card];
    setPlayerHand(newHand);
    setDeck(rest);
    if (calcScore(newHand) > 21) finishGame(newHand, dealerHand, finalRandom);
  };

  const handleStand = () => {
    let dHand = [...dealerHand];
    let remaining = [...deck];
    while (calcScore(dHand) < 17 && remaining.length > 0) {
      dHand     = [...dHand, remaining[0]];
      remaining = remaining.slice(1);
    }
    setDealerHand(dHand);
    finishGame(playerHand, dHand, finalRandom);
  };

  const handlePlayAgain = () => navigate('/lobby');

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepBar currentPhase={phase} />

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-6">
          <ErrorBox message={error} onDismiss={() => setError('')} />
        </div>
      )}

      {loading ? (
        <Loader text={loadMsg} txUrl={loadUrl} />
      ) : phase === 'commit' ? (
        <CommitPhase
          playerSeed={playerSeed} playerCommit={playerCommit}
          dealerSeed={dealerSeed} dealerCommit={dealerCommit}
          isOnChain={IS_ON_CHAIN} isMock={isMock}
          isWrongNetwork={isWrongNetwork}
          onCommit={handleCommit}
        />
      ) : phase === 'reveal' ? (
        <RevealPhase
          playerSeed={playerSeed} playerSalt={playerSalt} playerCommit={playerCommit}
          dealerSeed={dealerSeed} dealerSalt={dealerSalt} dealerCommit={dealerCommit}
          commitTxHash={commitTxHash} chainGameId={chainGameId}
          isOnChain={IS_ON_CHAIN} isMock={isMock}
          onReveal={handleReveal}
        />
      ) : phase === 'play' ? (
        <PlayPhase
          playerHand={playerHand} dealerHand={dealerHand}
          onHit={handleHit} onStand={handleStand}
        />
      ) : (
        <ResultPhase
          playerHand={playerHand} dealerHand={dealerHand}
          result={result} finalRandom={finalRandom}
          gameId={gameId} chainGameId={chainGameId}
          commitTxHash={commitTxHash} revealTxHash={revealTxHash}
          isOnChain={IS_ON_CHAIN} isMock={isMock}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
