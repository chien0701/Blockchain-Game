import { useState, useEffect } from 'react';
import { getReadOnlyProvider } from '../utils/contract';
import { IS_ON_CHAIN, CURRENT_CHAIN } from '../config/contractConfig';

/**
 * 系統狀態列 — 頂部細條，顯示即時區塊高度與網路狀態
 * 營造「連上去中心化網路」的系統啟動感（工業精密風）
 */
export default function SystemBar() {
  const [block, setBlock] = useState(null);
  const [live,  setLive]  = useState(false);

  useEffect(() => {
    if (!IS_ON_CHAIN) return;

    let cancelled = false;
    const provider = getReadOnlyProvider();

    const poll = async () => {
      try {
        const n = await provider.getBlockNumber();
        if (!cancelled) { setBlock(n); setLive(true); }
      } catch {
        if (!cancelled) setLive(false);
      }
    };

    poll();
    const timer = setInterval(poll, 12000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <div className="bg-ink-950 border-b border-electric-900/40 text-[11px]
                    font-mono text-gray-500 tracking-wide">
      <div className="max-w-6xl mx-auto px-4 h-7 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full
              ${live ? 'bg-electric-400 animate-glow-pulse' : 'bg-gray-600'}`} />
            <span className={live ? 'text-electric-400' : 'text-gray-500'}>
              {IS_ON_CHAIN ? CURRENT_CHAIN.name : '模擬環境 SIMULATION'}
            </span>
          </span>
          <span className="hidden sm:inline text-gray-700">|</span>
          <span className="hidden sm:inline">
            BLOCK <span className="text-gray-400">{block !== null ? `#${block.toLocaleString()}` : '——'}</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">PROTOCOL <span className="text-gray-400">COMMIT-REVEAL</span></span>
          <span className="text-gray-700 hidden sm:inline">|</span>
          <span>KECCAK<span className="text-gray-400">256</span></span>
        </div>
      </div>
    </div>
  );
}
