import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import PlayingCard from '../components/PlayingCard';
import { commitHash, combineSeeds, shortenHash } from '../utils/crypto';
import { calcScore } from '../utils/gameLogic';
import { loadGame, recentGames } from '../utils/storage';
import {
  getReadOnlyProvider, getGameData, getContractUrl, getFairBetUrl, getBetV3, getBetV2, getBlockHash, GameState,
} from '../utils/contract';
import { verifyBetV3, verifyBetV2, verifyLocalRecord, check, verdictOf } from '../utils/verify';
import { describeOutcome, GAME_TYPE_NAMES } from '../games/random';
import { IS_ON_CHAIN, CURRENT_CHAIN, FAIRBET_DEPLOYMENTS } from '../config/contractConfig';

/* ── 共用 ─────────────────────────────────────────────────────── */

const STATUS_STYLE = {
  pass:        ['✅', 'border-emerald-800 bg-emerald-950/30'],
  fail:        ['❌', 'border-red-800 bg-red-950/30'],
  unavailable: ['⚪', 'border-amber-800 bg-amber-950/20'],
};

function CheckRow({ c }) {
  const [icon, cls] = STATUS_STYLE[c.status];
  return (
    <div className={`rounded-xl border p-3 space-y-1 ${cls}`}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-sm font-medium text-white">{c.label}</span>
      </div>
      {c.status === 'fail' && (
        <div className="text-xs font-mono text-red-400 space-y-0.5 pl-6 break-all">
          <div>紀錄值：{c.claimed}</div>
          <div>重算值：{c.recomputed}</div>
        </div>
      )}
      {c.status === 'unavailable' && <div className="text-xs text-amber-300 pl-6">未驗證：{c.reason}</div>}
    </div>
  );
}

const VERDICT = {
  verified:         ['✅', '驗證通過', '每一項證據都已取得並重算吻合', 'bg-emerald-950/50 border-emerald-700', 'text-emerald-400'],
  failed:           ['🚨', '檢測到異常', '至少一項紀錄與重算結果不符', 'bg-red-950/50 border-red-800', 'text-red-400'],
  incomplete:       ['⚪', '驗證未完成', '已取得的部分吻合，但缺少證據的項目沒有驗證，不能視為通過', 'bg-amber-950/40 border-amber-700', 'text-amber-300'],
  expired:          ['⌛', '此局已過期', '玩家未在期限內揭露，沒有開獎，注金留在資金池', 'bg-ink-800/60 border-gray-700', 'text-gray-400'],
  pending:          ['⏳', '尚未結算', '已下注但尚未揭露，目前沒有結果可驗證', 'bg-ink-800/60 border-gray-700', 'text-gray-400'],
  'not-found':      ['❔', '查無此局', '請確認版本、合約地址與編號', 'bg-ink-800/60 border-gray-700', 'text-gray-400'],
  'not-applicable': ['ℹ️', '不適用', '此紀錄不使用承諾協議', 'bg-ink-800/60 border-gray-700', 'text-gray-400'],
};

function Verdict({ verdict, note }) {
  const [icon, title, text, cls, sub] = VERDICT[verdict];
  return (
    <div className={`rounded-2xl border p-5 text-center ${cls}`}>
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-xl font-extrabold text-white">{title}</div>
      <div className={`text-sm mt-1 ${sub}`}>{note || text}</div>
    </div>
  );
}

