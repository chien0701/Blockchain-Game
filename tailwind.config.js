/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── 品牌主色：電光藍 ──
        electric: {
          50:  '#eaf1ff',
          100: '#d0e0ff',
          200: '#a6c4ff',
          300: '#6f9dff',
          400: '#3d77ff',
          500: '#1a5cff',  // primary
          600: '#0f47e6',
          700: '#0f3ab4',
          800: '#132f8c',
          900: '#152a6e',
          950: '#0d1942',
        },
        // ── 深色背景階 ──
        ink: {
          950: '#04060c',
          900: '#070b14',
          850: '#0a0f1c',
          800: '#0e1424',
          700: '#141b2e',
          600: '#1c2540',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow:    '0 0 20px rgba(26, 92, 255, 0.45)',
        'glow-sm': '0 0 10px rgba(26, 92, 255, 0.35)',
        'glow-lg': '0 0 40px rgba(26, 92, 255, 0.5)',
      },
      keyframes: {
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.85' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s ease-out forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'scan':       'scan 3s linear infinite',
        'shimmer':    'shimmer 2.5s linear infinite',
        'flicker':    'flicker 3s ease-in-out infinite',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(26,92,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(26,92,255,0.06) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
