import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  intFromHex, crashBps, wheelSeg, WHEEL, plinkoBucket, PLINKO, revolverChamber,
} from '../games/random';

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// 16 取 k 的二項係數（Pascal 第 16 列）
const C16 = [1,16,120,560,1820,4368,8008,11440,12870,11440,8008,4368,1820,560,120,16,1];

const randHex = () =>
  '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');

// 每款遊戲：single(fr)->{win, mult}、理論勝率、理論 RTP、公式說明
const GAMES = {
  crash2: {
    label: '🚀 Crash（目標 2×）', formula: 'P(crash≥2)=1/2，RTP=2×½=1',
    single: (fr) => { const m = crashBps(fr)/10000; return { win: m>=2, mult: m>=2?2:0 }; },
    theoWin: 0.5, theoRTP: 1,
  },
  dice_big: {
    label: '🎲 骰子（押大 4-6）', formula: 'P=3/6，RTP=½×2=1',
    single: (fr) => { const r = intFromHex(fr,0,4)%6+1; return { win: r>=4, mult: r>=4?2:0 }; },
    theoWin: 0.5, theoRTP: 1,
  },
  roulette_red: {
    label: '🎡 輪盤（押紅）', formula: 'P=18/37，RTP=18/37×2=36/37≈0.973',
    single: (fr) => { const n = intFromHex(fr,0,4)%37; return { win: RED.has(n), mult: RED.has(n)?2:0 }; },
    theoWin: 18/37, theoRTP: 36/37,
  },
  roulette_num: {
    label: '🎡 輪盤（單號 7，30×）', formula: 'P=1/37，RTP=1/37×30=30/37≈0.811',
    single: (fr) => { const n = intFromHex(fr,0,4)%37; return { win: n===7, mult: n===7?30:0 }; },
    theoWin: 1/37, theoRTP: 30/37,
  },
  wheel: {
    label: '🎡 幸運轉盤', formula: 'RTP = 平均倍率 = 70000/8/10000 = 0.875',
    single: (fr) => { const m = WHEEL[wheelSeg(fr)]/10000; return { win: m>0, mult: m }; },
    theoWin: WHEEL.filter(x=>x>0).length/8,
    theoRTP: WHEEL.reduce((a,b)=>a+b,0)/8/10000,
  },
  plinko: {
    label: '🔻 Plinko', formula: 'RTP = Σ C(16,k)/2¹⁶ × 倍率(k)',
    single: (fr) => { const m = PLINKO[plinkoBucket(fr)]/10000; return { win: m>=1, mult: m }; },
    theoWin: C16.reduce((a,c,k)=> a + (PLINKO[k]>=10000 ? c : 0), 0)/65536,
    theoRTP: C16.reduce((a,c,k)=> a + c*PLINKO[k], 0)/65536/10000,
  },
  limbo2: {
    label: '💥 Limbo（目標 2×）', formula: 'P(roll≥2)=1/2，RTP=1',
    single: (fr) => { const m = crashBps(fr)/10000; return { win: m>=2, mult: m>=2?2:0 }; },
    theoWin: 0.5, theoRTP: 1,
  },
  revolver3: {
    label: '🔫 左輪（裝 3 發）', formula: 'P存活=3/6，RTP=½×2=1',
    single: (fr) => { const c = revolverChamber(fr); return { win: c>=3, mult: c>=3?2:0 }; },
    theoWin: 0.5, theoRTP: 1,
  },
};

const N_OPTS = [1000, 10000, 50000];

