import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile as updateAuthProfile,
  signOut as fbSignOut,
  type User,
  type ConfirmationResult,
} from "firebase/auth";
import { getAuthInstance, googleProvider, isFirebaseConfigured } from "../firebase/config";
import {
  getOrCreateProfile,
  subscribeProfile,
  updateProfile,
  addCredits as addProfileCredits,
  type PlayerProfile,
} from "../firebase/profile";
import { STARTING_BALANCE } from "../game/types";

interface AuthContextValue {
  user: User | null;
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  addCredits: (amount: number) => Promise<void>;
  signInWithPhone: (phoneNumber: string, elementId: string) => Promise<ConfirmationResult>;
  verifyOtp: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mock user and profile for demo mode
const MOCK_USER = {
  uid: "demo_uid",
  email: "demo@example.com",
  displayName: "Demo Player",
  phoneNumber: null,
  photoURL: null,
  emailVerified: false,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: "",
  tenantId: null,
  providerId: "firebase",
  delete: async () => {},
  getIdToken: async () => "",
  getIdTokenResult: async () => ({ token: "", signInProvider: "", expirationTime: "", issuedAtTime: "", authTime: "", claims: {} }),
  reload: async () => {},
  toJSON: () => ({}),
} as unknown as User;

const MOCK_PROFILE: PlayerProfile = {
  uid: "demo_uid",
  displayName: "Demo Player",
  email: "demo@example.com",
  photoURL: null,
  wallet: { play: STARTING_BALANCE },
  stats: { gamesPlayed: 0, wins: 0, biggestPot: 0 },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  // React to sign-in / sign-out. On sign-in, ensure a profile exists and then
  // keep it live via a Firestore subscription.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const auth = getAuthInstance();
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setError(null);
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      setUser(u);
      if (u) {
        try {
          await getOrCreateProfile(u);
          unsubscribeProfile = subscribeProfile(
            u.uid,
            (p) => {
              setProfile(p);
              setLoading(false);
            },
            (err) => {
              setError(err.message);
              setLoading(false);
            },
          );
        } catch (err: any) {
          console.error("Failed to load profile", err);
          setError(err.message);
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      // Clean up reCAPTCHA verifier
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [recaptchaVerifier]);

  const enterDemoMode = useCallback(() => {
    setIsDemo(true);
    setUser(MOCK_USER);
    setProfile(MOCK_PROFILE);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured) return enterDemoMode();
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, [enterDemoMode]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!isFirebaseConfigured) return enterDemoMode();
      await signInWithEmailAndPassword(getAuthInstance(), email, password);
    },
    [enterDemoMode],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!isFirebaseConfigured) return enterDemoMode();
      const cred = await createUserWithEmailAndPassword(
        getAuthInstance(),
        email,
        password,
      );
      if (displayName.trim()) {
        await updateAuthProfile(cred.user, { displayName: displayName.trim() });
      }
      // Create the profile immediately so the chosen display name is captured.
      await getOrCreateProfile(cred.user);
    },
    [enterDemoMode],
  );

  const updateDisplayName = useCallback(
    async (newName: string) => {
      if (isDemo) {
        setProfile((prev) => (prev ? { ...prev, displayName: newName.trim() } : null));
        return;
      }
      const auth = getAuthInstance();
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      try {
        await updateAuthProfile(auth.currentUser, { displayName: newName.trim() });
        await updateProfile(uid, { displayName: newName.trim() });
      } catch (err: any) {
        console.error("Failed to update display name", err);
        throw err;
      }
    },
    [isDemo],
  );

  const addCredits = useCallback(
    async (amount: number) => {
      if (isDemo) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                wallet: { ...prev.wallet, play: prev.wallet.play + amount },
              }
            : null,
        );
        return;
      }
      const uid = user?.uid;
      if (!uid) return;
      try {
        await addProfileCredits(uid, amount);
      } catch (err: any) {
        console.error("Failed to add credits", err);
        throw err;
      }
    },
    [isDemo, user],
  );

  const signInWithPhone = useCallback(
    async (phoneNumber: string, elementId: string) => {
      if (!isFirebaseConfigured) {
        enterDemoMode();
        throw new Error("Demo mode started");
      }

      const auth = getAuthInstance();

      // Clear any existing reCAPTCHA verifier
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Get the container element
      const container = document.getElementById(elementId);
      if (!container) {
        throw new Error(`reCAPTCHA container with id "${elementId}" not found`);
      }

      // Create a new reCAPTCHA verifier with correct configuration for Firebase v10+
      const verifier = new RecaptchaVerifier(
        auth,
        elementId,
        {
          size: 'invisible',
          callback: () => {
            console.log('reCAPTCHA verified');
          },
          'expired-callback': () => {
            console.log('reCAPTCHA expired, please try again');
            setRecaptchaVerifier(null);
          }
        }
      );

      // Store verifier for potential cleanup
      setRecaptchaVerifier(verifier);

      // Send the verification code
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        verifier
      );

      return confirmationResult;
    },
    [enterDemoMode, recaptchaVerifier]
  );

  const verifyOtp = useCallback(
    async (confirmationResult: ConfirmationResult, code: string) => {
      const cred = await confirmationResult.confirm(code);
      if (cred.user) {
        await getOrCreateProfile(cred.user);
      }
      // Clean up reCAPTCHA verifier after successful verification
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          // Ignore cleanup errors
        }
        setRecaptchaVerifier(null);
      }
    },
    [recaptchaVerifier],
  );

  const signOut = useCallback(async () => {
    if (isDemo) {
      setIsDemo(false);
      setUser(null);
      setProfile(null);
      return;
    }
    // Clean up reCAPTCHA verifier on sign out
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
      setRecaptchaVerifier(null);
    }
    await fbSignOut(getAuthInstance());
  }, [isDemo, recaptchaVerifier]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        isConfigured: isFirebaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        updateDisplayName,
        addCredits,
        signInWithPhone,
        verifyOtp,
        signOut,
        enterDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
