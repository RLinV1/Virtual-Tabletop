import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (ADR 0017 I2): argon2id at the OWASP minimum, stored as a PHC string so the
 * algorithm and its parameters travel with every hash. `@node-rs/argon2` defaults to argon2id
 * and hashes off the event loop.
 */
const PARAMS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const CURRENT = `$argon2id$v=19$m=${PARAMS.memoryCost},t=${PARAMS.timeCost},p=${PARAMS.parallelism}$`;

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

/** False for a wrong password, and for a stored value that is not a hash at all. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** True when the hash was made with other parameters, so a sign-in should store a fresh one. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(CURRENT);
}

/**
 * A fixed hash to verify against when the email has no account, so that answer takes as long as
 * a wrong password (non-enumeration). Made once, lazily, from a random value nobody knows.
 */
let dummy: Promise<string> | null = null;

export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword(crypto.randomUUID());
  await verifyPassword(await dummy, password);
  return false;
}
