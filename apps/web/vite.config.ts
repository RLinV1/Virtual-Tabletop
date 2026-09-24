import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 127.0.0.1, not localhost: Node resolves localhost to ::1 first, and the server listens on
// IPv4 only (0.0.0.0), so the proxy would get ECONNREFUSED.
const server = process.env.VTT_SERVER ?? "http://127.0.0.1:3001";

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
