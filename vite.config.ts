import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/aglafone-input/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
