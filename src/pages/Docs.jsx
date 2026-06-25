import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  generateSeed, generateSalt, commitHash, combineSeeds, verifyCommit, shortenHash,
} from '../utils/crypto';
import { CONCEPTS } from '../games/concepts';

/* ── 互動式 Commit-Reveal Demo ──────────────────────────────────── */

function InteractiveDemo() {
  const [step, setStep] = useState(0); // 0 idle · 1 generated · 2 committed · 3 revealed
  const [d, setD] = useState(null);

  const generate = () => {
    const pSeed = generateSeed(), pSalt = generateSalt();
    const dSeed = generateSeed(), dSalt = generateSalt();
    setD({
      pSeed, pSalt, dSeed, dSalt,
      pCommit: commitHash(pSeed, pSalt),
      dCommit: commitHash(dSeed, dSalt),
      final:   combineSeeds(pSeed, dSeed),
    });
    setStep(1);
  };

  const reset = () => { setStep(0); setD(null); };

  const pOk = d && verifyCommit(d.pSeed, d.pSalt, d.pCommit);
  const dOk = d && verifyCommit(d.dSeed, d.dSalt, d.dCommit);
  const diceResult = d ? (parseInt(d.final.slice(2, 10), 16) % 6) + 1 : null;

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
        <h3 className="text-lg font-bold text-white">🧪 親手體驗 Commit-Reveal</h3>
        <span className="mono-tag text-[10px] text-electric-500">STEP {step} / 3</span>
      </div>

      {/* 進度條 */}
      <div className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-colors
            ${step >= n ? 'bg-electric-500' : 'bg-ink-700'}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="text-center py-8 space-y-4">
          <p className="text-gray-400 text-sm">點擊下方按鈕，親眼看見一局公平遊戲如何在密碼學保護下進行。</p>
          <button onClick={generate}
            className="bg-electric-600 hover:bg-electric-500 text-white font-semibold rounded-xl
                       px-6 py-3 transition-all hover:scale-105 shadow-glow-sm">
            ① 生成隨機種子
          </button>
        </div>
      )}

      {step >= 1 && d && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* 玩家 */}
          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧑</span><span className="font-bold text-white text-sm">玩家</span>
            </div>
            <Field label="seed_P" value={d.pSeed} />
            <Field label="salt_P" value={d.pSalt} />
            {step >= 2 && <Field label="commit_P = keccak256(seed‖salt)" value={d.pCommit} />}
          </div>
          {/* 莊家 */}
          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏦</span><span className="font-bold text-white text-sm">莊家</span>
            </div>
            <Field label="seed_D" value={d.dSeed} hidden={step < 3} />
            <Field label="salt_D" value={d.dSalt} hidden={step < 3} />
            {step >= 2 && <Field label="commit_D = keccak256(seed‖salt)" value={d.dCommit} />}
          </div>
        </div>
      )}

      {/* 階段說明 + 操作 */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400 leading-relaxed">
            ✓ 雙方各自生成 32-byte 種子與 salt。現在計算承諾值 <span className="font-mono text-electric-300">keccak256(seed‖salt)</span>，
            準備提交上鏈——此時對方的種子仍完全保密。
          </p>
          <button onClick={() => setStep(2)}
            className="bg-electric-600 hover:bg-electric-500 text-white font-semibold rounded-xl px-5 py-2.5 transition-colors">
            ② 提交承諾（鎖定）
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-electric-950/40 border border-electric-800 rounded-xl p-3 text-sm text-electric-300">
            🔒 承諾已鎖定。注意莊家的 <strong>seed_D 仍被模糊隱藏</strong>——你無法預測結果，莊家也無法在看到你的種子後反悔。
          </div>
          <button onClick={() => setStep(3)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-5 py-2.5 transition-colors">
            ③ 揭露種子並驗證
          </button>
        </div>
      )}

      {step === 3 && d && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="space-y-2">
            <CheckLine ok={pOk} label="keccak256(seed_P ‖ salt_P) === commit_P" />
            <CheckLine ok={dOk} label="keccak256(seed_D ‖ salt_D) === commit_D" />
          </div>

          <div className="bg-ink-900 border border-electric-900/40 rounded-xl p-4 space-y-2">
            <div className="mono-tag text-[9px] text-gray-600 uppercase">final = keccak256(seed_P ‖ seed_D)</div>
            <div className="font-mono text-sm text-electric-300 break-all">{shortenHash(d.final, 18)}</div>
            <div className="pt-2 border-t border-electric-900/30 flex items-center justify-between">
              <span className="text-sm text-gray-400">範例：取前 4 bytes 對 6 取模 → 骰子點數</span>
              <span className="text-2xl">🎲 {diceResult}</span>
            </div>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-sm text-emerald-300">
            ✅ 雙方承諾皆驗證通過，結果由雙方種子共同決定，無人能單方面操控。任何第三方都能用相同資料重算出相同的 🎲 {diceResult}。
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
        <span className="mono-tag text-xs text-electric-500">DOCUMENTATION</span>
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
          開獎是不是在你下注後才決定。FairChain 用 <span className="text-electric-300 font-semibold">Commit-Reveal 雙盲協議</span>
          ，把「信任」變成「可驗證的數學」。
        </p>
      </section>

      {/* 互動 demo */}
      <InteractiveDemo />

      {/* 三步驟 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">三個步驟</h2>
        {[
          ['Commit 承諾', '雙方各自生成隨機 seed 與 salt，提交 keccak256(seed‖salt) 至鏈上。承諾一旦寫入便無法竄改，且看不出原始種子。'],
          ['Reveal 揭露', '雙方公開明文 seed 與 salt，合約重算 keccak256 比對承諾。只要有人造假，驗證立刻失敗。'],
          ['Verify 驗證', '合約合併雙方種子 final = keccak256(seed_P‖seed_D) 作為隨機源。任何人都能從鏈上讀取資料、重算、比對。'],
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
