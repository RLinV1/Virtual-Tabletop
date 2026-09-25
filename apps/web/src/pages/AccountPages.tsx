import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "../Link";
import { loadGmToken, markGuest } from "../net/identity";
import { navigate } from "../router";

/**
 * Account UI ahead of accounts (gm-home: Account UI placeholder). The forms are laid out
 * for FR-GM-01, but submitting sends nothing: there is no `action`, no fetch, and field
 * values never leave the page. When FR-GM-01 lands, `onSubmit` calls /api/auth/* and the
 * server's `resolveGm` switches to the session cookie (ADR 0004).
 */
function AccountsComingNotice() {
  return (
    <div role="status" className="notice">
      <strong>Accounts aren't available yet.</strong>
      <p>
        Your rooms and asset library are saved on this device. When accounts arrive, you'll be able to
        move them into your account.
      </p>
    </div>
  );
}

function AccountForm(props: {
  title: string;
  submitLabel: string;
  children: ReactNode;
  footer: ReactNode;
  /** Rendered above the fields: the way on while accounts don't exist yet. */
  before?: ReactNode;
}) {
  // With a way on above, submitting this preview is the secondary action, not the primary.
  const submitClass = props.before ? "secondary" : undefined;
  const [submitted, setSubmitted] = useState(false);
  return (
    <main className="centered">
      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <h1>{props.title}</h1>
        {props.before}
        {props.children}
        {submitted && <AccountsComingNotice />}
        <button type="submit" className={submitClass}>
          {props.submitLabel}
        </button>
        <p className="muted small-print">{props.footer}</p>
        <Link href="/">Back to home</Link>
      </form>
    </main>
  );
}

/**
 * The way past sign-in until accounts exist (gm-dashboard). It remembers the choice and
 * opens the dashboard; it creates no GM identity, which waits for the first room or upload.
 */
function ContinueAsGuest() {
  return (
    <div className="guest-option">
      <p>
        <strong>Accounts are coming soon.</strong> For now, continue as a guest. Your rooms and asset library
        are saved in this browser.
      </p>
      <button
        type="button"
        onClick={() => {
          markGuest();
          navigate("/gm-dashboard");
        }}
      >
        Continue as guest
      </button>
      <p className="guest-divider" aria-hidden="true">
        <span>or sign in</span>
      </p>
    </div>
  );
}

export function SignInPage() {
  return (
    <AccountForm
      title="Sign in"
      submitLabel="Sign in"
      before={<ContinueAsGuest />}
      footer={
        <>
          New here? <Link href="/signup">Create an account</Link>
        </>
      }
    >
      <label>
        Email
        <input type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" required minLength={8} maxLength={200} />
      </label>
    </AccountForm>
  );
}

export function SignUpPage() {
  return (
    <AccountForm
      title="Create a GM account"
      submitLabel="Create account"
      footer={
        <>
          Players never need an account — they join from your invite link. Already have one?{" "}
          <Link href="/signin">Sign in</Link>
        </>
      }
    >
      <label>
        Display name
        <input autoComplete="nickname" required maxLength={40} />
      </label>
      <label>
        Email
        <input type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Password
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} />
      </label>
    </AccountForm>
  );
}

/** Header menu. With no accounts yet, it describes the device identity and links to the screens above. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const onDevice = loadGmToken() !== null;
  return (
    <div className="account-menu">
      <button
        type="button"
        className="secondary small"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen(!open)}
      >
        Account
      </button>
      {open && (
        <div id="account-menu-panel" className="account-menu-panel">
          <p>
            {onDevice ? "You're using this device's GM identity." : "You haven't created anything on this device yet."}
          </p>
          <p className="muted">Rooms and library items are saved in this browser until accounts are available.</p>
          <Link href="/signin">Sign in</Link>
          <Link href="/signup">Create account</Link>
        </div>
      )}
    </div>
  );
}
