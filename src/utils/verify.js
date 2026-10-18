/**
 * verify.js — 驗證邏輯（純函數，不碰網路與 UI，可單元測試）
 *
 * 每一項檢查回傳 { id, label, status, claimed, recomputed, reason }
 *   status：'pass' | 'fail' | 'unavailable'
 * 判定：任一 fail → 'failed'；任一 unavailable → 'incomplete'；全部 pass → 'verified'
 * 「incomplete」不是通過——缺證據時一律如實標示，不以部分結果冒充完整驗證。
 */

import { commitHash, combineSeeds } from './crypto';
import { resolveBet } from '../games/random';
import { replayBlackjack, mastermindSecret } from './gameLogic';
import { BET_STATE_V3, BET_STATE_V2 } from '../config/abi';

export const ZERO_HASH = '0x' + '0'.repeat(64);

const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function check(id, label, claimed, recomputed) {
  return { id, label, claimed: String(claimed), recomputed: String(recomputed), status: eq(claimed, recomputed) ? 'pass' : 'fail' };
}

export function unavailable(id, label, reason) {
  return { id, label, status: 'unavailable', reason };
}

export function verdictOf(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'failed';
  if (checks.some((c) => c.status === 'unavailable')) return 'incomplete';
  return 'verified';
}

function resultChecks(bet, fr) {
  const r = resolveBet(bet.gameType, bet.betType, bet.param, bet.amountWei, fr);
  if (!r) return [check('gameType', '遊戲類型可識別', 'gameType 0–8', bet.gameType)];
  return [
    check('outcome', '開獎結果 = 依規則由 finalRandom 重算', bet.outcome, r.outcome),
    check('payout', '賠付金額（wei）= 依注型、參數、注金重算', bet.payoutWei, r.payout.toString()),
  ];
}

/**
 * v3 下注局。blockHash 由驗證者自行向 RPC 取得（不採信合約記錄的 entropy）；
 * 取不到時 entropy 一項為 unavailable，整體為 incomplete。
 */
export function verifyBetV3(bet, blockHash) {
  if (bet.state === BET_STATE_V3.None)   return { verdict: 'not-found', checks: [] };
  if (bet.state === BET_STATE_V3.Placed) return { verdict: 'pending', checks: [] };
  if (bet.state === BET_STATE_V3.Expired) {
    const checks = [
      check('noRandom', '過期局沒有開獎（finalRandom 為空）', bet.finalRandom, ZERO_HASH),
      check('noPayout', '過期局沒有賠付', bet.payoutWei, '0'),
    ];
    return { verdict: verdictOf(checks) === 'verified' ? 'expired' : 'failed', checks };
  }

  const entropy = blockHash || bet.entropy;
  const fr = combineSeeds(bet.playerSeed, entropy);
  const checks = [
    check('commit', '玩家承諾 = keccak256(seed‖salt)', bet.playerCommit, commitHash(bet.playerSeed, bet.playerSalt)),
    blockHash
      ? check('entropy', `熵 = 區塊 #${bet.revealBlock} 的雜湊（向 RPC 獨立取得）`, bet.entropy, blockHash)
      : unavailable('entropy', `熵 = 區塊 #${bet.revealBlock} 的雜湊`, '無法從 RPC 取得該區塊，無法獨立確認熵的來源'),
    check('finalRandom', 'finalRandom = keccak256(seed‖熵)', bet.finalRandom, fr),
    ...resultChecks(bet, fr),
  ];
  return { verdict: verdictOf(checks), checks };
}

const SEED_REASON = {
  'not-found':       '在結算時間附近的區塊找不到結算交易',
  'rpc-limit':       'RPC 拒絕日誌查詢（範圍或頻率限制）',
  'rpc-unreachable': 'RPC 連線失敗或逾時',
  'rpc-error':       'RPC 回傳錯誤',
};

/** v2 舊局：種子只在結算交易 calldata；v2 的過期局也被記成 Settled，需以 finalRandom 為空辨識 */
export function verifyBetV2(bet) {
  if (bet.state === BET_STATE_V2.None)   return { verdict: 'not-found', checks: [] };
  if (bet.state === BET_STATE_V2.Placed) return { verdict: 'pending', checks: [] };
  if (eq(bet.finalRandom, ZERO_HASH)) {
    const checks = [check('noPayout', '過期局沒有賠付', bet.payoutWei, '0')];
    return { verdict: verdictOf(checks) === 'verified' ? 'expired' : 'failed', checks };
  }

  const checks = [];
  let fr = bet.finalRandom;
  if (bet.seeds) {
    const s = bet.seeds;
    fr = combineSeeds(s.playerSeed, s.dealerSeed);
    checks.push(
      check('commitP', '玩家承諾 = keccak256(seed‖salt)', bet.playerCommit, commitHash(s.playerSeed, s.playerSalt)),
      check('commitD', '莊家承諾 = keccak256(seed‖salt)', bet.dealerCommit, commitHash(s.dealerSeed, s.dealerSalt)),
      check('finalRandom', 'finalRandom = keccak256(seedP‖seedD)', bet.finalRandom, fr),
    );
  } else {
    const reason = SEED_REASON[bet.seedsStatus] || '未取得種子';
    checks.push(
      unavailable('commitP', '玩家承諾 = keccak256(seed‖salt)', reason),
      unavailable('commitD', '莊家承諾 = keccak256(seed‖salt)', reason),
      unavailable('finalRandom', 'finalRandom = keccak256(seedP‖seedD)', reason),
    );
  }
  checks.push(...resultChecks(bet, fr));
  return { verdict: verdictOf(checks), checks };
}

