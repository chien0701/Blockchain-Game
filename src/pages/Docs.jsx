import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  generateSeed, generateSalt, commitHash, combineSeeds, verifyCommit, shortenHash,
} from '../utils/crypto';
import { CONCEPTS } from '../games/concepts';

/* ── 互動式 Commit-Reveal Demo ──────────────────────────────────── */

function InteractiveDemo() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(null);

  const generate = () => {
    const seed = generateSeed(), salt = generateSalt();
    setD({ seed, salt, commit: commitHash(seed, salt) });
    setStep(1);
  };

  const reveal = () => {
    const blockHash = generateSeed();
    setD((x) => ({ ...x, blockHash, final: combineSeeds(x.seed, blockHash) }));
    setStep(3);
  };

  const reset = () => { setStep(0); setD(null); };

  const ok = d && verifyCommit(d.seed, d.salt, d.commit);
  const diceResult = d?.final ? (parseInt(d.final.slice(2, 10), 16) % 6) + 1 : null;

  const Field = ({ label, value, hidden }) => (
    <div className="space-y-0.5">
      <div className="mono-tag text-[9px] text-gray-600 uppercase">{label}</div>
      <div className={`font-mono text-xs break-all ${hidden ? 'text-gray-700 blur-[3px] select-none' : 'text-electric-300'}`}>
        {hidden ? '0x████████████████████████' : shortenHash(value, 14)}
      </div>
    </div>
  );

  return (
    <div className="bg-ink-850 border border-electric-900/40 rounded-2xl p-6 space-y-6 shadow-glow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">🧪 親手體驗：玩家承諾＋未來區塊雜湊</h3>
        <span className="mono-tag text-[10px] text-electric-500">STEP {step} / 3</span>
      </div>

      <div className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-colors
            ${step >= n ? 'bg-electric-500' : 'bg-ink-700'}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="text-center py-8 space-y-4">
          <p className="text-gray-400 text-sm">點擊下方按鈕，看一局下注如何從承諾、等待開獎區塊到開獎。</p>
          <button onClick={generate}
            className="bg-electric-600 hover:bg-electric-500 text-white font-semibold rounded-xl
                       px-6 py-3 transition-all hover:scale-105 shadow-glow-sm">
            ① 產生種子與 salt
          </button>
        </div>
      )}

      {step >= 1 && d && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧑</span><span className="font-bold text-white text-sm">玩家（本機）</span>
            </div>
            <Field label="seed" value={d.seed} />
            <Field label="salt" value={d.salt} />
            {step >= 2 && <Field label="commit = keccak256(seed‖salt)" value={d.commit} />}
          </div>
          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">⛓️</span><span className="font-bold text-white text-sm">開獎區塊 N+1</span>
            </div>
            <Field label="blockhash(N+1)" value={d.blockHash} hidden={step < 3} />
            {step < 3 && <p className="text-xs text-gray-500">下注時這個區塊還不存在，沒有人知道它的雜湊。</p>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400 leading-relaxed">
            ✓ 玩家在本機產生 32-byte 種子與 salt，並計算承諾 <span className="font-mono text-electric-300">keccak256(seed‖salt)</span>。
            下注時只送出承諾與下注金額，種子留在瀏覽器。
          </p>
          <button onClick={() => setStep(2)}
            className="bg-electric-600 hover:bg-electric-500 text-white font-semibold rounded-xl px-5 py-2.5 transition-colors">
            ② 送出下注與承諾
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-electric-950/40 border border-electric-800 rounded-xl p-3 text-sm text-electric-300">
            🔒 下注已鎖定，合約記下開獎區塊 = 下注區塊 N + 1。此刻區塊 N+1 還沒產生，<strong>包括玩家自己在內，沒有人能算出結果</strong>。
          </div>
          <button onClick={reveal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-5 py-2.5 transition-colors">
            ③ 開獎區塊產生後揭露種子
          </button>
        </div>
      )}

      {step === 3 && d && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="space-y-2">
            <CheckLine ok={ok} label="keccak256(seed ‖ salt) === commit" />
          </div>

          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-2">
            <div className="mono-tag text-[9px] text-gray-600 uppercase">finalRandom = keccak256(seed ‖ blockhash(N+1))</div>
            <div className="font-mono text-sm text-electric-300 break-all">{shortenHash(d.final, 18)}</div>
            <div className="pt-2 border-t border-electric-900/30 flex items-center justify-between">
              <span className="text-sm text-gray-400">範例：取前 4 bytes 對 6 取模 → 骰子點數</span>
              <span className="text-2xl">🎲 {diceResult}</span>
            </div>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-sm text-emerald-300 space-y-1">
            <p>✅ 承諾驗證通過。結果由玩家下注前承諾的種子，與下注後才產生的區塊雜湊共同決定；任何第三方都能用相同資料重算出 🎲 {diceResult}。</p>
            <p className="text-xs text-emerald-400/70">示範中的區塊雜湊由本機隨機產生；實際下注時由鏈上區塊提供。前提是玩家不與該區塊的出塊者串通。</p>
          </div>

          <button onClick={reset}
            className="bg-ink-800 hover:bg-ink-700 text-gray-300 font-semibold rounded-xl px-5 py-2.5 transition-colors">
            🔄 再試一次
          </button>
        </div>
      )}
    </div>
  );
}

