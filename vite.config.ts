import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/hrmdo-document-tracking-system/dist/';
  const apiPath = (env.VITE_API_URL || '/hrmdo-document-tracking-system/api/state.php').replace(/state\.php$/, '');
  return { base, plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 3000,
    proxy: { [apiPath]: { target: env.DEV_API_TARGET || 'http://localhost', changeOrigin: false } } },
    build: { sourcemap: false } };
});
