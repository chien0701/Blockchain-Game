import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import PlayingCard from '../components/PlayingCard';
import {
  commitHash, verifyCommit, combineSeeds, shortenHash,
} from '../utils/crypto';
import {
  dealCards, calcScore, determineWinner,
} from '../utils/gameLogic';
import { loadGame, recentGames } from '../utils/storage';
import {
  getReadOnlyProvider, getGameData, getContractUrl, GameState,
} from '../utils/contract';
import { IS_ON_CHAIN, CURRENT_CHAIN } from '../config/contractConfig';

/* ── 共用 ─────────────────────────────────────────────────────── */

function CheckRow({ label, expected, got, ok }) {
  return (
    <div className={`rounded-xl border p-3 space-y-1
      ${ok ? 'border-emerald-800 bg-emerald-950/30' : 'border-red-800 bg-red-950/30'}`}>
      <div className="flex items-center gap-2">
        <span>{ok ? '✅' : '❌'}</span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      {!ok && (
        <div className="text-xs font-mono text-red-400 space-y-0.5 pl-6 break-all">
          <div>期望: {expected}</div>
          <div>實際: {got}</div>
        </div>
      )}
    </div>
  );
}

function Verdict({ passed, okText, failText }) {
  return (
    <div className={`rounded-2xl border p-5 text-center
      ${passed ? 'bg-emerald-950/50 border-emerald-700' : 'bg-red-950/50 border-red-800'}`}>
      <div className="text-4xl mb-2">{passed ? '✅' : '🚨'}</div>
      <div className="text-xl font-extrabold text-white">
        {passed ? '驗證通過' : '檢測到異常！'}
      </div>
      <div className={`text-sm mt-1 ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
        {passed ? okText : failText}
      </div>
    </div>
  );
}

function RecalcHands({ finalRandom }) {
  const { playerHand: ph, dealerHand: dh } = dealCards(finalRandom);
  return (
    <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-4">
      <div className="text-sm font-bold text-gray-300">🃏 由 finalRandom 重算的牌面</div>
      <p className="text-xs text-gray-600">任何人用相同的 finalRandom 都會得到完全相同的牌</p>
      {[['玩家', ph], ['莊家', dh]].map(([who, hand]) => (
        <div key={who} className="space-y-2">
          <div className="text-xs text-gray-500">{who} — {calcScore(hand)} 點</div>
          <div className="flex gap-2 flex-wrap">
            {hand.map((c, i) => <PlayingCard key={i} suit={c.suit} value={c.value} size="md" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 主元件 ────────────────────────────────────────────────────── */

export default function Verifier() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState('local');   // 'local' | 'chain'

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">🔍 遊戲驗證工具</h1>
        <p className="text-gray-400 mt-2">
          重新計算密碼學參數，確認結果是否被篡改
        </p>
      </div>

      {/* 模式切換 */}
      <div className="flex gap-2 bg-ink-850 border border-electric-900/30 rounded-2xl p-1.5">
        <button
          onClick={() => setMode('local')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors
            ${mode === 'local' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          💾 本地紀錄
        </button>
        <button
          onClick={() => setMode('chain')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors
            ${mode === 'chain' ? 'bg-electric-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          ⛓️ 鏈上驗證
        </button>
      </div>

      {mode === 'local'
        ? <LocalVerifier initialId={params.get('id') || ''} />
        : <ChainVerifier />}
    </div>
  );
}

/* ── 本地驗證（讀 localStorage）─────────────────────────────────── */

function LocalVerifier({ initialId }) {
  const [gameId, setGameId] = useState(initialId);
  const [game,   setGame]   = useState(null);
  const [checks, setChecks] = useState(null);
  const [error,  setError]  = useState('');
  const [recent] = useState(() => recentGames());

  useEffect(() => {
    if (initialId) runVerify(initialId);
  }, []);

  const runVerify = (id) => {
    setError(''); setChecks(null); setGame(null);

    const data = loadGame(id || gameId);
    if (!data) {
      setError('找不到該遊戲 ID，請確認是否有在本瀏覽器中玩過此局。');
      return;
    }
    if (!data.playerCommit) {
      setError('此局為挖礦（PoW）紀錄，採用 nonce 自驗證，不適用 Commit-Reveal 驗證流程。');
      return;
    }
    setGame(data);

    const pHashOk = verifyCommit(data.playerSeed, data.playerSalt, data.playerCommit);
    const dHashOk = verifyCommit(data.dealerSeed, data.dealerSalt, data.dealerCommit);
    const finalOk = combineSeeds(data.playerSeed, data.dealerSeed) === data.finalRandom;
    const { playerHand, dealerHand } = dealCards(data.finalRandom);
    const resultOk = determineWinner(playerHand, dealerHand).winner === data.result.winner;

    setChecks({ pHashOk, dHashOk, finalOk, resultOk });
  };

  const allPassed = checks && checks.pHashOk && checks.dHashOk && checks.finalOk && checks.resultOk;

  return (
    <div className="space-y-8">
      {/* 輸入 */}
      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <label className="text-sm text-gray-400 font-medium">前端遊戲 ID</label>
        <div className="flex gap-2">
          <input
            value={gameId}
            onChange={e => setGameId(e.target.value)}
            placeholder="game_1716... 或從下方選擇"
            className="flex-1 bg-ink-800 border border-gray-700 rounded-xl px-3 py-2
                       text-white placeholder-gray-600 font-mono text-sm outline-none
                       focus:border-electric-500"
          />
          <button
            onClick={() => runVerify(gameId)}
            className="bg-electric-600 hover:bg-electric-500 text-white rounded-xl
                       px-5 py-2 font-semibold transition-colors whitespace-nowrap"
          >
            驗證
          </button>
        </div>

        {recent.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-xs text-gray-600 uppercase tracking-wide">最近遊戲</div>
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 5).map(r => (
                <button
                  key={r.gameId}
                  onClick={() => { setGameId(r.gameId); runVerify(r.gameId); }}
                  className="text-xs font-mono bg-ink-800 hover:bg-gray-700
                             border border-gray-700 rounded-lg px-2 py-1
                             text-gray-400 hover:text-white transition-colors truncate max-w-xs"
                >
                  {r.gameId.slice(0, 30)}…
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          ⚠️ {error}
          <div className="mt-2 text-gray-500 text-xs">
            提示：先到 <Link to="/lobby" className="text-electric-400 underline">遊戲大廳</Link> 玩一局再回來驗證。
          </div>
        </div>
      )}

      {game && checks && (
        <div className="space-y-5 animate-fade-in-up">
          <Verdict
            passed={allPassed}
            okText="所有密碼學參數驗證通過，結果未被篡改"
            failText="部分驗證失敗，此局遊戲可能存在作弊行為"
          />

          <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-gray-300 mb-3">📋 遊戲參數</div>
            {[
              { label: '遊戲 ID',    value: game.gameId },
              { label: '時間戳',     value: new Date(game.timestamp).toLocaleString('zh-TW') },
              { label: '玩家種子',   value: shortenHash(game.playerSeed, 12) },
              { label: '玩家承諾',   value: shortenHash(game.playerCommit, 12) },
              { label: '莊家種子',   value: shortenHash(game.dealerSeed, 12) },
              { label: '莊家承諾',   value: shortenHash(game.dealerCommit, 12) },
              { label: '最終隨機數', value: shortenHash(game.finalRandom, 12) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start gap-4 text-sm">
                <span className="text-gray-500 shrink-0">{label}</span>
                <span className="font-mono text-gray-300 text-right break-all">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-300">🧮 驗證清單</div>
            <CheckRow label="玩家 keccak256(seed‖salt) 與承諾吻合" ok={checks.pHashOk}
              expected={game.playerCommit} got={commitHash(game.playerSeed, game.playerSalt)} />
            <CheckRow label="莊家 keccak256(seed‖salt) 與承諾吻合" ok={checks.dHashOk}
              expected={game.dealerCommit} got={commitHash(game.dealerSeed, game.dealerSalt)} />
            <CheckRow label="最終隨機數由雙方種子合併計算" ok={checks.finalOk}
              expected={game.finalRandom} got={combineSeeds(game.playerSeed, game.dealerSeed)} />
            <CheckRow label="遊戲結果與隨機數計算一致" ok={checks.resultOk}
              expected={game.result?.winner}
              got={determineWinner(dealCards(game.finalRandom).playerHand,
                                   dealCards(game.finalRandom).dealerHand).winner} />
          </div>

          <RecalcHands finalRandom={game.finalRandom} />
        </div>
      )}
    </div>
  );
}

/* ── 鏈上驗證（直接讀合約，permissionless）──────────────────────── */

function ChainVerifier() {
  const [chainId, setChainId] = useState('');
  const [data,    setData]    = useState(null);
  const [checks,  setChecks]  = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const runVerify = async () => {
    setError(''); setChecks(null); setData(null);

    if (!IS_ON_CHAIN) {
      setError('尚未設定合約地址。請在 .env 填入 VITE_CONTRACT_ADDRESS 並部署合約後再使用鏈上驗證。');
      return;
    }
    const id = chainId.trim();
    if (!id || isNaN(Number(id))) {
      setError('請輸入有效的鏈上 Game ID（數字，例如 1）。');
      return;
    }

    setLoading(true);
    try {
      const provider = getReadOnlyProvider();
      const g = await getGameData(provider, id);

      if (g.state === GameState.None) {
        setError(`鏈上找不到 Game #${id}（可能尚未 commit，或合約地址有誤）。`);
        return;
      }
      if (g.state !== GameState.Revealed) {
        setError(`Game #${id} 尚未揭露（目前狀態：已承諾），無法驗證隨機數。`);
        setData(g);
        return;
      }

      const pHashOk = verifyCommit(g.playerSeed, g.playerSalt, g.playerCommit);
      const dHashOk = verifyCommit(g.dealerSeed, g.dealerSalt, g.dealerCommit);
      const finalOk = combineSeeds(g.playerSeed, g.dealerSeed) === g.finalRandom;

      setData(g);
      setChecks({ pHashOk, dHashOk, finalOk });
    } catch (err) {
      setError(`讀取鏈上資料失敗：${(err?.message || '').slice(0, 120)}`);
    } finally {
      setLoading(false);
    }
  };

  const allPassed = checks && checks.pHashOk && checks.dHashOk && checks.finalOk;
  const contractUrl = getContractUrl();

  return (
    <div className="space-y-8">
      <div className="bg-electric-950/30 border border-electric-900 rounded-xl p-4 text-sm text-electric-300 flex items-start gap-2">
        <span>⛓️</span>
        <div>
          直接從 <strong>{CURRENT_CHAIN.name}</strong> 讀取合約資料驗證，
          <strong>不需錢包、不需信任本網站</strong>——任何人都能獨立重算。
          {contractUrl && (
            <> <a href={contractUrl} target="_blank" rel="noreferrer" className="underline">在區塊瀏覽器查看合約 ↗</a></>
          )}
        </div>
      </div>

      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <label className="text-sm text-gray-400 font-medium">鏈上 Game ID</label>
        <div className="flex gap-2">
          <input
            value={chainId}
            onChange={e => setChainId(e.target.value)}
            placeholder="例如 1"
            className="flex-1 bg-ink-800 border border-gray-700 rounded-xl px-3 py-2
                       text-white placeholder-gray-600 font-mono text-sm outline-none
                       focus:border-electric-500"
          />
          <button
            onClick={runVerify}
            disabled={loading}
            className="bg-electric-600 hover:bg-electric-500 disabled:bg-gray-700 text-white rounded-xl
                       px-5 py-2 font-semibold transition-colors whitespace-nowrap"
          >
            {loading ? '讀取中…' : '從鏈上驗證'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {data && checks && (
        <div className="space-y-5 animate-fade-in-up">
          <Verdict
            passed={allPassed}
            okText="鏈上承諾與隨機數驗證通過，未被竄改"
            failText="鏈上資料與重算結果不符"
          />

          <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-gray-300 mb-3">📋 鏈上資料</div>
            {[
              { label: '提交者',     value: shortenHash(data.player, 8) },
              { label: '玩家種子',   value: shortenHash(data.playerSeed, 12) },
              { label: '玩家承諾',   value: shortenHash(data.playerCommit, 12) },
              { label: '莊家種子',   value: shortenHash(data.dealerSeed, 12) },
              { label: '莊家承諾',   value: shortenHash(data.dealerCommit, 12) },
              { label: '最終隨機數', value: shortenHash(data.finalRandom, 12) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start gap-4 text-sm">
                <span className="text-gray-500 shrink-0">{label}</span>
                <span className="font-mono text-gray-300 text-right break-all">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-300">🧮 驗證清單</div>
            <CheckRow label="玩家承諾 = keccak256(seed‖salt)" ok={checks.pHashOk}
              expected={data.playerCommit} got={commitHash(data.playerSeed, data.playerSalt)} />
            <CheckRow label="莊家承諾 = keccak256(seed‖salt)" ok={checks.dHashOk}
              expected={data.dealerCommit} got={commitHash(data.dealerSeed, data.dealerSalt)} />
            <CheckRow label="finalRandom = keccak256(seedP‖seedD)" ok={checks.finalOk}
              expected={data.finalRandom} got={combineSeeds(data.playerSeed, data.dealerSeed)} />
          </div>

          <RecalcHands finalRandom={data.finalRandom} />
        </div>
      )}
    </div>
  );
}
