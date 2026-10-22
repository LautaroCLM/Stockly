import type { User, Session, AuthError } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}
