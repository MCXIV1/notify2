import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Теперь корень сервера и индекс — в src/renderer
  root: 'src/renderer',
  server: {
    port: 5173,
    strictPort: true
  },
  plugins: [react()],
  build: {
    // Собираем рендерер в dist/renderer (из корня проекта)
    outDir: '../../dist/renderer',
    emptyOutDir: false
  }
});