/** size: 'sm' | 'md' | 'lg'  delay: stagger index for animation */
export default function PlayingCard({ suit, value, hidden = false, size = 'md', delay = 0 }) {
  const isRed = suit === '♥' || suit === '♦';

  const dim = {
    sm: 'w-10 h-14 text-xs',
    md: 'w-14 h-20 text-sm',
    lg: 'w-[4.5rem] h-24 text-base',
  }[size];

  const style = { animationDelay: `${delay * 120}ms` };

  if (hidden) {
    return (
      <div
        style={style}
        className={`${dim} rounded-lg border-2 border-indigo-700
                     bg-indigo-900 flex items-center justify-center
                     shadow-lg shadow-indigo-950 animate-fade-in-up`}
      >
        <span className="text-indigo-600 text-xl">?</span>
      </div>
    );
  }

  return (
    <div
      style={style}
      className={`${dim} rounded-lg border-2 border-gray-200 bg-white
                   flex flex-col justify-between p-1
                   shadow-lg shadow-black/40 animate-fade-in-up`}
    >
      <div className={`font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        <div>{value}</div>
        <div>{suit}</div>
      </div>
      <div className={`text-center text-lg font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {suit}
      </div>
      <div className={`font-bold leading-none rotate-180 text-right
                       ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        <div>{value}</div>
        <div>{suit}</div>
      </div>
    </div>
  );
}
