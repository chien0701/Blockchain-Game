import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { SUPPORTED_CHAIN_ID, CURRENT_CHAIN } from '../config/contractConfig';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address,     setAddress]     = useState(null);
  const [isConnected, setConnected]   = useState(false);
  const [chainId,     setChainId]     = useState(null);
  const [isMock,      setIsMock]      = useState(false);  // 模擬模式旗標

  // ── 網路與帳號變更監聽 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAddress(null);
        setConnected(false);
        setChainId(null);
      } else {
        setAddress(accounts[0]);
      }
    };

    const onChainChanged = (chainHex) => {
      setChainId(parseInt(chainHex, 16));
    };

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged',    onChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged',    onChainChanged);
    };
  }, []);

  // ── 連接錢包 ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (window.ethereum) {
      try {
        const provider  = new ethers.BrowserProvider(window.ethereum);
        const accounts  = await provider.send('eth_requestAccounts', []);
        const { chainId: cid } = await provider.getNetwork();

        setAddress(accounts[0]);
        setConnected(true);
        setChainId(Number(cid));
        setIsMock(false);
        return;
      } catch (err) {
        // 使用者拒絕 → fallback 到模擬模式
        console.warn('MetaMask 連接被拒絕，使用模擬錢包', err);
      }
    }

    // 無 MetaMask 或被拒絕 → 模擬模式
    const mock = ethers.hexlify(ethers.randomBytes(20));
    setAddress(mock);
    setConnected(true);
    setChainId(null);
    setIsMock(true);
  }, []);

  // ── 取得 Signer（給合約呼叫用）──────────────────────────────────────────────
  /**
   * 回傳 ethers.Signer，若是模擬模式則拋出錯誤
   * 呼叫前應先確認 isConnected && !isMock
   */
  const getSigner = useCallback(async () => {
    if (isMock) throw new Error('模擬錢包無法簽署交易，請安裝 MetaMask');
    if (!window.ethereum) throw new Error('找不到 MetaMask');
    const provider = new ethers.BrowserProvider(window.ethereum);
    return provider.getSigner();
  }, [isMock]);

  /**
   * 回傳唯讀 Provider（查詢合約狀態用）
   */
  const getProvider = useCallback(() => {
    if (!window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  // ── 網路切換 ────────────────────────────────────────────────────────────────
  /**
   * 要求 MetaMask 切換到正確的網路（SUPPORTED_CHAIN_ID）
   */
  const switchToSupportedNetwork = useCallback(async () => {
    if (!window.ethereum) throw new Error('找不到 MetaMask');
    const chainHex = `0x${SUPPORTED_CHAIN_ID.toString(16)}`;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
    } catch (err) {
      // 4902 = 網路不存在，嘗試加入
      if (err.code === 4902 && SUPPORTED_CHAIN_ID === 421614) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:          chainHex,
            chainName:        CURRENT_CHAIN.name,
            rpcUrls:          [CURRENT_CHAIN.rpcUrl],
            nativeCurrency:   { name: 'ETH', symbol: 'ETH', decimals: 18 },
            blockExplorerUrls: CURRENT_CHAIN.explorerUrl
              ? [CURRENT_CHAIN.explorerUrl]
              : [],
          }],
        });
      } else {
        throw err;
      }
    }
  }, []);

  // ── 斷開連接 ────────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setAddress(null);
    setConnected(false);
    setChainId(null);
    setIsMock(false);
  }, []);

  // ── 衍生狀態 ────────────────────────────────────────────────────────────────
  const isWrongNetwork = isConnected && !isMock && chainId !== null
    && chainId !== SUPPORTED_CHAIN_ID;

  return (
    <WalletContext.Provider value={{
      // 基本狀態
      address,
      isConnected,
      chainId,
      isMock,
      isWrongNetwork,

      // 操作
      connect,
      disconnect,
      getSigner,
      getProvider,
      switchToSupportedNetwork,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet 必須在 WalletProvider 內使用');
  return ctx;
};
