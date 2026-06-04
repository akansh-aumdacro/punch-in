/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          indigo: '#6366F1',
          violet: '#8B5CF6',
          purple: '#A855F7',
        },
      },
      keyframes: {
        // Slowly pan a multi-stop gradient for the animated background.
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        // Subtle vertical drift for hero dashboard-preview accents.
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        'gradient-pan': 'gradient-pan 18s ease infinite',
        'float-y': 'float-y 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
