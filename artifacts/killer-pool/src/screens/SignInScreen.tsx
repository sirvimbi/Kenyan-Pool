import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { isFirebaseConfigured, missingFirebaseConfig } from "../firebase/config";
import type { ConfirmationResult } from "firebase/auth";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { LegalModal } from "../components/LegalModals";
import { HelpModal } from "../components/HelpModal";

function friendlyError(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: string }).code)
      : "";

  console.log('Error code:', code); // Debug log

  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/invalid-phone-number":
      return "That phone number doesn't look right. Make sure to include the country code (e.g., +254...).";
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
      return "⚠️ Phone authentication is not enabled for this region. Please contact support or try signing in with email.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized. Add it to Firebase Console → Authentication → Settings → Authorized domains.";
    case "auth/region-not-enabled":
      return "⚠️ This phone number region is not enabled. Please use a phone number from a supported region or contact support.";
    default: {
      // Check for specific error message about region
      const msg =
        typeof err === "object" && err && "message" in err
          ? String((err as { message: string }).message)
          : "";

      if (msg.includes("region enabled")) {
        return "⚠️ Phone authentication is not enabled for this region. Please try signing in with email or contact support.";
      }

      return code
        ? `Error (${code}): ${msg || "Please check your console for details."}`
        : "Something went wrong. Please try again.";
    }
  }
}

function ConfigNotice({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="signin-screen">
      <div className="signin-dots" />
      <div className="signin-wrap">
        <img src="/logo.png" alt="Killer Pool Logo" className="main-logo" />
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
            Add them to your environment variables to enable cloud features.
          </div>
          <button className="signin-submit" onClick={onDemo} type="button">
            CONTINUE IN DEMO MODE →
          </button>
          <div className="signin-sub" style={{marginTop: 12, fontSize: 11}}>
            Progress will not be saved.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInScreen() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInWithPhone,
    verifyOtp,
    enterDemoMode,
  } = useAuth();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Reset confirmation when switching away from phone method
  useEffect(() => {
    if (method !== 'phone') {
      setConfirmation(null);
    }
  }, [method]);

  if (!isFirebaseConfigured) return <ConfigNotice onDemo={enterDemoMode} />;

  async function handleEmailSubmit(e: React.SyntheticEvent) {
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

  // Validate phone number format
  const validatePhoneNumber = (phone: string): boolean => {
    // Simple validation for E.164 format
    const phoneRegex = /^\+\d{1,3}\d{7,14}$/;
    if (!phoneRegex.test(phone)) {
      setError("Please enter a valid phone number with country code (e.g., +254712345678)");
      return false;
    }

    // Check if it's a Kenyan number
    if (phone.startsWith('+254')) {
      const localNumber = phone.substring(4);
      // Should be 9 digits (after +254)
      if (localNumber.length !== 9) {
        setError("Kenyan phone numbers should be 9 digits after +254 (e.g., +254712345678)");
        return false;
      }
    }

    return true;
  };

  async function handlePhoneSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (!confirmation) {
        // Validate phone number before sending
        if (!validatePhoneNumber(phone)) {
          setBusy(false);
          return;
        }

        // Ensure reCAPTCHA container exists
        const container = document.getElementById('recaptcha-container');
        if (!container) {
          throw new Error('reCAPTCHA container not found. Please refresh and try again.');
        }

        console.log('Sending OTP to:', phone);
        const res = await signInWithPhone(phone, "recaptcha-container");
        setConfirmation(res);
        setError("");
      } else {
        // Verify OTP
        console.log('Verifying OTP...');
        await verifyOtp(confirmation, otp);
      }
    } catch (err) {
      console.error('Phone auth error:', err);
      const errorMessage = friendlyError(err);
      setError(errorMessage);

      // If error occurs during sending, reset confirmation
      if (!confirmation) {
        setConfirmation(null);
      }
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
      {(mode !== "signin" || method !== "email" || confirmation) && (
        <button
          className="back-btn"
          onClick={() => {
            if (confirmation) {
              setConfirmation(null);
            } else if (method !== "email") {
              setMethod("email");
            } else {
              setMode("signin");
            }
            setError("");
          }}
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="signin-dots" />
      <div className="signin-wrap">
        <img src="/logo.png" alt="Killer Pool Logo" className="main-logo" />

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
            <div className="google-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18px" height="18px">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
            </div>
            <span className="google-btn-text">Sign in with Google</span>
          </button>

          <div className="signin-or"><span>or</span></div>

          <div className="signin-method-tabs">
            <button
              className={`method-tab ${method === "email" ? "active" : ""}`}
              onClick={() => {
                setMethod("email");
                setError("");
                setConfirmation(null);
              }}
              type="button"
            >
              Email
            </button>
            <button
              className={`method-tab ${method === "phone" ? "active" : ""}`}
              onClick={() => {
                setMethod("phone");
                setError("");
                setConfirmation(null);
              }}
              type="button"
            >
              Phone
            </button>
          </div>

          {method === "email" ? (
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
          ) : (
            <form onSubmit={handlePhoneSubmit} className="signin-form">
              {!confirmation ? (
                <>
                  <input
                    className="signin-input"
                    type="tel"
                    placeholder="Phone Number (e.g. +254712345678)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                  <div id="recaptcha-container"></div>
                </>
              ) : (
                <input
                  className="signin-input"
                  type="text"
                  placeholder="6-digit OTP code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              )}
              {error && <div className="signin-error">{error}</div>}
              <button className="signin-submit" type="submit" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : !confirmation
                    ? "SEND CODE"
                    : "VERIFY & SIGN IN"}
              </button>
              {confirmation && (
                <button
                  className="signin-switch-btn"
                  onClick={() => {
                    setConfirmation(null);
                    setOtp("");
                    setError("");
                  }}
                  type="button"
                  style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}
                >
                  Change phone number
                </button>
              )}
            </form>
          )}

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

          <div className="signin-legal-links">
            <button type="button" onClick={() => setShowHelp(true)} style={{ color: 'var(--neon-g)', fontWeight: 'bold' }}>Playing Guide & Help</button>
            <div style={{ margin: '10px 0', opacity: 0.3 }}>•</div>
            <button type="button" onClick={() => setLegal("terms")}>Terms & Conditions</button>
            <span>•</span>
            <button type="button" onClick={() => setLegal("privacy")}>Privacy Policy</button>
          </div>
        </div>
      </div>
      {legal && <LegalModal type={legal} onClose={() => setLegal(null)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}