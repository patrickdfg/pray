import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-core": ["firebase/app", "firebase/auth"],
          "firebase-data": ["firebase/firestore", "firebase/functions"],
        },
      },
    },
  },
});
