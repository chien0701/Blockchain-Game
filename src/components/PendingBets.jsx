import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { listPendingBets, updatePendingBet, removePendingBet } from '../utils/storage';
import { findBetIdByCommit, getBetV3, settleBetOnChain, waitForBlock, getReadOnlyProvider, BetState } from '../utils/contract';
import { parseError } from '../hooks/useBetting';
import { FAIRBET_ADDRESS, SUPPORTED_CHAIN_ID } from '../config/contractConfig';

const WINDOW = 256;

/**
 * 未完成的下注：placeBet 已送出但尚未結算的局（重整、拒簽、斷線、快速模式中途失敗）。
 * 以本機保存的種子續做同一局，不會重新下注。
 */
export default function PendingBets() {
  const { getSigner, address, isMock } = useWallet();
  const [items,  setItems]  = useState(() => listPendingBets());
  const [head,   setHead]   = useState(null);
  const [status, setStatus] = useState({});

  const reload = () => setItems(listPendingBets());

  const refresh = useCallback(async () => {
    if (!FAIRBET_ADDRESS || !items.length) return;
    try {
      const provider = getReadOnlyProvider();
      setHead(await provider.getBlockNumber());
      for (const p of items) {
        if (p.contract?.toLowerCase() !== FAIRBET_ADDRESS.toLowerCase() || p.chainId !== SUPPORTED_CHAIN_ID) continue;
        const betId = p.betId || await findBetIdByCommit(provider, p.commit);
        if (!betId) continue;
        const b = await getBetV3(provider, betId);
        if (b.state === BetState.Settled || b.state === BetState.Expired) { removePendingBet(p.commit); continue; }
        if (b.state !== BetState.Placed) continue;
        if (!p.betId || !p.revealBlock) updatePendingBet(p.commit, { status: 'placed', betId, revealBlock: b.revealBlock });
      }
      reload();
    } catch { /* 讀取失敗時保留原清單 */ }
  }, [items.length]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!items.length) return null;

  const settle = async (p) => {
    setStatus((s) => ({ ...s, [p.commit]: { busy: true, msg: '準備結算…' } }));
    try {
      const provider = getReadOnlyProvider();
      await waitForBlock(provider, p.revealBlock, {
        onTick: (n) => setStatus((s) => ({ ...s, [p.commit]: { busy: true, msg: n >= p.revealBlock ? '等待錢包簽署…' : `等待區塊 #${p.revealBlock}（目前 #${n}）` } })),
      });
      const r = await settleBetOnChain(await getSigner(), p.betId, p.seed, p.salt);
      removePendingBet(p.commit);
      setStatus((s) => ({ ...s, [p.commit]: { busy: false, msg: `已結算：賠付 ${r.payoutEth} ETH` } }));
      reload();
    } catch (err) {
      setStatus((s) => ({ ...s, [p.commit]: { busy: false, msg: parseError(err) } }));
    }
  };

  const discard = (p) => { removePendingBet(p.commit); reload(); };

  return (
    <div className="bg-amber-950/30 border border-amber-800 rounded-2xl p-5 space-y-3">
      <div className="font-bold text-amber-200">⏳ 未完成的下注（{items.length}）</div>
      <p className="text-xs text-amber-300/80">
        這些局已送出下注但還沒結算。種子保存在本瀏覽器，請在開獎區塊後 {WINDOW} 個區塊內結算，逾期注金會留在資金池。
      </p>
      {items.map((p) => {
        const sameContract = p.contract?.toLowerCase() === FAIRBET_ADDRESS.toLowerCase() && p.chainId === SUPPORTED_CHAIN_ID;
        const expired = head != null && p.revealBlock && head > p.revealBlock + WINDOW;
        const st = status[p.commit];
        return (
          <div key={p.commit} className="bg-ink-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-[12rem]">
              <div className="text-white">{p.gameTypeName} · {p.amountEth} ETH {p.betId && <span className="text-gray-500">· Bet #{p.betId}</span>}</div>
              <div className="text-xs text-gray-500">
                {!sameContract ? '屬於其他合約版本或網路'
                  : !p.betId ? '尚未確認是否成功下注'
                  : expired ? '已超過揭露期限'
                  : p.revealBlock ? `開獎區塊 #${p.revealBlock}` : ''}
                {st?.msg && <span className="text-amber-300"> · {st.msg}</span>}
              </div>
            </div>
            {sameContract && p.betId && !expired && (
              <button disabled={st?.busy || isMock || !address} onClick={() => settle(p)}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-ink-800 disabled:text-gray-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
                {isMock || !address ? '連接錢包後結算' : '結算'}
              </button>
            )}
            {(!sameContract || expired || !p.betId) && (
              <button onClick={() => discard(p)} className="bg-ink-800 hover:bg-ink-700 text-gray-300 rounded-lg px-3 py-1.5 text-xs">移除</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
