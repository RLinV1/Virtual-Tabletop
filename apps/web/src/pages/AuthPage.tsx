import { useState, type FormEvent } from "react";
import { navigate } from "../router";
import { NotBuiltYet, SiteChrome } from "./SiteChrome";

/**
 * Log in and sign up (DESIGN.md §11.6). One component, two modes — the forms differ by one
 * field and one verb, and splitting them would duplicate the validation.
 *
 * The form is complete and the backend is not (KAN-7). Submitting reports that plainly
 * rather than spinning forever or faking a session: a prototype that pretends to succeed
 * is harder to reason about than one that says what is missing.
 *
 * Per §11.6 the password rule is stated above the field, not produced as an error after
 * submitting.
 */
export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Client-side validation runs for real; only the network call is missing.
    if (isSignup && password.length < 12) {
      setInvalid("Use at least 12 characters.");
      return;
    }
    setInvalid(null);
  }

  return (
    <SiteChrome active={mode}>
      <main className="auth">
        <form className="auth-form" onSubmit={onSubmit}>
          <h1>{isSignup ? "Create an account" : "Log in"}</h1>
          <p className="muted">
            {isSignup
              ? "An account keeps your rooms so you can find them from any device. Players never need one."
              : "Welcome back. Your rooms are waiting."}
          </p>

          <label htmlFor="auth-email">
            Email
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          {isSignup && (
            <label htmlFor="auth-name">
              Display name
              <input
                id="auth-name"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                required
              />
            </label>
          )}

          <label htmlFor="auth-password">
            Password
            {isSignup && (
              <span className="hint" id="auth-password-hint">
                At least 12 characters.
              </span>
            )}
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              aria-describedby={isSignup ? "auth-password-hint" : undefined}
              aria-invalid={invalid ? true : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setInvalid(null);
              }}
              required
            />
          </label>

          {invalid && (
            <p role="alert" className="error">
              {invalid}
            </p>
          )}

          <button type="submit">{isSignup ? "Create account" : "Log in"}</button>

          <NotBuiltYet ticket="KAN-7">
            Accounts have no backend yet, so this form validates but cannot sign you in.
          </NotBuiltYet>

          <p className="auth-alt">
            {isSignup ? "Already have an account? " : "No account? "}
            <a
              href={isSignup ? "/login" : "/signup"}
              onClick={(e) => {
                e.preventDefault();
                navigate(isSignup ? "/login" : "/signup");
              }}
            >
              {isSignup ? "Log in" : "Create one"}
            </a>
          </p>
        </form>
      </main>
    </SiteChrome>
  );
}
