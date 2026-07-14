import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17202A',
        line: '#E2E8F0',
        paper: '#F7F8FB',
        accent: '#087F6D',
        mint: '#087F6D',
        signal: '#2563EB',
        sun: '#D97706',
        warn: '#A45500',
      },
      boxShadow: {
        panel: '0 16px 45px rgba(23, 32, 42, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
