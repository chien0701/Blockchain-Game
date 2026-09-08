import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Blockchain-Game/',
  server: { port: 5173 },
  // 前端測試（合約測試在 contracts/ 用 hardhat test 執行，此處排除）
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'contracts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ['ethers'],
          gsap: ['gsap', '@gsap/react'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
