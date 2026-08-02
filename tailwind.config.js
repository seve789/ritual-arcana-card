/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts}'],
  theme: {
    extend: {
      colors: {
        ritual: {
          black: '#000000',
          elevated: '#111827',
          surface: '#1F2937',
          green: '#19D184',
          lime: '#BFFF00',
          pink: '#FF1DCE',
          gold: '#FACC15',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 30px -5px rgba(25, 209, 132, 0.25)',
        'glow-pink': '0 0 30px -5px rgba(255, 29, 206, 0.2)',
        'glow-gold': '0 0 30px -5px rgba(250, 204, 21, 0.3)',
        card: '0 4px 40px -12px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
