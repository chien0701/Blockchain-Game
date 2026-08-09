import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats, recentGames, clearAllGames } from '../utils/storage';
import { getGame } from '../games/registry';
import MoneyChart from '../components/MoneyChart';

function Stat({ label, value, sub, accent = 'text-white' }) {
  return (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5">
      <div className="mono-tag text-[10px] text-gray-600 uppercase">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500">{value}（{pct}%）</span>
      </div>
      <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Stats() {
  const [stats,  setStats]  = useState(() => getStats());
  const [recent, setRecent] = useState(() => recentGames());

  const refresh = () => { setStats(getStats()); setRecent(recentGames()); };

  const clear = () => {
    if (!window.confirm('確定要清空所有本地遊戲紀錄嗎？此動作無法復原。')) return;
    clearAllGames();
    refresh();
  };

  const empty = stats.total === 0;
  const gameEntries = Object.entries(stats.byGame).sort((a, b) => b[1] - a[1]);

  // 資金曲線：只取有真實下注的局，依時間由舊到新
  const betRounds = recent.filter(g => g.bet > 0).slice().reverse();
  const net = stats.totalNet;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mt-1">📊 戰績統計</h1>
          <p className="text-gray-500 mt-1">基於本瀏覽器的遊戲紀錄</p>
        </div>
        {!empty && (
          <button onClick={clear}
            className="text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700
                       rounded-xl px-4 py-2 transition-colors">
            🗑 清空紀錄
          </button>
        )}
      </div>

      {empty ? (
        <div className="bg-ink-850 border border-electric-900/30 rounded-2xl p-12 text-center space-y-3">
          <div className="text-5xl">📭</div>
          <p className="text-gray-400">還沒有任何遊戲紀錄</p>
          <Link to="/lobby" className="inline-block bg-electric-600 hover:bg-electric-500 text-white
                                       font-semibold rounded-xl px-6 py-2.5 transition-colors">
            🎮 去玩一局
          </Link>
        </div>
      ) : (
        <>
          {/* 資金曲線 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">💰 資金曲線</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="淨收益" value={`${net >= 0 ? '+' : ''}${net.toFixed(4)}`}
                    accent={net >= 0 ? 'text-emerald-400' : 'text-red-400'} sub="ETH" />
              <Stat label="總下注" value={stats.totalWagered.toFixed(4)} sub={`${stats.betCount} 局真實下注`} />
              <Stat label="總回收" value={(stats.totalWagered + stats.totalNet).toFixed(4)} sub="ETH" />
            </div>
            <MoneyChart rounds={betRounds} />
          </section>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="總局數" value={stats.total} />
            <Stat label="勝率" value={`${stats.winRate}%`} accent="text-electric-400"
                  sub={`${stats.wins} 勝 / ${stats.losses} 敗`} />
            <Stat label="鏈上局數" value={stats.onChainCount} accent="text-emerald-400"
                  sub={`模擬 ${stats.mockCount} 局`} />
            <Stat label="平手" value={stats.draws} accent="text-gray-300" />
          </div>

          <section className="bg-ink-850 border border-electric-900/40 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">勝負分布</h2>
            <Bar label="🏆 勝" value={stats.wins}   total={stats.total} color="bg-emerald-500" />
            <Bar label="😞 敗" value={stats.losses} total={stats.total} color="bg-red-500" />
            <Bar label="🤝 平" value={stats.draws}  total={stats.total} color="bg-gray-500" />
          </section>

          <section className="bg-ink-850 border border-electric-900/40 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">各遊戲局數</h2>
            {gameEntries.map(([type, count]) => {
              const meta = getGame(type);
              return (
                <Bar key={type} label={`${meta?.icon ?? '🎮'} ${meta?.name ?? type}`}
                     value={count} total={stats.total} color="bg-electric-500" />
              );
            })}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">最近 8 局</h2>
            <div className="bg-ink-850 border border-electric-900/30 rounded-2xl divide-y divide-electric-900/20">
              {recent.slice(0, 8).map((g) => {
                const meta = getGame(g.gameType);
                const label = g.result === 'player' ? '勝' : g.result === 'dealer' ? '敗' : g.result === 'draw' ? '平' : '—';
                const color = g.result === 'player' ? 'text-emerald-400' : g.result === 'dealer' ? 'text-red-400' : 'text-gray-400';
                return (
                  <div key={g.gameId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-300">{meta?.icon ?? '🎮'} {meta?.name ?? g.gameType}</span>
                    <div className="flex items-center gap-3">
                      {g.onChain && <span className="mono-tag text-[9px] text-electric-400">CHAIN</span>}
                      <span className={`font-bold ${color}`}>{label}</span>
                      <Link to={`/verifier?id=${g.gameId}`} className="text-electric-400 hover:text-electric-300 text-xs">驗證 →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