function DataTable({ title, rows }) {
  return (
    <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
      <div className="text-sm font-bold text-gray-300 mb-3">{title}</div>
      {rows.filter(Boolean).map(({ label, value }) => (
        <div key={label} className="flex justify-between items-start gap-4 text-sm">
          <span className="text-gray-500 shrink-0">{label}</span>
          <span className="font-mono text-gray-300 text-right break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Checks({ checks }) {
  if (!checks.length) return null;
  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-gray-300">🧮 驗證清單</div>
      {checks.map((c) => <CheckRow key={c.id} c={c} />)}
    </div>
  );
}

function Hands({ title, playerHand, dealerHand }) {
  return (
    <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-4">
      <div className="text-sm font-bold text-gray-300">{title}</div>
      {[['玩家', playerHand], ['莊家', dealerHand]].map(([who, hand]) => (
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

const ErrorNote = ({ children }) => children
  ? <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-300 text-sm">⚠️ {children}</div>
  : null;

/* ── 主元件 ────────────────────────────────────────────────────── */

export default function Verifier() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('bet') ? 'bet' : 'local');

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">🔍 遊戲驗證工具</h1>
        <p className="text-gray-400 mt-2">重新計算密碼學參數，確認結果是否被篡改</p>
      </div>

      <div className="flex gap-1.5 bg-ink-850 border border-electric-900/30 rounded-2xl p-1.5">
        {[['local', '💾 本地紀錄'], ['chain', '⛓️ 鏈上・公平局'], ['bet', '🎰 鏈上・下注局']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors
              ${mode === m ? (m === 'local' ? 'bg-gray-700 text-white' : 'bg-electric-700 text-white') : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'local' ? <LocalVerifier initialId={params.get('id') || ''} />
        : mode === 'chain' ? <ChainVerifier />
        : <BetVerifier initialId={params.get('bet') || ''} initialAddress={params.get('contract') || ''} />}
    </div>
  );
}

/* ── 本地紀錄：依遊戲與協議版本分派重算 ───────────────────────────── */

function LocalVerifier({ initialId }) {
  const [gameId, setGameId] = useState(initialId);
  const [game,   setGame]   = useState(null);
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState('');
  const [recent] = useState(() => recentGames());

  useEffect(() => { if (initialId) runVerify(initialId); }, []);

  const runVerify = (id) => {
    setError(''); setResult(null); setGame(null);
    const data = loadGame(id || gameId);
    if (!data) { setError('找不到該遊戲 ID，請確認是否有在本瀏覽器中玩過此局。'); return; }
    const r = verifyLocalRecord(data);
    if (r.kind === 'pow') { setError('此局為挖礦（PoW）紀錄，採用 nonce 自驗證，不適用承諾協議驗證。'); return; }
    setGame(data); setResult(r);
  };

  const isFb3 = game?.protocol === 'fb3';
  const betLink = isFb3 && game.onChain && game.chainGameId
    ? `/verifier?bet=${game.chainGameId}&contract=${game.contract}` : null;

  return (
    <div className="space-y-8">
      <div className="bg-amber-950/30 border border-amber-900 rounded-xl p-3 text-xs text-amber-300 leading-relaxed">
        本地紀錄存在你的瀏覽器，可能被修改或清除，只能當作輔助。下注局請以「鏈上・下注局」的結果為準。
      </div>

      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <label className="text-sm text-gray-400 font-medium">前端遊戲 ID</label>
        <div className="flex gap-2">
          <input value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="game_1716... 或從下方選擇"
            className="flex-1 bg-ink-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 font-mono text-sm outline-none focus:border-electric-500" />
          <button onClick={() => runVerify(gameId)}
            className="bg-electric-600 hover:bg-electric-500 text-white rounded-xl px-5 py-2 font-semibold transition-colors whitespace-nowrap">
            驗證
          </button>
        </div>
        {recent.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-xs text-gray-600">最近遊戲</div>
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 5).map((r) => (
                <button key={r.gameId} onClick={() => { setGameId(r.gameId); runVerify(r.gameId); }}
                  className="text-xs font-mono bg-ink-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2 py-1 text-gray-400 hover:text-white transition-colors truncate max-w-xs">
                  {r.gameType} · {r.gameId.slice(5, 18)}…
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <ErrorNote>
          {error}
          <div className="mt-2 text-gray-500 text-xs">提示：先到 <Link to="/lobby" className="text-electric-400 underline">遊戲大廳</Link> 玩一局再回來驗證。</div>
        </ErrorNote>
      )}

      {game && result && (
        <div className="space-y-5 animate-fade-in-up">
          <Verdict verdict={result.verdict} />

          {betLink && (
            <Link to={betLink} className="block text-center bg-electric-950 hover:bg-electric-900 border border-electric-700 text-electric-300 rounded-2xl py-3 font-semibold">
              ⛓️ 到鏈上驗證 Bet #{game.chainGameId}（完整驗證）
            </Link>
          )}

          <DataTable title="📋 遊戲參數" rows={[
            { label: '遊戲',       value: game.gameType },
            { label: '協議',       value: isFb3 ? 'FairBet v3：keccak256(seed‖區塊雜湊)' : '舊版：雙種子（同一瀏覽器產生）' },
            { label: '時間',       value: new Date(game.timestamp).toLocaleString('zh-TW') },
            { label: '玩家種子',   value: shortenHash(game.playerSeed, 12) },
            { label: '玩家承諾',   value: shortenHash(game.playerCommit, 12) },
            isFb3 ? { label: '熵',      value: shortenHash(game.entropy, 12) } : { label: '莊家種子', value: shortenHash(game.dealerSeed, 12) },
            isFb3 && game.revealBlock ? { label: '開獎區塊', value: `#${game.revealBlock}` } : null,
            { label: '最終隨機數', value: shortenHash(game.finalRandom, 12) },
          ]} />

          <Checks checks={result.checks} />

          {result.kind === 'blackjack' && result.replay && (
            <Hands title="🃏 依亂數與玩家補牌次數重播的完整牌局" playerHand={result.replay.playerHand} dealerHand={result.replay.dealerHand} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── 鏈上公平局（GameCommitReveal：21 點、猜數字，無金流）─────────────── */

function ChainVerifier() {
  const [chainId, setChainId] = useState('');
  const [data,    setData]    = useState(null);
  const [checks,  setChecks]  = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const runVerify = async () => {
    setError(''); setChecks(null); setData(null);
    if (!IS_ON_CHAIN) { setError('尚未設定 GameCommitReveal 合約地址（VITE_CONTRACT_ADDRESS）。'); return; }
    const id = chainId.trim();
    if (!id || isNaN(Number(id))) { setError('請輸入有效的鏈上 Game ID（數字，例如 1）。'); return; }

    setLoading(true);
    try {
      const g = await getGameData(getReadOnlyProvider(), id);
      if (g.state === GameState.None) { setError(`鏈上找不到 Game #${id}。`); return; }
      setData(g);
      if (g.state !== GameState.Revealed) { setError(`Game #${id} 尚未揭露，無法驗證隨機數。`); return; }
      setChecks([
        check('commitP', '玩家承諾 = keccak256(seed‖salt)', g.playerCommit, commitHash(g.playerSeed, g.playerSalt)),
        check('commitD', '莊家承諾 = keccak256(seed‖salt)', g.dealerCommit, commitHash(g.dealerSeed, g.dealerSalt)),
        check('finalRandom', 'finalRandom = keccak256(seedP‖seedD)', g.finalRandom, combineSeeds(g.playerSeed, g.dealerSeed)),
      ]);
    } catch (err) {
      setError(`讀取鏈上資料失敗：${(err?.shortMessage || err?.message || '').slice(0, 120)}`);
    } finally {
      setLoading(false);
    }
  };

  const contractUrl = getContractUrl();

  return (
    <div className="space-y-8">
      <div className="bg-electric-950/30 border border-electric-900 rounded-xl p-4 text-sm text-electric-300 space-y-2">
        <div>
          ⛓️ 從 <strong>{CURRENT_CHAIN.name}</strong> 讀取 GameCommitReveal（21 點、猜數字），不需錢包。
          {contractUrl && <> <a href={contractUrl} target="_blank" rel="noreferrer" className="underline">查看合約 ↗</a></>}
        </div>
        <div className="text-xs text-amber-300">
          限制：這份合約只能證明「揭露的種子與承諾一致」。兩個種子都在玩家瀏覽器產生，
          無法證明來源獨立，玩家也能在行動前算出牌堆——它是公平性展示，不是防作弊機制。
          完整牌局重播需要補牌紀錄，請用「本地紀錄」驗證。
        </div>
      </div>

      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <label className="text-sm text-gray-400 font-medium">鏈上 Game ID</label>
        <div className="flex gap-2">
          <input value={chainId} onChange={(e) => setChainId(e.target.value)} placeholder="例如 1"
            className="flex-1 bg-ink-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 font-mono text-sm outline-none focus:border-electric-500" />
          <button onClick={runVerify} disabled={loading}
            className="bg-electric-600 hover:bg-electric-500 disabled:bg-gray-700 text-white rounded-xl px-5 py-2 font-semibold transition-colors whitespace-nowrap">
            {loading ? '讀取中…' : '從鏈上驗證'}
          </button>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {data && checks && (
        <div className="space-y-5 animate-fade-in-up">
          <Verdict verdict={verdictOf(checks)} note={verdictOf(checks) === 'verified' ? '揭露的種子與鏈上承諾一致（不代表種子來源獨立）' : undefined} />
          <DataTable title="📋 鏈上資料" rows={[
            { label: '提交者',     value: shortenHash(data.player, 8) },
            { label: '玩家種子',   value: shortenHash(data.playerSeed, 12) },
            { label: '玩家承諾',   value: shortenHash(data.playerCommit, 12) },
            { label: '莊家種子',   value: shortenHash(data.dealerSeed, 12) },
            { label: '莊家承諾',   value: shortenHash(data.dealerCommit, 12) },
            { label: '最終隨機數', value: shortenHash(data.finalRandom, 12) },
          ]} />
          <Checks checks={checks} />
        </div>
      )}
    </div>
  );
}

/* ── 鏈上下注局（FairBet v3／v2）─────────────────────────────────── */

function BetVerifier({ initialId, initialAddress }) {
  const initialDep = FAIRBET_DEPLOYMENTS.find((d) => d.address.toLowerCase() === initialAddress.toLowerCase())
    ?? FAIRBET_DEPLOYMENTS[0];
  const [version, setVersion] = useState(initialDep?.version ?? null);
  const [betId,   setBetId]   = useState(initialId);
  const [rpcUrl,  setRpcUrl]  = useState('');
  const [data,    setData]    = useState(null);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const dep = FAIRBET_DEPLOYMENTS.find((d) => d.version === version);

  useEffect(() => { if (initialId && dep) runVerify(); }, []);

  const runVerify = async () => {
    setError(''); setResult(null); setData(null);
    if (!dep) { setError('沒有可用的 FairBet 部署。'); return; }
    const id = betId.trim();
    if (!id || isNaN(Number(id))) { setError('請輸入有效的 Bet ID（數字，例如 1）。'); return; }

    setLoading(true);
    try {
      const provider = getReadOnlyProvider(rpcUrl.trim() || undefined);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== dep.chainId) {
        setError(`RPC 所在鏈（chainId ${net.chainId}）與合約部署鏈（${dep.chainId}）不同，已停止驗證。`);
        return;
      }
      if (dep.version === 3) {
        const b = await getBetV3(provider, id, dep.address);
        const blockHash = b.state === 2 ? await getBlockHash(provider, b.revealBlock).catch(() => null) : null;
        setData(b); setResult(verifyBetV3(b, blockHash));
      } else {
        const b = await getBetV2(provider, id);
        setData(b); setResult(verifyBetV2(b));
      }
    } catch (err) {
      setError(`讀取鏈上資料失敗：${(err?.shortMessage || err?.message || '').slice(0, 140)}`);
    } finally {
      setLoading(false);
    }
  };

  const explorer = dep ? getFairBetUrl(dep.address) : '';

  return (
    <div className="space-y-8">
      <div className="bg-electric-950/30 border border-electric-900 rounded-xl p-4 text-sm text-electric-300 space-y-2">
        <div>
          🎰 直接從區塊鏈讀取 FairBet 下注局並在本機重算，<strong>不需錢包</strong>。
          驗證時會向 RPC 另外取得區塊雜湊，不採信合約自己記錄的熵。
        </div>
        {dep?.version === 2 && (
          <div className="text-xs text-amber-300">
            v2 已停用：它允許玩家同時提交雙方承諾，下注前就能算出結果（助教 T03）。
            這裡只核對舊局的紀錄是否自洽，無法證明當時沒有被預選。
          </div>
        )}
      </div>

      <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-5 space-y-3">
        <div className="flex gap-2">
          {FAIRBET_DEPLOYMENTS.map((d) => (
            <button key={d.version} onClick={() => { setVersion(d.version); setData(null); setResult(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold ${version === d.version ? 'bg-electric-700 text-white' : 'bg-ink-800 text-gray-400'}`}>
              {d.label}
            </button>
          ))}
        </div>
        {dep && (
          <div className="text-xs font-mono text-gray-500 break-all">
            chainId {dep.chainId} · {dep.address}
            {explorer && <> · <a href={explorer} target="_blank" rel="noreferrer" className="text-electric-400 underline">瀏覽器 ↗</a></>}
          </div>
        )}
        <label className="text-sm text-gray-400 font-medium block pt-1">Bet ID</label>
        <div className="flex gap-2">
          <input value={betId} onChange={(e) => setBetId(e.target.value)} placeholder="例如 1"
            className="flex-1 bg-ink-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 font-mono text-sm outline-none focus:border-electric-500" />
          <button onClick={runVerify} disabled={loading || !dep}
            className="bg-electric-600 hover:bg-electric-500 disabled:bg-ink-800 text-white rounded-xl px-5 py-2 font-semibold transition-colors whitespace-nowrap">
            {loading ? '讀取中…' : '從鏈上驗證'}
          </button>
        </div>
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">使用其他 RPC（交叉驗證）</summary>
          <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} placeholder={CURRENT_CHAIN.rpcUrl}
            className="mt-2 w-full bg-ink-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white placeholder-gray-600 font-mono outline-none focus:border-electric-500" />
        </details>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {data && result && (
        <div className="space-y-5 animate-fade-in-up">
          <Verdict verdict={result.verdict} />
          <DataTable title="📋 鏈上下注資料" rows={[
            { label: '版本／鏈',   value: `FairBet v${data.version} · chainId ${dep.chainId}` },
            { label: '遊戲',       value: GAME_TYPE_NAMES[data.gameType] ?? `#${data.gameType}` },
            { label: '下注者',     value: shortenHash(data.player, 8) },
            { label: '注型／參數', value: `${data.betType} / ${data.param}` },
            { label: '注金',       value: `${data.amountEth} ETH` },
            { label: '賠付',       value: `${data.payoutEth} ETH` },
            result.verdict !== 'expired' && result.verdict !== 'pending'
              ? { label: '開獎結果', value: describeOutcome(data.gameType, data.outcome) } : null,
            { label: '玩家承諾',   value: shortenHash(data.playerCommit, 10) },
            data.version === 3 ? { label: '開獎區塊', value: `#${data.revealBlock}` } : { label: '莊家承諾', value: shortenHash(data.dealerCommit, 10) },
            data.version === 3 && data.entropy ? { label: '熵（區塊雜湊）', value: shortenHash(data.entropy, 10) } : null,
            { label: '最終隨機數', value: shortenHash(data.finalRandom, 10) },
          ]} />
          <Checks checks={result.checks} />
          {data.settleTxHash && CURRENT_CHAIN.explorerUrl && (
            <div className="text-center">
              <a href={`${CURRENT_CHAIN.explorerUrl}/tx/${data.settleTxHash}`} target="_blank" rel="noreferrer"
                className="text-xs text-electric-400 hover:text-electric-300 underline">查看結算交易 ↗</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
