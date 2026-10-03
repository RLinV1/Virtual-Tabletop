import net from "node:net";

/**
 * The benchmark network profile (README §6, KAN-39): every client link adds 50 ms one-way,
 * ±10 ms of jitter, in each direction. About 100 ms RTT, a residential connection.
 */
export const BENCHMARK_PROFILE = { delayMs: 50, jitterMs: 10 } as const;

/**
 * A TCP proxy in front of the test server that delays every chunk by the profile's delay,
 * per direction. Chunks keep their order: jitter never lets a later chunk overtake an
 * earlier one, as on a real TCP connection.
 */
export async function startLatencyProxy(targetPort: number, profile: { delayMs: number; jitterMs: number } = BENCHMARK_PROFILE) {
  const sockets = new Set<net.Socket>();
  const delay = () => profile.delayMs + (Math.random() * 2 - 1) * profile.jitterMs;

  /** Forwards `from` to `to`, each chunk no earlier than its delay and never before the previous one. */
  const pipe = (from: net.Socket, to: net.Socket) => {
    let lastAt = 0;
    from.on("data", (chunk) => {
      const at = Math.max(Date.now() + delay(), lastAt);
      lastAt = at;
      setTimeout(() => {
        if (!to.destroyed) to.write(chunk);
      }, at - Date.now());
    });
    from.on("close", () => setTimeout(() => to.destroy(), Math.max(0, lastAt - Date.now())));
    from.on("error", () => to.destroy());
  };

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    sockets.add(client).add(upstream);
    client.on("close", () => sockets.delete(client));
    upstream.on("close", () => sockets.delete(upstream));
    pipe(client, upstream);
    pipe(upstream, client);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no proxy address");

  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: () => {
      sockets.forEach((s) => s.destroy());
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
