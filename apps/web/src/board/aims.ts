/** How long another participant's aim stays after its last update (KAN-35, ADR 0021). */
export const AIM_TTL_MS = 1000;

/** When an aim updated at `now` should disappear. */
export const aimExpiry = (now: number) => now + AIM_TTL_MS;

/** The senders whose aims have run out by `now`: their last update is over a second old. */
export function expiredAims(aims: ReadonlyMap<string, { expires: number }>, now: number): string[] {
  return [...aims].filter(([, aim]) => now > aim.expires).map(([from]) => from);
}
