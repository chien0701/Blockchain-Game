import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  generateSeed, generateSalt, commitHash, combineSeeds, mockTxHash,
} from '../utils/crypto';
import {
  commitGame as contractCommit,
  revealGame as contractReveal,
  getTxUrl,
} from '../utils/contract';
import { IS_ON_CHAIN } from '../config/contractConfig';

function parseError(err) {
  const msg = err?.message || '';
  if (err?.code === 4001 || msg.includes('user rejected')) return '你取消了交易，請重試。';
  if (msg.includes('insufficient funds')) return '錢包餘額不足以支付 Gas 費用。';
  if (msg.includes('could not detect') || msg.includes('network')) return '網路連線異常，請確認已連上正確網路。';
  if (msg.includes('VITE_CONTRACT_ADDRESS')) return '尚未設定合約地址。';
  return `操作失敗：${msg.slice(0, 120)}`;
}

export function useCommitReveal() {
  const { getSigner, isMock, isWrongNetwork } = useWallet();

  const [playerSeed] = useState(() => generateSeed());
  const [dealerSeed] = useState(() => generateSeed());
  const [playerSalt] = useState(() => generateSalt());
  const [dealerSalt] = useState(() => generateSalt());
  const playerCommit = commitHash(playerSeed, playerSalt);
  const dealerCommit = commitHash(dealerSeed, dealerSalt);

  const [phase,   setPhase]   = useState('commit'); // commit | reveal | ready
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadUrl, setLoadUrl] = useState('');
  const [error,   setError]   = useState('');

  const [chainGameId,  setChainGameId]  = useState('');
  const [commitTxHash, setCommitTxHash] = useState('');
  const [revealTxHash, setRevealTxHash] = useState('');
  const [finalRandom,  setFinalRandom]  = useState('');

  const onChain = IS_ON_CHAIN && !isMock;

  const commit = async () => {
    setError(''); setLoading(true);
    try {
      if (onChain) {
        setLoadMsg('📡 等待 MetaMask 簽署交易…'); setLoadUrl('');
        const signer = await getSigner();
        const { chainGameId: cid, txHash } = await contractCommit(signer, playerCommit, dealerCommit);
        setLoadMsg('⏳ 等待區塊確認…'); setLoadUrl(getTxUrl(txHash));
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
      if (onChain) {
        setLoadMsg('📡 等待 MetaMask 簽署揭露交易…'); setLoadUrl('');
        const signer = await getSigner();
        const { finalRandom: fr, txHash } = await contractReveal(
          signer, chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt
        );
        setLoadMsg('⏳ 等待區塊確認…'); setLoadUrl(getTxUrl(txHash));
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
    onChain, isMock, isWrongNetwork,
    commit, reveal,
  };
}
