import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { newGameId } from '../utils/crypto';
import { recentGames } from '../utils/storage';
import { GAMES, getGame, difficultyStars } from '../games/registry';
import { getConcept, ACCENT_CLASS } from '../games/concepts';

const RESULT_BADGE = {
  player: { label: '勝', color: 'bg-emerald-900 text-emerald-300' },
  dealer: { label: '敗', color: 'bg-red-900 text-red-300' },
  draw:   { label: '平', color: 'bg-gray-700 text-gray-300' },
};

export default function Lobby() {
  const navigate = useNavigate();
  const history  = recentGames();

  const startGame = (game) => {
    if (game.status !== 'live') return;
    if (game.id === 'blackjack') navigate(`/game/${newGameId()}`);
    else navigate(`/play/${game.id}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">

      {/* Header */}
      <div>
        <span className="mono-tag text-xs text-electric-500">GAME LOBBY</span>
        <h1 className="text-3xl font-bold text-white mt-1">🎰 遊戲大廳</h1>
        <p className="text-gray-500 mt-1">單人對莊家（智能合約），每一局結果都可公開驗證</p>
      </div>

      {/* ── 遊戲選擇器 ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-semibold text-gray-200">選擇遊戲</h2>
          <span className="mono-tag text-[10px] text-gray-600">SELECT A GAME</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAMES.map((g) => {
            const c    = getConcept(g.concept);
            const ac   = ACCENT_CLASS[c.accent];
            const live = g.status === 'live';
            return (
              <button
                key={g.id}
                onClick={() => startGame(g)}
                disabled={!live}
                className={`text-left relative rounded-2xl border bg-ink-850 p-5 space-y-3 transition-all
                  ${live
                    ? 'border-electric-900/40 hover:border-electric-600 hover:shadow-glow-sm hover:-translate-y-0.5 cursor-pointer'
                    : 'border-gray-800 opacity-60 cursor-not-allowed'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{g.icon}</span>
                  {live
                    ? <span className="mono-tag text-[9px] text-electric-300 border border-electric-800 rounded px-1.5 py-0.5 animate-glow-pulse">▶ PLAY</span>
                    : <span className="mono-tag text-[9px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">SOON</span>}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{g.name}</h3>
                  <span className="mono-tag text-[10px] text-gray-600">{g.en}</span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed min-h-[40px]">{g.tagline}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className={`text-[11px] rounded-full px-2 py-0.5 border ${ac.text} ${ac.border} ${ac.bg}`}>
                    {c.icon} {c.cn}
                  </span>
                  <span className="text-xs text-gray-600">{difficultyStars(g.difficulty)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 遊戲記錄 ── */}
      {history.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-lg font-semibold text-gray-200">📜 你的遊戲記錄</h2>
            <span className="mono-tag text-[10px] text-gray-600">LOCAL HISTORY</span>
          </div>
          <div className="bg-ink-850 border border-electric-900/30 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-electric-900/30">
                  <th className="text-left text-gray-500 font-medium px-4 py-3">遊戲</th>
                  <th className="text-left text-gray-500 font-medium px-4 py-3 hidden sm:table-cell">時間</th>
                  <th className="text-center text-gray-500 font-medium px-4 py-3">鏈上</th>
                  <th className="text-center text-gray-500 font-medium px-4 py-3">結果</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 8).map((g) => {
                  const meta  = getGame(g.gameType);
                  const badge = RESULT_BADGE[g.result] ?? { label: '?', color: 'bg-gray-700 text-gray-400' };
                  return (
                    <tr key={g.gameId} className="border-b border-electric-900/20 last:border-0 hover:bg-ink-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-gray-300">{meta?.icon ?? '🎮'} {meta?.name ?? g.gameType}</span>
                        <div className="font-mono text-gray-600 text-[10px] truncate max-w-[160px]">{g.gameId}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                        {new Date(g.ts).toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {g.onChain
                          ? <span className="mono-tag text-[9px] text-electric-300 border border-electric-800 rounded px-1.5 py-0.5">CHAIN</span>
                          : <span className="mono-tag text-[9px] text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">SIM</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/verifier?id=${g.gameId}`} className="text-xs text-electric-400 hover:text-electric-300 transition-colors">
                          驗證 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Info */}
      <div className="bg-electric-950/40 border border-electric-800 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl mt-0.5">ℹ️</span>
        <div className="text-sm text-electric-300 leading-relaxed">
          本平台為<strong>單人對莊家</strong>的公平博弈展示（無多人連線）。骰子/輪盤/拉霸的下注與賠付
          由 <strong>FairBet 智能合約</strong>自動結算；每一局的密碼學參數都公開可查，前往{' '}
          <Link to="/verifier" className="underline font-semibold">驗證工具</Link> 即可驗證公平性。
        </div>
      </div>

    </div>
  );
}
