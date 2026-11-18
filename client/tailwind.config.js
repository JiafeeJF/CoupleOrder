export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF7F9',
        blush: '#F7ECEF',
        peach: '#F7ECEF',
        coral: '#F2C1CC',
        tangerine: '#E091A3',
        rose: '#E091A3',
        pinky: '#F2C1CC',
        cocoa: '#5C4A4E',
        latte: '#8C7A7E',
        sand: '#F7ECEF',
        surface: '#FFFFFF',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Hiragino Sans GB"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 6px 24px rgba(212, 120, 140, 0.14)',
        card: '0 2px 12px rgba(74, 63, 63, 0.08)',
      },
    },
  },
  plugins: [],
};
