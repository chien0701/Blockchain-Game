import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { generateSeed, generateSalt, commitHash, combineSeeds, mockTxHash } from '../utils/crypto';
import {
  placeBetOnChain, settleBetOnChain, waitForBlock, findBetIdByCommit, getBetV3, getPoolBalance,
} from '../utils/contract';
import { savePendingBet, updatePendingBet, removePendingBet } from '../utils/storage';
import { resolveBet, netResult, GAME_TYPE_NAMES } from '../games/random';
import { IS_BETTING, FAIRBET_ADDRESS, SUPPORTED_CHAIN_ID } from '../config/contractConfig';

export function parseError(err) {
  const msg = err?.shortMessage || err?.message || '';
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || msg.includes('user rejected')) return '你取消了交易。';
  if (msg.includes('insufficient funds')) return '錢包餘額不足（注金 + Gas）。';
  if (msg.includes('PoolInsufficient')) return '莊家資金池不足以支付此注的最大賠付，請降低注金。';
  if (msg.includes('CommitReused')) return '這組承諾已用過，請重新開一局。';
  if (msg.includes('RevealWindowClosed')) return '已超過 256 個區塊的揭露期限，這一局只能宣告過期。';
  if (msg.includes('TooEarly')) return '開獎區塊尚未產生，請稍候再試。';
  if (msg.includes('逾時')) return msg;
  if (msg.includes('could not detect') || msg.includes('network')) return '網路連線異常，請確認已連上正確網路。';
  return `操作失敗：${msg.slice(0, 120)}`;
}

const isRejected = (err) => err?.code === 4001 || err?.code === 'ACTION_REJECTED';

/**
 * 下注流程（FairBet v3）。
 *   bet  — 真實下注：玩家只承諾自己的種子；熵來自下注後下一個區塊的雜湊，由合約讀取
 *   mock — 模擬：同一套協議，熵在承諾之後才由本機隨機產生
 *
 * 下注成功後，種子與局號寫入 localStorage（pending），重整或結算失敗都能續做同一局；
 * 已下注的局重試時只會結算，不會再下一注。
 */
