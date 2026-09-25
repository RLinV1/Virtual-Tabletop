import { describe, expect, it } from "vitest";
import { isExpectedProxyDisconnect } from "../vite.config";

const err = (code: string) => Object.assign(new Error(code), { code });

describe("dev proxy logging (quiet-dev-proxy-disconnects)", () => {
  it("drops ws proxy errors for a socket that was simply cut", () => {
    for (const code of ["ECONNABORTED", "ECONNRESET", "EPIPE"]) {
      expect(isExpectedProxyDisconnect("ws proxy socket error:\nError: write " + code, err(code))).toBe(true);
      expect(isExpectedProxyDisconnect("ws proxy error:", err(code))).toBe(true);
    }
  });

  it("keeps ws proxy errors with any other code", () => {
    expect(isExpectedProxyDisconnect("ws proxy error:", err("ECONNREFUSED"))).toBe(false);
  });

  it("keeps HTTP proxy errors, even with the same codes", () => {
    expect(isExpectedProxyDisconnect("http proxy error: /api/rooms", err("ECONNRESET"))).toBe(false);
  });

  it("keeps messages that carry no error", () => {
    expect(isExpectedProxyDisconnect("ws proxy socket error:", undefined)).toBe(false);
  });
});
