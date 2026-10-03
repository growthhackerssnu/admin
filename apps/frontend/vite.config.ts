import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.DEV_API_PROXY_TARGET?.trim();
  if (proxyTarget && !/^https?:\/\//.test(proxyTarget))
    throw new Error("DEV_API_PROXY_TARGET must be an HTTP(S) backend origin.");
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 5173,
      strictPort: true,
      ...(proxyTarget
        ? {
            proxy: {
              "/api": { target: proxyTarget, changeOrigin: true, secure: true },
            },
          }
        : {}),
    },
  };
});
