export default function Footer() {
  return (
    <footer className="border-t border-electric-900/40 bg-ink-900 py-6 mt-12">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row
                      items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <span>⛓️</span>
          <span>FairChain — 區塊鏈公平遊戲驗證系統</span>
        </div>
        <div className="flex items-center gap-3 mono-tag text-[11px] text-gray-600">
          <span>COMMIT-REVEAL</span>
          <span className="text-electric-900">●</span>
          <span>KECCAK256</span>
          <span className="text-electric-900">●</span>
          <span>SALT</span>
        </div>
      </div>
    </footer>
  );
}
