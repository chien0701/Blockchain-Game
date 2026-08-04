/**
 * 依遊戲主題呈現不同的等待動畫（上鏈確認期間播放，減少單調感）
 * theme: dice | coin | roulette | slots | crash | limbo | wheel | plinko | revolver | commit
 */

function Reel({ symbols, delay = 0 }) {
  const strip = [...symbols, ...symbols];
  return (
    <div className="reel-window w-10 bg-white rounded-md border-2 border-electric-800 overflow-hidden">
      <div className="reel-strip" style={{ animationDelay: `${delay}ms` }}>
        {strip.map((s, i) => (
          <div key={i} className="h-10 flex items-center justify-center text-2xl">{s}</div>
        ))}
      </div>
    </div>
  );
}

function Scene({ theme }) {
  switch (theme) {
    case 'crash':
    case 'limbo':
      return (
        <div className="relative h-24 w-24 flex items-end justify-center">
          <div className="absolute bottom-2 text-5xl anim-rocket">🚀</div>
          <div className="absolute top-1 text-electric-400 font-mono text-sm anim-climb">↑ ×?.??</div>
        </div>
      );
    case 'dice':
      return <div className="text-6xl anim-die">🎲</div>;
    case 'coin':
      return <div className="text-6xl anim-spin">🪙</div>;
    case 'roulette':
    case 'wheel':
      return (
        <div className="relative h-24 w-24 flex items-center justify-center">
          <div className="text-6xl anim-spin">🎡</div>
          <div className="absolute w-3 h-3 rounded-full bg-red-500 top-1 anim-spin" />
        </div>
      );
    case 'plinko':
      return (
        <div className="relative h-24 w-24 flex flex-col items-center justify-start pt-1 gap-2">
          <div className="text-2xl anim-ball">🔴</div>
          <div className="flex gap-3 opacity-40 text-[8px] text-electric-400">● ● ●</div>
          <div className="flex gap-2 opacity-40 text-[8px] text-electric-400">● ● ● ●</div>
        </div>
      );
    case 'slots':
      return (
        <div className="flex gap-1.5">
          <Reel symbols={['🍒','🍋','🔔','⭐','💎','7️⃣']} delay={0} />
          <Reel symbols={['💎','7️⃣','🍒','🔔','🍋','⭐']} delay={120} />
          <Reel symbols={['⭐','🍒','💎','7️⃣','🔔','🍋']} delay={240} />
        </div>
      );
    case 'revolver':
      return (
        <div className="relative h-24 w-24 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-4 border-gray-600 anim-spin relative">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className="absolute w-2.5 h-2.5 rounded-full bg-gray-500"
                style={{ top: '50%', left: '50%',
                  transform: `rotate(${i*60}deg) translateY(-24px) translate(-50%,-50%)` }} />
            ))}
          </div>
          <div className="absolute text-2xl">🔫</div>
        </div>
      );
    default: // commit / 通用
      return (
        <div className="w-16 h-16 rounded-full border-2 border-electric-700 flex items-center justify-center anim-ring">
          <span className="text-3xl anim-spin">⛓️</span>
        </div>
      );
  }
}

export default function GameLoader({ theme = 'commit', text, url }) {
  return (
    <div className="flex flex-col items-center gap-5 py-14">
      <div className="h-24 flex items-center justify-center"><Scene theme={theme} /></div>
      <div className="flex gap-1.5">
        {[0,1,2].map(i => <div key={i} className="dot w-2 h-2 bg-electric-500 rounded-full" />)}
      </div>
      <p className="text-gray-300 text-sm font-medium">{text}</p>
      {url && (
        <a href={url} target="_blank" rel="noreferrer"
           className="text-xs text-electric-400 underline hover:text-electric-300">
          在區塊瀏覽器查看交易 ↗
        </a>
      )}
    </div>
  );
}