export function useBetting() {
  const { getSigner, getProvider, address, isConnected, isMock, isWrongNetwork } = useWallet();

  const [playerSeed] = useState(() => generateSeed());
  const [playerSalt] = useState(() => generateSalt());
  const playerCommit = commitHash(playerSeed, playerSalt);

  const [phase,   setPhase]   = useState('commit');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [error,   setError]   = useState('');

  const [chainGameId,  setChainGameId]  = useState('');
  const [revealBlock,  setRevealBlock]  = useState(null);
  const [commitTxHash, setCommitTxHash] = useState('');
  const [revealTxHash, setRevealTxHash] = useState('');
  const [entropy,      setEntropy]      = useState('');
  const [finalRandom,  setFinalRandom]  = useState('');
  const [settlement,   setSettlement]   = useState(null);
  const [consistent,   setConsistent]   = useState(null);
  const [betParams,    setBetParams]    = useState(null);

  const placed = useRef(null);

  const mode = IS_BETTING && isConnected && !isMock ? 'bet' : 'mock';
  const mockReason = !IS_BETTING ? '未設定 FairBet v3 地址' : isMock ? '未偵測到 MetaMask' : '未連接錢包';
  const isBetting = mode === 'bet';

  const [walletEth, setWalletEth] = useState(null);
  const [poolEth,   setPoolEth]   = useState(null);

  const refreshBalances = useCallback(async () => {
    if (mode !== 'bet' || !address) return;
    try {
      const provider = getProvider();
      const [wbal, pool] = await Promise.all([provider.getBalance(address), getPoolBalance(provider)]);
      setWalletEth(Number(ethers.formatEther(wbal)));
      setPoolEth(Number(pool));
    } catch { /* 餘額僅供顯示 */ }
  }, [mode, address, getProvider]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  const amountWeiOf = (p) => ethers.parseEther(String(p.amountEth || '0')).toString();

  const place = async (params) => {
    if (placed.current) return placed.current;
    setBetParams(params);

    if (mode === 'mock') {
      setLoadMsg('🎭 模擬下注（未上鏈）…');
      await new Promise((r) => setTimeout(r, 400));
      placed.current = { betId: '', revealBlock: null, txHash: mockTxHash(), amountWei: amountWeiOf(params), params };
    } else {
      setLoadMsg(`📡 下注 ${params.amountEth} ETH，等待錢包簽署…`);
      const signer = await getSigner();
      savePendingBet({
        commit: playerCommit, seed: playerSeed, salt: playerSalt,
        chainId: SUPPORTED_CHAIN_ID, contract: FAIRBET_ADDRESS,
        gameType: params.gameType, gameTypeName: GAME_TYPE_NAMES[params.gameType],
        betType: params.betType, param: String(params.param ?? 0), amountEth: String(params.amountEth),
        status: 'signing', createdAt: new Date().toISOString(),
      });
      try {
        const r = await placeBetOnChain(signer, { ...params, playerCommit });
        placed.current = { ...r, params };
      } catch (err) {
        if (isRejected(err)) { removePendingBet(playerCommit); throw err; }
        const provider = getProvider();
        const betId = await findBetIdByCommit(provider, playerCommit).catch(() => null);
        if (!betId) throw err;
        const b = await getBetV3(provider, betId);
        placed.current = { betId, revealBlock: b.revealBlock, txHash: '', amountWei: b.amountWei, params };
      }
      updatePendingBet(playerCommit, {
        status: 'placed', betId: placed.current.betId,
        revealBlock: placed.current.revealBlock, placeTxHash: placed.current.txHash,
      });
    }
    setChainGameId(placed.current.betId);
    setRevealBlock(placed.current.revealBlock);
    setCommitTxHash(placed.current.txHash);
    return placed.current;
  };

  const settle = async () => {
    const p = placed.current;
    let s;
    if (mode === 'mock') {
      setLoadMsg('🎭 產生模擬區塊熵並開獎…');
      await new Promise((r) => setTimeout(r, 400));
      const ent = ethers.hexlify(ethers.randomBytes(32));
      const fr = combineSeeds(playerSeed, ent);
      const r = resolveBet(p.params.gameType, p.params.betType, p.params.param ?? 0, p.amountWei, fr);
      s = { entropy: ent, finalRandom: fr, outcome: r.outcome, payoutWei: r.payout.toString(),
            payoutEth: ethers.formatEther(r.payout), txHash: mockTxHash() };
      setConsistent(null);
    } else {
      const provider = getProvider();
      if (p.revealBlock) {
        await waitForBlock(provider, p.revealBlock, {
          onTick: (n) => setLoadMsg(n >= p.revealBlock
            ? '⛓️ 開獎區塊已產生，等待錢包簽署結算…'
            : `⏳ 等待開獎區塊 #${p.revealBlock} 產生（目前 #${n}）…`),
        });
      }
      const signer = await getSigner();
      s = await settleBetOnChain(signer, p.betId, playerSeed, playerSalt);
      removePendingBet(playerCommit);
      const r = resolveBet(p.params.gameType, p.params.betType, p.params.param ?? 0, p.amountWei, s.finalRandom);
      setConsistent(r.outcome === s.outcome && r.payout.toString() === s.payoutWei
        && combineSeeds(playerSeed, s.entropy) === s.finalRandom);
    }
    setRevealTxHash(s.txHash);
    setEntropy(s.entropy);
    setFinalRandom(s.finalRandom);
    setSettlement({
      outcome: s.outcome, payoutWei: s.payoutWei, payoutEth: s.payoutEth,
      amountWei: p.amountWei, net: netResult(s.payoutWei, p.amountWei),
    });
    setPhase('ready');
    refreshBalances();
    return s.finalRandom;
  };

  const run = async (steps) => {
    setError(''); setLoading(true);
    try { return await steps(); }
    catch (err) { setError(parseError(err)); return null; }
    finally { setLoading(false); }
  };

  const commit = (params) => run(async () => { await place(params); setPhase('reveal'); });
  const reveal = () => run(settle);
  const quickPlay = (params) => run(async () => { await place(params); return settle(); });

  /** 寫入本地紀錄所需的協議欄位（各遊戲頁共用） */
  const recordFields = () => ({
    protocol: 'fb3', rng: 2, onChain: isBetting,
    chainId: isBetting ? SUPPORTED_CHAIN_ID : null, contract: isBetting ? FAIRBET_ADDRESS : null,
    chainGameId, gameTypeId: betParams?.gameType, betType: betParams?.betType, param: String(betParams?.param ?? 0),
    amountWei: settlement?.amountWei, payoutWei: settlement?.payoutWei, outcome: settlement?.outcome,
    playerSeed, playerSalt, playerCommit, revealBlock, entropy, finalRandom,
    betAmount: isBetting ? betParams?.amountEth : null, payout: isBetting ? settlement?.payoutEth : null,
    commitTxHash, revealTxHash,
  });

  return {
    playerSeed, playerSalt, playerCommit,
    phase, loading, loadMsg, loadUrl: '', error,
    dismissError: () => setError(''),
    chainGameId, revealBlock, commitTxHash, revealTxHash, entropy, finalRandom,
    settlement, consistent, betParams,
    walletEth, poolEth, refreshBalances,
    onChain: isBetting, isBetting, isMock, mockReason, isWrongNetwork,
    commit, reveal, quickPlay, recordFields,
  };
}
