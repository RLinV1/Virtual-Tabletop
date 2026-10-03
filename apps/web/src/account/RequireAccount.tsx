import { useEffect, useState, type ReactNode } from "react";
import { navigate } from "../router";
import { useAccount } from "./accountStore";
import { signInFor } from "./safeNext";

/**
 * The one entry rule for GM surfaces (gm-dashboard): signed in goes straight in; signed out goes
 * to sign-in, which comes back here. While the account is still loading, neither the page nor
 * sign-in shows. Replace, not push, so Back from sign-in doesn't land on this redirect again.
 *
 * `signedOut` renders something else instead of redirecting: the library's Dice tab, which
 * works for players with no account.
 */
export function RequireAccount(props: { children: ReactNode; signedOut?: ReactNode }) {
  const account = useAccount();
  const redirect = account.status === "signedOut" && props.signedOut === undefined;
  // Read once, as this page renders: by a second effect run (StrictMode) the address is already sign-in's.
  const [here] = useState(() => location.pathname + location.search);

  useEffect(() => {
    if (redirect) navigate(signInFor(here), { replace: true });
  }, [redirect, here]);

  if (account.status === "loading") return null;
  if (account.status === "signedOut") return props.signedOut ?? null;
  return props.children;
}
