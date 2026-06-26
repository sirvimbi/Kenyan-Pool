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
  updateProfile as updateAuthProfile,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getAuthInstance, googleProvider } from "../firebase/config";
import {
  getOrCreateProfile,
  subscribeProfile,
  type PlayerProfile,
} from "../firebase/profile";

interface AuthContextValue {
  user: User | null;
  profile: PlayerProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // React to sign-in / sign-out. On sign-in, ensure a profile exists and then
  // keep it live via a Firestore subscription.
  useEffect(() => {
    const auth = getAuthInstance();
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      setUser(u);
      if (u) {
        try {
          await getOrCreateProfile(u);
        } catch (err) {
          console.error("Failed to load profile", err);
        }
        unsubProfile = subscribeProfile(u.uid, (p) => setProfile(p));
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(getAuthInstance(), email, password);
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
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
    [],
  );

  const signOut = useCallback(async () => {
    await fbSignOut(getAuthInstance());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
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
