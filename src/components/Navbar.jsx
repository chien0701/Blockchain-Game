import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { CURRENT_CHAIN, IS_ON_CHAIN } from '../config/contractConfig';

const NAV = [
  { path: '/',         label: '首頁',     tag: '001' },
  { path: '/lobby',    label: '遊戲大廳', tag: '002' },
  { path: '/verifier', label: '驗證工具', tag: '003' },
  { path: '/docs',     label: '說明',     tag: '004' },
  { path: '/stats',    label: '統計',     tag: '005' },
  { path: '/lab',      label: '實驗室',   tag: '006' },
];

export default function Navbar() {
  const {
    address, isConnected, isMock,
    isWrongNetwork, connect, disconnect,
    switchToSupportedNetwork,
  } = useWallet();
  const { pathname } = useLocation();

  return (
    <>
      <nav className="bg-ink-900/90 backdrop-blur border-b border-electric-900/40 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="text-2xl group-hover:text-glow transition-all">⛓️</span>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-white text-lg tracking-tight">
                Fair<span className="text-electric-400">Chain</span>
              </span>
              <span className="mono-tag text-[9px] text-gray-600 uppercase">
                Provably Fair Protocol
              </span>
            </div>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV.map(({ path, label, tag }) => {
              const active = pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors group
                    ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <span className="mono-tag text-[9px] text-gray-600 mr-1.5">{tag}</span>
                  {label}
                  {active && (
                    <span className="absolute left-3 right-3 -bottom-px h-px bg-electric-400 shadow-glow-sm" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Wallet */}
          {isConnected ? (
            <div className="flex items-center gap-2">
              {IS_ON_CHAIN && !isMock && (
                <span className={`hidden sm:block mono-tag text-[10px] rounded px-2 py-1 border
                  ${isWrongNetwork
                    ? 'bg-red-950 border-red-700 text-red-400'
                    : 'bg-electric-950 border-electric-800 text-electric-300'}`}>
                  {isWrongNetwork ? '⚠ WRONG NET' : CURRENT_CHAIN.name.toUpperCase()}
                </span>
              )}
              {isMock && (
                <span className="hidden sm:block mono-tag text-[10px] rounded px-2 py-1 border
                                 bg-amber-950 border-amber-700 text-amber-400">
                  SIMULATION
                </span>
              )}

              <button
                onClick={disconnect}
                className="flex items-center gap-2 bg-ink-800 hover:bg-ink-700
                           border border-electric-900/50 rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                <span className={`w-2 h-2 rounded-full
                  ${isMock ? 'bg-amber-400' : isWrongNetwork ? 'bg-red-400' : 'bg-electric-400 animate-glow-pulse'}`} />
                <span className="text-gray-300 font-mono text-xs">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="bg-electric-600 hover:bg-electric-500 text-white shadow-glow-sm
                         hover:shadow-glow rounded-lg px-4 py-2 text-sm font-semibold transition-all"
            >
              連接錢包
            </button>
          )}
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center justify-center gap-1 pb-2 px-4">
          {NAV.map(({ path, label }) => {
            const active = pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex-1 text-center px-2 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${active ? 'bg-electric-950 text-electric-300' : 'text-gray-400 hover:text-white'}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 網路不符橫幅 */}
      {isWrongNetwork && (
        <div className="bg-red-950 border-b border-red-800 px-4 py-2.5
                        flex items-center justify-center gap-3 text-sm">
          <span className="text-red-300">
            ⚠️ 請切換至 <strong>{CURRENT_CHAIN.name}</strong> 才能進行真實上鏈操作
          </span>
          <button
            onClick={switchToSupportedNetwork}
            className="bg-red-700 hover:bg-red-600 text-white rounded-lg
                       px-3 py-1 text-xs font-semibold transition-colors"
          >
            立即切換
          </button>
        </div>
      )}
    </>
  );
}
