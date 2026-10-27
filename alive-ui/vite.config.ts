import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = new URL(env.LLM_BASE_URL);
  const basePath = base.pathname.replace(/\/$/, '');
  return {
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          playground: 'playground.html',
          eval: 'eval/index.html',
        },
      },
    },
    server: {
      proxy: {
        '/llm': {
          target: base.origin,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/llm/, basePath),
          headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
        },
      },
    },
  };
});
