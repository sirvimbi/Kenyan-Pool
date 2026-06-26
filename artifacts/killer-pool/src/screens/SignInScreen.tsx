import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { isFirebaseConfigured, missingFirebaseConfig } from "../firebase/config";

function friendlyError(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: string }).code)
      : "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password.";
    case "auth/email-already-in-use":
      return "That email is already registered — try signing in.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in isn't enabled in the Firebase console yet.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized in the Firebase console (Authentication → Settings → Authorized domains).";
    case "permission-denied":
      return "Your account was created, but saving your profile was blocked by Firestore security rules. Publish rules that let signed-in users write their own profile.";
    case "unavailable":
    case "failed-precondition":
      return "Couldn't reach Firestore. Make sure a Firestore database has been created in the Firebase console.";
    default: {
      const msg =
        typeof err === "object" && err && "message" in err
          ? String((err as { message: string }).message)
          : "";
      return code
        ? `Something went wrong (${code})${msg ? `: ${msg}` : ""}`
        : "Something went wrong. Please try again.";
    }
  }
}

function ConfigNotice() {
  return (
    <div className="signin-screen">
      <div className="signin-dots" />
      <div className="signin-wrap">
        <div className="logo">KILLER<br />POOL</div>
        <div className="logo-sub">KENYAN CUSHION EDITION</div>
        <div className="signin-card">
          <div className="signin-title">Setup needed</div>
          <div className="signin-config-msg">
            Firebase isn't configured yet. The following environment variables are
            missing:
            <ul className="signin-config-list">
              {missingFirebaseConfig.map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
            Add them in the Secrets panel, then reload.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isFirebaseConfigured) return <ConfigNotice />;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-screen">
      <div className="signin-dots" />
      <div className="signin-wrap">
        <div className="logo">KILLER<br />POOL</div>
        <div className="logo-sub">KENYAN CUSHION EDITION</div>
        <div className="nairobi-tag">♦ NAIROBI NIGHTS ♦</div>

        <div className="signin-card">
          <div className="signin-title">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </div>
          <div className="signin-sub">
            {mode === "signin"
              ? "Sign in to claim your table and your stack."
              : "Sign up and grab your starting grubstake."}
          </div>

          <button
            className="google-btn"
            onClick={handleGoogle}
            disabled={busy}
            type="button"
          >
            <span className="g-mark">G</span> Continue with Google
          </button>

          <div className="signin-or"><span>or</span></div>

          <form onSubmit={handleEmailSubmit} className="signin-form">
            {mode === "signup" && (
              <input
                className="signin-input"
                placeholder="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            )}
            <input
              className="signin-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="signin-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
            />
            {error && <div className="signin-error">{error}</div>}
            <button className="signin-submit" type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "SIGN IN"
                  : "CREATE ACCOUNT"}
            </button>
          </form>

          <div className="signin-switch">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
