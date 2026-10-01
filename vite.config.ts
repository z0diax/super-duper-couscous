import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_LIGHTWEIGHT_STATE_SYNC === '1') {
    const required=['VITE_DOCUMENT_REGISTRY_TARGETED_READS','VITE_DOCUMENT_DETAIL_TARGETED_READS','VITE_DOCUMENT_TASKS_TARGETED_READS','VITE_DOCUMENT_SEARCH_TARGETED_READS','VITE_DOCUMENT_SHELL_TARGETED_READS','VITE_PAYROLL_TARGETED_READS','VITE_DASHBOARD_TARGETED_READS','VITE_LEAVE_EWP_TARGETED_READS'];
    const missing=required.filter(key=>env[key]!=='1');
    if(missing.length)throw new Error(`Lightweight sync requires all targeted reads: ${missing.join(', ')}`);
  }
  const base = env.VITE_BASE_PATH || '/hrmdorms/dist/';
  const apiPath = (env.VITE_API_URL || '/hrmdorms/api/state.php').replace(/state\.php$/, '');
  return { base, plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 3000,
    proxy: { [apiPath]: { target: env.DEV_API_TARGET || 'http://localhost', changeOrigin: false } } },
    build: { sourcemap: false } };
});
