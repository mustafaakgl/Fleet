import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '576px',
        sm: '768px',
        md: '992px',
        lg: '1200px',
      },
      colors: {
        brand: {
          primary: '#003366',
          secondary: '#4CAF50',
          warning: '#FF9800',
          danger: '#F44336',
          error: '#F44336',
          info: '#2196F3',
        },
        surface: {
          DEFAULT: '#F5F7FA',
          card: '#FFFFFF',
          border: '#DEE2E6',
        },
        text: {
          primary: '#333333',
          secondary: '#4B5563',
          muted: '#ADB5BD',
        },
        sidebar: {
          bg: '#1E293B',
          text: '#F1F5F9',
          active: '#3B82F6',
          hover: '#334155',
          muted: '#94A3B8',
        },
      },
      spacing: {
        sidebar: '240px',
        topbar: '64px',
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      minHeight: {
        touch: '48px',
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
        heading: ['Inter', 'sans-serif'],
        body: ['Roboto', 'Inter', 'sans-serif'],
      },
      fontSize: {
        h1: ['32px', { lineHeight: '40px', fontWeight: '600' }],
        h2: ['24px', { lineHeight: '32px', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '28px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};

export default config;