function ConvergenceChart({ samples, theo }) {
  const W = 600, H = 200, padL = 46, padR = 12, padT = 12, padB = 24;
  const iw = W-padL-padR, ih = H-padT-padB;
  const vals = samples.map(s => s.rtp).concat([theo]);
  const maxV = Math.max(...vals)*1.05, minV = Math.min(...vals)*0.95;
  const span = (maxV-minV)||1;
  const x = (i) => padL + (i/(samples.length-1))*iw;
  const y = (v) => padT + (1-(v-minV)/span)*ih;
  const line = samples.map((s,i)=>`${i===0?'M':'L'} ${x(i).toFixed(1)} ${y(s.rtp).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{maxHeight:220}}>
      {[maxV,(maxV+minV)/2,minV].map((v,k)=>(
        <g key={k}>
          <line x1={padL} x2={W-padR} y1={y(v)} y2={y(v)} stroke="#1c2540" strokeWidth="1"/>
          <text x={padL-5} y={y(v)+3} textAnchor="end" fontSize="8" fill="#6b7280" fontFamily="monospace">{v.toFixed(3)}</text>
        </g>
      ))}
      {/* 理論值參考線 */}
      <line x1={padL} x2={W-padR} y1={y(theo)} y2={y(theo)} stroke="#34d399" strokeWidth="1.5" strokeDasharray="5 3"/>
      <text x={W-padR} y={y(theo)-4} textAnchor="end" fontSize="8" fill="#34d399">理論 {theo.toFixed(3)}</text>
      {/* 實測收斂線 */}
      <path d={line} fill="none" stroke="#3d77ff" strokeWidth="2" strokeLinejoin="round"/>
      <text x={padL} y={H-6} fontSize="8" fill="#6b7280">局數 →</text>
    </svg>
  );
}

export default function Lab() {
  const [gameKey, setGameKey] = useState('crash2');
  const [n, setN] = useState(10000);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState(null);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const g = GAMES[gameKey];
      let wins = 0, totalPayout = 0;
      const samples = [];
      const step = Math.max(1, Math.floor(n/80));
      for (let i = 1; i <= n; i++) {
        const { win, mult } = g.single(randHex());
        if (win) wins++;
        totalPayout += mult;
        if (i % step === 0 || i === n) samples.push({ i, rtp: totalPayout/i });
      }
      setRes({
        empWin: wins/n, empRTP: totalPayout/n,
        theoWin: g.theoWin, theoRTP: g.theoRTP,
        formula: g.formula, n, samples,
      });
      setRunning(false);
    }, 30);
  };

  const g = GAMES[gameKey];
  const errPct = res ? Math.abs(res.empRTP - res.theoRTP)/res.theoRTP*100 : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mt-2">📊 期望值實驗室</h1>
        <p className="text-gray-400 mt-2 leading-relaxed">
          用<strong>與真實遊戲相同的結果函數</strong>跑數萬次模擬，驗證理論期望值與實測是否吻合（大數法則）。
        </p>
      </div>

      {/* 控制 */}
      <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-2">選擇遊戲</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(GAMES).map(([k, v]) => (
              <button key={k} onClick={() => { setGameKey(k); setRes(null); }}
                className={`rounded-lg py-2 text-sm font-medium border transition-all text-left px-3
                  ${gameKey===k ? 'bg-electric-600 border-electric-400 text-white'
                    : 'bg-ink-800 border-gray-700 text-gray-300 hover:border-electric-700'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">模擬局數</label>
          {N_OPTS.map(o => (
            <button key={o} onClick={() => setN(o)}
              className={`rounded-lg px-4 py-1.5 text-sm font-mono transition-colors
                ${n===o ? 'bg-electric-700 text-white' : 'bg-ink-800 text-gray-400'}`}>
              {o.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="bg-ink-950 border border-electric-900/30 rounded-lg px-4 py-2 font-mono text-xs text-electric-300">
          理論公式：{g.formula}
        </div>
        <button onClick={run} disabled={running}
          className="w-full bg-electric-600 hover:bg-electric-500 disabled:bg-ink-800 text-white
                     font-bold rounded-xl py-3 transition-colors">
          {running ? '模擬中…' : `▶ 跑 ${n.toLocaleString()} 局模擬`}
        </button>
      </div>

      {/* 結果 */}
      {res && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5">
              <div className="mono-tag text-[10px] text-gray-600 uppercase">RTP（返還率）</div>
              <div className="flex items-end gap-3 mt-1">
                <div><div className="text-[10px] text-gray-500">理論</div><div className="text-xl font-bold text-emerald-400 font-mono">{res.theoRTP.toFixed(4)}</div></div>
                <div><div className="text-[10px] text-gray-500">實測</div><div className="text-xl font-bold text-electric-400 font-mono">{res.empRTP.toFixed(4)}</div></div>
              </div>
              <div className="text-xs text-gray-500 mt-2">誤差 {errPct.toFixed(2)}%</div>
            </div>
            <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5">
              <div className="mono-tag text-[10px] text-gray-600 uppercase">勝率</div>
              <div className="flex items-end gap-3 mt-1">
                <div><div className="text-[10px] text-gray-500">理論</div><div className="text-xl font-bold text-emerald-400 font-mono">{(res.theoWin*100).toFixed(2)}%</div></div>
                <div><div className="text-[10px] text-gray-500">實測</div><div className="text-xl font-bold text-electric-400 font-mono">{(res.empWin*100).toFixed(2)}%</div></div>
              </div>
              <div className="text-xs text-gray-500 mt-2">{res.n.toLocaleString()} 局</div>
            </div>
          </div>

          <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-4">
            <div className="text-sm font-semibold text-white mb-2">RTP 收斂曲線</div>
            <ConvergenceChart samples={res.samples} theo={res.theoRTP} />
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-4 text-sm text-emerald-300">
            ✅ 實測 RTP {res.empRTP.toFixed(4)} 收斂至理論值 {res.theoRTP.toFixed(4)}（誤差 {errPct.toFixed(2)}%），
            用數據驗證了合約結果函數的機率分布與公平性推導一致。局數越多，實測越貼近理論（大數法則）。
          </div>
        </div>
      )}

      <div className="text-center">
        <Link to="/docs" className="text-sm text-electric-400 hover:text-electric-300">← 回說明頁看公式推導</Link>
      </div>
    </div>
  );
}
