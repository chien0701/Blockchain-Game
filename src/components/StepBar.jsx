const STEPS = [
  { key: 'commit', label: '① 承諾', sub: 'Commit' },
  { key: 'reveal', label: '② 揭露', sub: 'Reveal' },
  { key: 'play',   label: '③ 遊玩', sub: 'Play'   },
  { key: 'result', label: '④ 結果', sub: 'Settle'  },
];

export default function StepBar({ currentPhase }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentPhase);

  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const active  = idx === currentIdx;
        const pending = idx > currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center
                               font-bold text-sm border-2 transition-all
                ${done    ? 'bg-emerald-500 border-emerald-500 text-white' : ''}
                ${active  ? 'bg-electric-600 border-electric-400 text-white scale-110 shadow-lg shadow-electric-800' : ''}
                ${pending ? 'bg-ink-800 border-gray-700 text-gray-500' : ''}`}>
                {done ? '✓' : idx + 1}
              </div>
              <div className={`text-xs mt-1 font-medium
                ${active  ? 'text-electric-400' : ''}
                ${done    ? 'text-emerald-400' : ''}
                ${pending ? 'text-gray-600' : ''}`}>
                {step.label}
              </div>
              <div className="text-xs text-gray-600">{step.sub}</div>
            </div>

            {idx < STEPS.length - 1 && (
              <div className={`w-12 sm:w-16 h-0.5 mb-5
                ${idx < currentIdx ? 'bg-emerald-500' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
