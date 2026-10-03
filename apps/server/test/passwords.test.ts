import { hash } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "../src/identity/passwords";

describe("password hashing (FR-GM-01, ADR 0017 I2)", () => {
  it("stores an argon2id PHC string with the current parameters, never the password", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored).not.toContain("correct horse");
    expect(needsRehash(stored)).toBe(false);
  });

  it("verifies the right password and refuses a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(await verifyPassword(stored, "correct horse")).toBe(true);
    expect(await verifyPassword(stored, "Correct horse")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("flags a hash made with older parameters for a rehash", async () => {
    const old = await hash("correct horse", { memoryCost: 4096, timeCost: 3, parallelism: 1 });
    expect(await verifyPassword(old, "correct horse")).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });

  it("treats a stored value that is not a hash as a wrong password", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("answers an unknown email with false after doing the same work", async () => {
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
});