function CheckLine({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✅' : '❌'}</span>
      <span className="font-mono text-xs text-gray-400">{label}</span>
    </div>
  );
}

/* ── 主頁 ───────────────────────────────────────────────────────── */

export default function Docs() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">

      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mt-2">技術說明</h1>
        <p className="text-gray-400 mt-3 leading-relaxed">
          FairChain 如何用密碼學保證每一局遊戲都「可證明公平」（Provably Fair）
        </p>
      </div>

      {/* 問題 */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-white">為什麼需要它？</h2>
        <p className="text-gray-400 leading-relaxed">
          傳統線上博弈，玩家必須<strong className="text-white">完全信任莊家</strong>——你無法確認牌是不是被動了手腳、
          開獎是不是在你下注後才決定。FairChain 以 <span className="text-electric-300 font-semibold">Commit-Reveal（承諾－揭露）結合未來區塊雜湊</span>
          開獎，再由智能合約依規則判定與賠付，把「信任」變成「可重算的數學」。
        </p>
      </section>

      {/* 互動 demo */}
      <InteractiveDemo />

      {/* 三步驟 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">三個步驟</h2>
        {[
          ['Commit 承諾', '玩家在本機產生隨機 seed 與 salt，只把 keccak256(seed‖salt) 連同下注金額送上合約；合約記下開獎區塊 = 下注區塊 + 1。'],
          ['Reveal 揭露', '開獎區塊產生後，玩家送出結算交易揭露 seed 與 salt；合約重算 keccak256 比對承諾，再以 keccak256(seed‖開獎區塊雜湊) 開獎並依規則賠付。'],
          ['Verify 驗證', '任何人都能讀取鏈上的承諾、種子、熵與結果，另向 RPC 取得區塊雜湊，重算承諾、熵、finalRandom、結果、賠付五項；缺任何一項只會顯示「未完成」。'],
        ].map(([title, desc], i) => (
          <div key={title} className="flex gap-4 bg-ink-850 border border-electric-900/40 rounded-xl p-4">
            <span className="mono-tag text-electric-500 text-lg shrink-0">{`0${i + 1}`}</span>
            <div>
              <h3 className="font-bold text-white">{title}</h3>
              <p className="text-gray-400 text-sm mt-1 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 名詞表 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">核心概念</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {Object.entries(CONCEPTS).map(([key, c]) => (
            <div key={key} className="bg-ink-850 border border-electric-900/40 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span>{c.icon}</span>
                <span className="font-bold text-white text-sm">{c.cn}</span>
                <span className="mono-tag text-[9px] text-gray-600">{c.label}</span>
              </div>
              <p className="text-gray-400 text-xs leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="bg-electric-950/40 border border-electric-800 rounded-2xl p-6 text-center space-y-3">
        <p className="text-electric-300">理論看完了，親自玩一局來驗證吧</p>
        <div className="flex gap-3 justify-center">
          <Link to="/lobby" className="bg-electric-600 hover:bg-electric-500 text-white font-semibold rounded-xl px-6 py-2.5 transition-colors">
            🎮 進入大廳
          </Link>
          <Link to="/verifier" className="bg-ink-800 hover:bg-ink-700 text-gray-300 font-semibold rounded-xl px-6 py-2.5 transition-colors border border-electric-900/50">
            🔍 驗證工具
          </Link>
        </div>
      </div>

    </div>
  );
}
