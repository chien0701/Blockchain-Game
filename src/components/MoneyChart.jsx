import { useState } from 'react';
import { getGame } from '../games/registry';

/**
 * 累積淨收益折線圖（單序列，含零基準線與 hover）
 * @param rounds 依時間排序(舊→新)的下注局：{ gameType, net, ts }
 */
export default function MoneyChart({ rounds }) {
  const [hi, setHi] = useState(null);

  if (!rounds || rounds.length < 2) {
    return (
      <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-10 text-center text-gray-500 text-sm">
        📈 至少完成 2 局真實下注後，這裡會顯示你的資金曲線
      </div>
    );
  }

  // 累積淨收益
  let cum = 0;
  const pts = rounds.map((r, i) => { cum += r.net; return { i, cum, net: r.net, gameType: r.gameType, ts: r.ts }; });

  const W = 600, H = 240, padL = 52, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const cums = pts.map(p => p.cum);
  const maxV = Math.max(0, ...cums), minV = Math.min(0, ...cums);
  const span = (maxV - minV) || 1;
  const x = (i) => padL + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v) => padT + (1 - (v - minV) / span) * innerH;

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const finalCum = cums[cums.length - 1];
  const lineColor = finalCum >= 0 ? '#3d77ff' : '#f87171';
  const y0 = y(0);

  // Y 軸刻度
  const ticks = [maxV, (maxV + minV) / 2, minV].filter((v, i, a) => a.indexOf(v) === i);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((px - padL) / innerW) * (pts.length - 1));
    idx = Math.max(0, Math.min(pts.length - 1, idx));
    setHi(idx);
  };

  const hp = hi != null ? pts[hi] : null;

  return (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}
           onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <defs>
          <linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={lineColor} stopOpacity="0.30" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y 刻度 + 網格 */}
        {ticks.map((v, k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#1c2540" strokeWidth="1" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#6b7280" fontFamily="monospace">
              {v >= 0 ? '+' : ''}{v.toFixed(4)}
            </text>
          </g>
        ))}

        {/* 零基準線 */}
        <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke="#4b5563" strokeWidth="1" strokeDasharray="4 3" />
        <text x={W - padR} y={y0 - 4} textAnchor="end" fontSize="8" fill="#6b7280">損益平衡</text>

        {/* 面積 + 折線 */}
        <path d={area} fill="url(#mc-fill)" />
        <path d={line} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* 資料點 */}
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.cum)} r={hi === p.i ? 5 : 3}
            fill={hi === p.i ? '#fff' : lineColor} stroke={lineColor} strokeWidth="1.5" />
        ))}

        {/* hover 十字線 + tooltip */}
        {hp && (() => {
          const meta = getGame(hp.gameType);
          const tw = 150, tx = Math.min(Math.max(x(hp.i) - tw / 2, padL), W - padR - tw), ty = 10;
          return (
            <g>
              <line x1={x(hp.i)} x2={x(hp.i)} y1={padT} y2={H - padB} stroke="#3d77ff" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
              <rect x={tx} y={ty} width={tw} height={46} rx="6" fill="#0a0f1c" stroke="#1a5cff" strokeWidth="1" />
              <text x={tx + 8} y={ty + 16} fontSize="10" fill="#e5e7eb">
                {meta?.icon ?? '🎮'} {meta?.name ?? hp.gameType}　第 {hp.i + 1} 局
              </text>
              <text x={tx + 8} y={ty + 31} fontSize="10" fill={hp.net >= 0 ? '#34d399' : '#f87171'} fontFamily="monospace">
                本局 {hp.net >= 0 ? '+' : ''}{hp.net.toFixed(4)} ETH
              </text>
              <text x={tx + 8} y={ty + 42} fontSize="9" fill="#9ca3af" fontFamily="monospace">
                累積 {hp.cum >= 0 ? '+' : ''}{hp.cum.toFixed(4)} ETH
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
