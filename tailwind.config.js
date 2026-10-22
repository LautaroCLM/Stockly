/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#060A13',
        surface: {
          DEFAULT: '#0B1220',
          hover: '#101A2E',
          2: '#101A2E',
          3: '#17233B',
        },
        border: {
          DEFAULT: '#1C2742',
          light: '#2A3B63',
          active: '#3A4E7A',
        },
        text: {
          DEFAULT: '#E8EEFB',
          primary: '#E8EEFB',
          secondary: '#A1B1D1',
          muted: '#7C8AA8',
          dim: '#4F5E7B',
        },
        primary: {
          DEFAULT: '#2F6BFF',
          hover: '#1E56E0',
          light: '#6190FF',
          soft: 'rgba(47, 107, 255, 0.15)',
        },
        accent: {
          DEFAULT: '#27D3F5',
          hover: '#18B7D8',
          soft: 'rgba(39, 211, 245, 0.15)',
        },
        success: {
          DEFAULT: '#34D399',
          soft: 'rgba(52, 211, 153, 0.15)',
        },
        warning: {
          DEFAULT: '#F5B942',
          soft: 'rgba(245, 185, 66, 0.15)',
        },
        danger: {
          DEFAULT: '#F2576B',
          soft: 'rgba(242, 87, 107, 0.15)',
        },
      },
      fontFamily: {
        serif: ['Newsreader', 'Fraunces', 'Georgia', 'serif'],
        brand: ['Newsreader', 'Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [],
};
