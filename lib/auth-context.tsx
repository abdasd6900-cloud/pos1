import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Platform, AppState } from 'react-native';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'user';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'locked';

export interface UserProfile {
  id: string;
  phone: string;
  store_name: string;
  owner_name: string;
  role: UserRole;
  activation_key: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthContextType {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export interface SignUpData {
  phone: string;
  password: string;
  storeName: string;
  ownerName: string;
  businessMode: 'retail' | 'telecom';
  activationKey: string;
}

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_REQUEST_TIMEOUT_MS = 15000;

function phoneToEmail(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return `${cleaned}@sahab-pos.app`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const hadSessionRef = useRef(false);
  const returningFromBgRef = useRef(false);

  const fetchProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, phone, store_name, owner_name, role, activation_key, subscription_status, subscription_plan, subscription_expires_at, is_active, created_at')
      .eq('id', uid)
      .maybeSingle();

    if (error) return null;
    return data as UserProfile;
  }, []);

  // Track app foreground/background transitions to suppress transient
  // session-null events that fire when Supabase reconnects after the
  // app returns from background — these cause a spurious redirect to login.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        returningFromBgRef.current = true;
      } else if (state === 'active' && returningFromBgRef.current) {
        returningFromBgRef.current = false;
        // Re-check session validity after returning from background
        void supabase.auth.getSession().then(({ data: { session: sess } }) => {
          if (sess) {
            hadSessionRef.current = true;
            setSession((prev) => prev?.access_token === sess.access_token ? prev : sess);
          }
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    let settled = false;

    const finishLoading = () => {
      if (active && !settled) {
        settled = true;
        setLoading(false);
      }
    };

    // Skip all Supabase auth calls during server-side rendering to prevent
    // WebSocket connection attempts that cause build-time 404 errors.
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      finishLoading();
      return () => { active = false; };
    }

    const init = async () => {
      try {
        const { data: { session: sess } } = await supabase.auth.getSession();
        if (!active) return;
        if (sess) hadSessionRef.current = true;
        setSession(sess);
        if (sess?.user?.id) {
          const p = await fetchProfile(sess.user.id);
          if (!active) return;
          setProfile(p);
        }
      } catch {
        // Network or storage error — treat as no session
      } finally {
        finishLoading();
      }
    };

    void init();

    // Safety timeout: if getSession hangs (slow network, preview sandbox),
    // stop waiting so the UI can render the login screen.
    const timeout = setTimeout(finishLoading, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Suppress transient session-null events that fire when the app
      // returns from background and Supabase is reconnecting. Only clear
      // the session if we didn't have one before, or the event is a real
      // sign-out (TOKEN_REFRESH_FAILED / SIGNED_OUT).
      if (!sess && hadSessionRef.current && _event !== 'SIGNED_OUT') {
        // Re-verify: try to recover the session before clearing.
        // This covers TOKEN_REFRESH_FAILED (504/network blips) and
        // transient session-null events when returning from background.
        void supabase.auth.getSession().then(({ data: { session: recovered } }) => {
          if (recovered) {
            hadSessionRef.current = true;
            setSession(recovered);
          } else {
            hadSessionRef.current = false;
            setSession(null);
            setProfile(null);
          }
        }).catch(() => {
          hadSessionRef.current = false;
          setSession(null);
          setProfile(null);
        });
        finishLoading();
        return;
      }
      (async () => {
        if (sess) hadSessionRef.current = true;
        else hadSessionRef.current = false;
        setSession((prev) => prev?.access_token === sess?.access_token ? prev : sess);
        if (sess?.user?.id) {
          const p = await fetchProfile(sess.user.id);
          setProfile((prev) => prev?.id === p?.id ? prev : p);
        } else {
          setProfile(null);
        }
        finishLoading();
      })();
    });
    return () => { active = false; clearTimeout(timeout); subscription.unsubscribe(); };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
    }
  }, [session, fetchProfile]);

  const signIn = useCallback(async (phone: string, password: string): Promise<{ error: string | null }> => {
    const email = phoneToEmail(phone);
    try {
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('AUTH_REQUEST_TIMEOUT')), AUTH_REQUEST_TIMEOUT_MS);
        }),
      ]);
      if (!error) return { error: null };

      const rawMessage = error.message.toLowerCase();
      if (error.status === 504 || rawMessage.includes('status":504') || rawMessage.includes('gateway timeout')) {
        return { error: 'تعذر الاتصال بخدمة الدخول حالياً. تحقق من اتصال الإنترنت وحاول مرة أخرى بعد قليل' };
      }
      if (error.status === 429 || rawMessage.includes('rate limit')) {
        return { error: 'تم تجاوز عدد محاولات الدخول. حاول مرة أخرى بعد قليل' };
      }
      if (rawMessage.includes('invalid login credentials')) {
        return { error: 'رقم الجوال أو كلمة المرور غير صحيحة' };
      }
      return { error: 'تعذر تسجيل الدخول حالياً. حاول مرة أخرى' };
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message === 'AUTH_REQUEST_TIMEOUT') {
        return { error: 'استغرقت خدمة الدخول وقتاً طويلاً. تحقق من اتصال الإنترنت وحاول مرة أخرى' };
      }
      return { error: 'تعذر الاتصال بخدمة الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى' };
    }
  }, []);

  const signUp = useCallback(async (data: SignUpData): Promise<{ error: string | null }> => {
    const email = phoneToEmail(data.phone);
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password: data.password,
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        return { error: 'هذا الرقم مسجل مسبقاً' };
      }
      return { error: 'تعذر إنشاء الحساب. تأكد من صحة البيانات' };
    }

    const userId = authData.user?.id;
    if (!userId) {
      return { error: 'تعذر إنشاء الحساب' };
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      phone: data.phone,
      store_name: data.storeName,
      owner_name: data.ownerName,
      role: 'user',
      subscription_status: 'trial',
    });

    if (profileError) {
      return { error: 'تم إنشاء الحساب ولكن تعذر حفظ البيانات. حاول تسجيل الدخول' };
    }

    // Consume the activation key atomically. The function checks auth.uid() = p_profile_id
    // and applies the subscription in a single atomic operation. If the key is invalid
    // or already used, the profile remains as trial — the user can contact an admin.
    const { data: consumeResult, error: consumeError } = await supabase
      .rpc('consume_activation_key', {
        p_key_code: data.activationKey.trim(),
        p_profile_id: userId,
      });

    if (consumeError || !consumeResult?.success) {
      // Key was invalid or already consumed. The profile stays as trial.
      // User can still log in; an admin can assign a valid key later.
    }

    // Refresh the session so the JWT picks up the admin role that the
    // first-user trigger may have set on auth.users.raw_app_meta_data.
    await supabase.auth.refreshSession();

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    hadSessionRef.current = false;
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
