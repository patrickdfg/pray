import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.PAGES_BUILD ? "/pray/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-core": ["firebase/app", "firebase/auth"],
          "firebase-data": ["firebase/firestore"],
        },
      },
    },
  },
});
