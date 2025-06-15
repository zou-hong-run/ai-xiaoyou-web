import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    host: "0.0.0.0",
    https: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
