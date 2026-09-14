/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        windsmp: {
          primary: '#AEC6CF',
          'primary-light': '#c8dae1',
          'primary-dark': '#8aafbf',
          secondary: '#6A93B0',
          'secondary-light': '#8ab0c8',
          accent: '#7eb8d8',
          dark: '#1a1d23',
          darker: '#111318',
          darkest: '#0b0d12',
          card: '#1e2128',
          'card-light': '#252930',
          border: '#2a2e38',
          'border-light': '#353a47',
          glow: 'rgba(174, 198, 207, 0.12)',
          'glow-strong': 'rgba(174, 198, 207, 0.25)',
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(174, 198, 207, 0.08), 0 0 4px rgba(174, 198, 207, 0.05)',
        'glow-md': '0 0 25px rgba(174, 198, 207, 0.12), 0 1px 3px rgba(0,0,0,0.3)',
        'glow-lg': '0 0 40px rgba(174, 198, 207, 0.18), 0 2px 8px rgba(0,0,0,0.4)',
        'glow-xl': '0 8px 32px rgba(0,0,0,0.5), 0 0 48px rgba(174, 198, 207, 0.1)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 20px rgba(174, 198, 207, 0.03)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-right': 'slideRight 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(174, 198, 207, 0.08)' },
          '50%': { boxShadow: '0 0 25px rgba(174, 198, 207, 0.15)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};
