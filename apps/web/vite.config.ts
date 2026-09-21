import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = process.env.VTT_SERVER ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from phones on the same Wi-Fi for Player Board testing
    proxy: {
      "/api": server,
      "/uploads": server,
      "/socket.io": { target: server, ws: true },
    },
  },
});
