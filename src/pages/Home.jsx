import { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { GAMES, difficultyStars } from '../games/registry';
import { getConcept, ACCENT_CLASS } from '../games/concepts';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const STEPS = [
  {
    tag: 'STEP 01', icon: '🔒', title: '承諾 Commit',
    desc: '玩家在本機產生隨機種子與 salt，只把 keccak256(seed‖salt) 連同下注金額送上合約；合約記下開獎區塊 = 下注區塊 + 1。',
  },
  {
    tag: 'STEP 02', icon: '🔓', title: '揭露 Reveal',
    desc: '開獎區塊產生後，玩家揭露種子；合約驗證承諾，以 keccak256(seed‖開獎區塊雜湊) 開獎並依規則賠付。下注當下該區塊還不存在，無法預先算出結果。',
  },
  {
    tag: 'STEP 03', icon: '✅', title: '驗證 Verify',
    desc: '任何人都能從鏈上讀取這一局的所有參數，另向 RPC 取得區塊雜湊，在本地重算五項證據。全部吻合才算通過。',
  },
];

const FEATURES = [
  { icon: '🚫', title: '無法預選結果', desc: '下注時開獎區塊尚未產生，玩家、網站與合約擁有者都無法預先選出必勝的注（前提：玩家不與出塊者串通）。' },
  { icon: '📋', title: '鏈上紀錄', desc: '承諾、種子與結果寫入區塊鏈，達最終確定後難以竄改。' },
  { icon: '🌐', title: '任意人可驗證', desc: '開源邏輯讓任何驗證者都能直接從鏈上重算比對。' },
  { icon: '🧂', title: 'Salt 盲化保護', desc: '每個承諾混入隨機 salt，避免以字典或彩虹表反推種子。' },
];

export default function Home() {
  const root = useRef(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-hero]', {
        y: 30, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out',
      });
      gsap.utils.toArray('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 40, opacity: 0, duration: 0.7, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });
    });
  }, { scope: root });

  return (
    <div ref={root} className="min-h-screen">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-28 px-4 scanline">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[640px] h-[640px] bg-electric-600/10 rounded-full blur-3xl animate-glow-pulse" />
        </div>

        {/* faint hash backdrop */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.04]
                        font-mono text-[10px] text-electric-300 leading-5 select-none break-all px-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i}>
              0x{'abcdef0123456789'.repeat(8).slice(i, i + 60)}
            </div>
          ))}
        </div>

        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <div data-hero className="inline-flex items-center gap-2 bg-electric-950 border border-electric-800
                          rounded-full px-4 py-1.5 text-sm text-electric-300">
            <span className="w-2 h-2 bg-electric-400 rounded-full animate-glow-pulse" />
            可證明公平的鏈上博弈
          </div>

          <h1 data-hero className="text-6xl sm:text-7xl font-extrabold tracking-tight text-white">
            Fair<span className="text-electric-400 text-glow">Chain</span>
          </h1>
          <p data-hero className="text-xl text-electric-300 font-medium">區塊鏈公平遊戲驗證系統</p>
          <p data-hero className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
            以玩家承諾結合未來區塊雜湊開獎，由智能合約依規則判定與賠付——
            任何人都能用鏈上資料重算驗證。
          </p>

          <div data-hero className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link to="/lobby"
              className="bg-electric-600 hover:bg-electric-500 text-white font-semibold
                         rounded-xl px-8 py-3 text-lg transition-all hover:scale-105
                         shadow-glow hover:shadow-glow-lg">
              🎮 進入遊戲大廳
            </Link>
            <Link to="/verifier"
              className="bg-ink-800 hover:bg-ink-700 text-gray-300 font-semibold
                         rounded-xl px-8 py-3 text-lg transition-colors border border-electric-900/50">
              🔍 驗證工具
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-4 border-t border-electric-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 data-reveal className="text-3xl font-bold text-center text-white mb-2">運作原理</h2>
          <p data-reveal className="text-center text-gray-500 mb-12 text-sm">三個步驟，任何人都能重算驗證</p>

          <div className="grid sm:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.tag} data-reveal
                className="relative rounded-2xl border border-electric-900/40 bg-ink-850 p-6 space-y-3
                           hover:border-electric-700 hover:shadow-glow-sm transition-all">
                <span className="mono-tag text-[10px] text-electric-500">{s.tag}</span>
                <div className="text-4xl">{s.icon}</div>
                <h3 className="text-lg font-bold text-white">{s.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Diagram ── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 data-reveal className="text-3xl font-bold text-center text-white mb-10">密碼學流程圖解</h2>
          <div data-reveal className="bg-ink-900 border border-electric-900/40 rounded-2xl p-6 font-mono text-sm
                          text-gray-300 leading-loose overflow-x-auto shadow-glow-sm">
            <pre>{`玩家               莊家              區塊鏈
 │                  │                  │
 ├─ seed_P, salt_P  │                  │
 ├─ c_P = keccak256(seed_P ‖ salt_P)   │
 │                  ├─ seed_D, salt_D  │
 │                  ├─ c_D = keccak256(seed_D ‖ salt_D)
 │                  │                  │
 ├─── commit(c_P) ─────────────────────►│ ✅ 鎖定
 │                  ├─ commit(c_D) ─────►│ ✅ 鎖定
 │                  │                  │
 ├─── reveal(seed_P, salt_P) ──────────►│ 驗證 keccak256 == c_P
 │                  ├─ reveal(seed_D, salt_D) ─► 驗證 == c_D
 │                  │                  │
 │                  │     final = keccak256(seed_P ‖ seed_D)
 │                  │     → 發牌 → 判定勝負
 ◄─────────────────────────────────────┤ 結果永久記錄`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Game lineup ── */}
      <section className="py-20 px-4 border-t border-electric-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 data-reveal className="text-3xl font-bold text-center text-white mb-2">遊戲陣容</h2>
          <p data-reveal className="text-center text-gray-500 mb-12 text-sm">每款遊戲展示一個區塊鏈核心概念</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {GAMES.map((g) => {
              const c  = getConcept(g.concept);
              const ac = ACCENT_CLASS[c.accent];
              const live = g.status === 'live';
              return (
                <div key={g.id} data-reveal
                  className={`relative rounded-2xl border bg-ink-850 p-5 space-y-3 transition-all
                    ${live ? 'border-electric-900/40 hover:border-electric-700 hover:shadow-glow-sm'
                           : 'border-gray-800 opacity-70'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{g.icon}</span>
                    {live
                      ? <span className="mono-tag text-[9px] text-electric-300 border border-electric-800 rounded px-1.5 py-0.5">LIVE</span>
                      : <span className="mono-tag text-[9px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">SOON</span>}
                  </div>
                  <h3 className="text-lg font-bold text-white">{g.name}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed min-h-[40px]">{g.tagline}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className={`text-[11px] rounded-full px-2 py-0.5 border ${ac.text} ${ac.border} ${ac.bg}`}>
                      {c.icon} {c.cn}
                    </span>
                    <span className="text-xs text-gray-600">{difficultyStars(g.difficulty)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4 border-t border-electric-900/30">
        <div className="max-w-5xl mx-auto">
          <h2 data-reveal className="text-3xl font-bold text-center text-white mb-12">系統特點</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} data-reveal
                className="bg-ink-850 border border-electric-900/40 rounded-2xl p-5 space-y-3
                           hover:border-electric-700 transition-colors">
                <div className="text-3xl">{f.icon}</div>
                <h3 className="font-bold text-white">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 text-center border-t border-electric-900/30">
        <h2 data-reveal className="text-3xl font-bold text-white mb-4">準備好了嗎？</h2>
        <p data-reveal className="text-gray-400 mb-8">親自體驗一局公平、可驗證的鏈上遊戲</p>
        <Link data-reveal to="/lobby"
          className="inline-block bg-electric-600 hover:bg-electric-500 text-white
                     font-bold rounded-2xl px-10 py-4 text-xl transition-all
                     hover:scale-105 shadow-glow hover:shadow-glow-lg">
          🎮 開始遊戲
        </Link>
      </section>

    </div>
  );
}
