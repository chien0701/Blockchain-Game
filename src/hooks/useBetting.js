import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  generateSeed, generateSalt, commitHash, combineSeeds, mockTxHash,
} from '../utils/crypto';
import {
  commitGame as contractCommit,
  revealGame as contractReveal,
  placeBetOnChain, settleBetOnChain, getTxUrl,
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
  const { getSigner, isMock, isWrongNetwork } = useWallet();

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
        await new Promise(r => setTimeout(r, 1200));
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
        await new Promise(r => setTimeout(r, 1200));
        combined = combineSeeds(playerSeed, dealerSeed);
        setRevealTxHash(mockTxHash());
      }
      setFinalRandom(combined);
      setPhase('ready');
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
    onChain, isBetting, isMock, isWrongNetwork,
    commit, reveal,
  };
}
