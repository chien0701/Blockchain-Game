import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../context/WalletContext';
import {
  generateSeed, generateSalt, commitHash, combineSeeds, mockTxHash,
} from '../utils/crypto';
import {
  commitGame as contractCommit,
  revealGame as contractReveal,
  placeBetOnChain, settleBetOnChain, getPoolBalance, getTxUrl,
} from '../utils/contract';
import { IS_ON_CHAIN, IS_BETTING } from '../config/contractConfig';

function parseError(err) {
  const msg = err?.message || '';
  if (err?.code === 4001 || msg.includes('user rejected')) return '你取消了交易，請重試。';
  if (msg.includes('insufficient funds')) return '錢包餘額不足（注金 + Gas）。';
  if (msg.includes('PoolInsufficient')) return '莊家資金池不足以支付此注的最大賠付，請降低注金。';
  if (msg.includes('could not detect') || msg.includes('network')) return '網路連線異常，請確認已連上正確網路。';
  if (msg.includes('VITE_')) return '合約地址尚未設定。';
  return `操作失敗：${msg.slice(0, 120)}`;
}

/**
 * 下注版 Commit-Reveal。依環境自動選擇模式：
 *   bet   — FairBet 合約：真實下注、合約判定、自動賠付
 *   plain — GameCommitReveal：僅上鏈公平驗證（無金流）
 *   mock  — 純前端模擬
 */
