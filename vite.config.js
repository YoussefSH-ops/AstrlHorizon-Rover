import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development, /api is proxied to the FastAPI server (default http://localhost:8000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: { "/api": { target: env.DEV_API_TARGET || "http://127.0.0.1:8000", changeOrigin: true } },
    },
    preview: { port: 4173 },
    build: { outDir: "dist", sourcemap: false },
  };
});
