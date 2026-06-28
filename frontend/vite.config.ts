import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // proxy API calls to the FastAPI dev server
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    // build straight into the backend so one container serves everything
    outDir: "../backend/app/static",
    emptyOutDir: true,
  },
});