/* ── 本地紀錄（localStorage）：依遊戲與協議版本分派 ─────────────────────── */

const BET_GAMES = new Set(['dice', 'roulette', 'slots', 'crash', 'limbo', 'wheel', 'plinko', 'revolver']);

const sameCards = (a = [], b = []) =>
  a.length === b.length && a.every((c, i) => c.suit === b[i].suit && c.value === b[i].value);

function dualSeedChecks(rec) {
  return [
    check('commitP', '玩家承諾 = keccak256(seed‖salt)', rec.playerCommit, commitHash(rec.playerSeed, rec.playerSalt)),
    check('commitD', '莊家承諾 = keccak256(seed‖salt)', rec.dealerCommit, commitHash(rec.dealerSeed, rec.dealerSalt)),
    check('finalRandom', 'finalRandom = keccak256(seedP‖seedD)', rec.finalRandom, combineSeeds(rec.playerSeed, rec.dealerSeed)),
  ];
}

export function verifyLocalRecord(rec) {
  if (!rec?.playerCommit) return { verdict: 'not-applicable', checks: [], kind: 'pow' };

  if (rec.protocol === 'fb3') {
    const fr = combineSeeds(rec.playerSeed, rec.entropy);
    const checks = [
      check('commit', '玩家承諾 = keccak256(seed‖salt)', rec.playerCommit, commitHash(rec.playerSeed, rec.playerSalt)),
      unavailable('entropy', '熵來自下注後下一個區塊的雜湊',
        rec.onChain ? '本地紀錄無法確認熵的來源，請改用「鏈上・下注局」驗證' : '模擬局：熵由本機產生，不是區塊雜湊'),
      check('finalRandom', 'finalRandom = keccak256(seed‖熵)', rec.finalRandom, fr),
      ...resultChecks({ ...rec, gameType: rec.gameTypeId }, fr),
    ];
    return { verdict: verdictOf(checks), checks, kind: 'bet' };
  }

  if (rec.gameType === 'blackjack') {
    const checks = dualSeedChecks(rec);
    if (Array.isArray(rec.playerHand) && rec.playerHand.length >= 2) {
      const rng = rec.rng ?? 1;
      const replay = replayBlackjack(rec.finalRandom, rec.playerHand.length - 2, rng);
      checks.push(
        check('playerHand', '玩家手牌 = 依亂數與補牌次數重播', JSON.stringify(rec.playerHand), JSON.stringify(replay.playerHand)),
        check('dealerHand', '莊家手牌 = 依規則補到 17 點以上重播', JSON.stringify(rec.dealerHand), JSON.stringify(replay.dealerHand)),
        check('winner', '勝負 = 重播後的完整手牌判定', rec.result?.winner, replay.result.winner),
      );
      return { verdict: verdictOf(checks), checks, kind: 'blackjack', replay, sameHands: sameCards(rec.playerHand, replay.playerHand) };
    }
    checks.push(unavailable('winner', '勝負重播', '舊紀錄未保存手牌，無法重播玩家行動'));
    return { verdict: verdictOf(checks), checks, kind: 'blackjack' };
  }

  if (rec.gameType === 'mastermind') {
    const checks = dualSeedChecks(rec);
    if (Array.isArray(rec.guesses)) {
      const secret = mastermindSecret(rec.dealerSeed, 4, 6, rec.rng ?? 1);
      const solved = rec.guesses.some((g) => g.length === secret.length && g.every((p, i) => p === secret[i]));
      checks.push(check('winner', '勝負 = 由莊家種子還原密碼後比對全部猜測', rec.result?.winner, solved ? 'player' : 'dealer'));
    } else {
      checks.push(unavailable('winner', '勝負重播', '舊紀錄未保存猜測序列'));
    }
    return { verdict: verdictOf(checks), checks, kind: 'mastermind' };
  }

  if (BET_GAMES.has(rec.gameType)) {
    const checks = [
      ...dualSeedChecks(rec),
      unavailable('outcome', '開獎結果重算', '舊版紀錄未保存注型與結果數值，且使用已停用的雙種子協議'),
    ];
    return { verdict: verdictOf(checks), checks, kind: 'legacy-bet' };
  }

  return { verdict: 'not-applicable', checks: [], kind: 'unknown' };
}