export function useBetting() {
  const { getSigner, getProvider, address, isMock, isWrongNetwork } = useWallet();

  const [playerSeed] = useState(() => generateSeed());
  const [dealerSeed] = useState(() => generateSeed());
  const [playerSalt] = useState(() => generateSalt());
  const [dealerSalt] = useState(() => generateSalt());
  const playerCommit = commitHash(playerSeed, playerSalt);
  const dealerCommit = commitHash(dealerSeed, dealerSalt);

  const [phase,   setPhase]   = useState('commit');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadUrl, setLoadUrl] = useState('');
  const [error,   setError]   = useState('');

  const [chainGameId,  setChainGameId]  = useState('');
  const [commitTxHash, setCommitTxHash] = useState('');
  const [revealTxHash, setRevealTxHash] = useState('');
  const [finalRandom,  setFinalRandom]  = useState('');
  const [settlement,   setSettlement]   = useState(null);
  const [betParams,    setBetParams]    = useState(null);

  const mode = isMock ? 'mock' : IS_BETTING ? 'bet' : IS_ON_CHAIN ? 'plain' : 'mock';
  const onChain   = mode !== 'mock';
  const isBetting = mode === 'bet';

  const [walletEth, setWalletEth] = useState(null);
  const [poolEth,   setPoolEth]   = useState(null);

  const refreshBalances = useCallback(async () => {
    if (mode !== 'bet' || !address) return;
    try {
      const provider = getProvider();
      const [wbal, pool] = await Promise.all([
        provider.getBalance(address),
        getPoolBalance(provider),
      ]);
      setWalletEth(Number(ethers.formatEther(wbal)));
      setPoolEth(Number(pool));
    } catch { /* 靜默 */ }
  }, [mode, address, getProvider]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  /** bet 模式需傳 { gameType, betType, betValue, amountEth } */
  const commit = async (params) => {
    setError(''); setLoading(true);
    try {
      if (mode === 'bet') {
        setBetParams(params);
        setLoadMsg(`📡 下注 ${params.amountEth} ETH，等待 MetaMask 簽署…`); setLoadUrl('');
        const signer = await getSigner();
        const { betId, txHash } = await placeBetOnChain(signer, {
          ...params, playerCommit, dealerCommit,
        });
        setChainGameId(betId); setCommitTxHash(txHash);
      } else if (mode === 'plain') {
        setLoadMsg('📡 等待 MetaMask 簽署交易…'); setLoadUrl('');
        const signer = await getSigner();
        const { chainGameId: cid, txHash } = await contractCommit(signer, playerCommit, dealerCommit);
        setChainGameId(cid); setCommitTxHash(txHash);
      } else {
        setLoadMsg('🎭 模擬寫入區塊鏈…');
        await new Promise(r => setTimeout(r, 500));
        setCommitTxHash(mockTxHash());
      }
      setPhase('reveal');
    } catch (err) {
      setError(parseError(err));
    } finally { setLoading(false); setLoadUrl(''); }
  };

  const reveal = async () => {
    setError(''); setLoading(true);
    try {
      let combined;
      if (mode === 'bet') {
        setLoadMsg('📡 揭露種子，合約結算中…'); setLoadUrl('');
        const signer = await getSigner();
        const r = await settleBetOnChain(
          signer, chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt,
        );
        setRevealTxHash(r.txHash);
        setSettlement({ won: r.won, outcome: r.outcome, payoutEth: r.payoutEth });
        combined = r.finalRandom;
      } else if (mode === 'plain') {
        setLoadMsg('📡 等待 MetaMask 簽署揭露交易…'); setLoadUrl('');
        const signer = await getSigner();
        const { finalRandom: fr, txHash } = await contractReveal(
          signer, chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt,
        );
        setRevealTxHash(txHash); combined = fr;
      } else {
        setLoadMsg('🎭 驗證雜湊並計算最終隨機數…');
        await new Promise(r => setTimeout(r, 500));
        combined = combineSeeds(playerSeed, dealerSeed);
        setRevealTxHash(mockTxHash());
      }
      setFinalRandom(combined);
      setPhase('ready');
      refreshBalances();
      return combined;
    } catch (err) {
      setError(parseError(err));
      return null;
    } finally { setLoading(false); setLoadUrl(''); }
  };

  /** ⚡ 快速模式：commit + reveal 一鍵連發，中間不停頓 */
  const quickPlay = async (params) => {
    setError(''); setLoading(true);
    try {
      let combined;
      if (mode === 'bet') {
        setBetParams(params);
        setLoadMsg(`📡 1/2 下注 ${params.amountEth} ETH 上鏈中…`);
        const signer = await getSigner();
        const r1 = await placeBetOnChain(signer, { ...params, playerCommit, dealerCommit });
        setChainGameId(r1.betId); setCommitTxHash(r1.txHash);

        setLoadMsg('🎲 2/2 揭露種子，合約結算中…');
        const r2 = await settleBetOnChain(
          signer, r1.betId, playerSeed, playerSalt, dealerSeed, dealerSalt,
        );
        setRevealTxHash(r2.txHash);
        setSettlement({ won: r2.won, outcome: r2.outcome, payoutEth: r2.payoutEth });
        combined = r2.finalRandom;
      } else if (mode === 'plain') {
        setLoadMsg('📡 1/2 承諾上鏈中…');
        const signer = await getSigner();
        const r1 = await contractCommit(signer, playerCommit, dealerCommit);
        setChainGameId(r1.chainGameId); setCommitTxHash(r1.txHash);

        setLoadMsg('🎲 2/2 揭露並計算隨機數…');
        const r2 = await contractReveal(
          signer, r1.chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt,
        );
        setRevealTxHash(r2.txHash);
        combined = r2.finalRandom;
      } else {
        setLoadMsg('🎭 快速開獎中…');
        await new Promise(r => setTimeout(r, 500));
        setCommitTxHash(mockTxHash()); setRevealTxHash(mockTxHash());
        combined = combineSeeds(playerSeed, dealerSeed);
      }
      setFinalRandom(combined);
      setPhase('ready');
      refreshBalances();
      return combined;
    } catch (err) {
      setError(parseError(err));
      return null;
    } finally { setLoading(false); setLoadUrl(''); }
  };

  return {
    playerSeed, playerSalt, playerCommit,
    dealerSeed, dealerSalt, dealerCommit,
    phase, loading, loadMsg, loadUrl, error,
    dismissError: () => setError(''),
    chainGameId, commitTxHash, revealTxHash, finalRandom,
    settlement, betParams,
    walletEth, poolEth, refreshBalances,
    onChain, isBetting, isMock, isWrongNetwork,
    commit, reveal, quickPlay,
  };
}
