import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  session: { access_token: string; refresh_token: string } | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: true,
      error: null,

      initialize: async () => {
        try {
          set({ isLoading: true, error: null });

          // Get current session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) throw sessionError;

          if (session) {
            // Fetch user profile
            const { data: profile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError && profileError.code !== 'PGRST116') {
              throw profileError;
            }

            // If no profile exists, create one
            if (!profile) {
              // Auto-assign role based on email
              const userEmail = session.user.email!;
              const autoRole = userEmail === 'jamie@projectinnerspace.org' ? 'sequencing' : 'admin';

              const { data: newProfile, error: createError } = await supabase
                .from('users')
                .insert({
                  id: session.user.id,
                  email: userEmail,
                  full_name: session.user.user_metadata?.full_name || null,
                  role: autoRole,
                })
                .select()
                .single();

              if (createError) throw createError;

              set({
                user: newProfile,
                session: {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                },
                isLoading: false,
              });

              // Also create default interrupt policy
              await supabase.from('interrupt_policies').insert({
                user_id: session.user.id,
              });

              // Create user state record
              await supabase.from('user_states').insert({
                user_id: session.user.id,
                state: 'normal',
              });
            } else {
              set({
                user: profile,
                session: {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                },
                isLoading: false,
              });
            }
          } else {
            set({ user: null, session: null, isLoading: false });
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
              set({ user: null, session: null });
            } else if (session && event === 'SIGNED_IN') {
              // Fetch user profile on sign in
              const { data: profile } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

              // If signed in via Google OAuth, store the provider token for Gmail/Calendar
              if (session.provider_token) {
                localStorage.setItem('google_access_token', session.provider_token);
                const gmailTokens = {
                  accessToken: session.provider_token,
                  expiresAt: Date.now() + (session.expires_in || 3600) * 1000,
                };
                localStorage.setItem('gmail_tokens', JSON.stringify(gmailTokens));
                console.log('[Auth] Google provider token stored for Gmail/Calendar');
              }

              set({
                user: profile,
                session: {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                },
              });
            } else if (session && event === 'TOKEN_REFRESHED') {
              set({
                session: {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                },
              });
            }
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to initialize auth',
            isLoading: false,
          });
        }
      },

      signIn: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) throw error;

          // Fetch user profile
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            throw profileError;
          }

          set({
            user: profile,
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            },
            isLoading: false,
          });
        } catch (error) {
          console.error('Sign in error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to sign in',
            isLoading: false,
          });
          throw error;
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ isLoading: true, error: null });

          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.origin,
              scopes: [
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.compose',
              ].join(' '),
              queryParams: {
                access_type: 'offline',
                prompt: 'consent',
              },
            },
          });

          if (error) throw error;
          // Browser will redirect to Google — onAuthStateChange handles the return
        } catch (error) {
          console.error('Google sign in error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to sign in with Google',
            isLoading: false,
          });
          throw error;
        }
      },

      signUp: async (email: string, password: string, fullName?: string) => {
        try {
          set({ isLoading: true, error: null });

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
              },
            },
          });

          if (error) throw error;

          if (data.user) {
            // Create user profile
            const { data: profile, error: profileError } = await supabase
              .from('users')
              .insert({
                id: data.user.id,
                email: data.user.email!,
                full_name: fullName || null,
              })
              .select()
              .single();

            if (profileError) throw profileError;

            // Create default interrupt policy
            await supabase.from('interrupt_policies').insert({
              user_id: data.user.id,
            });

            // Create user state record
            await supabase.from('user_states').insert({
              user_id: data.user.id,
              state: 'normal',
            });

            if (data.session) {
              set({
                user: profile,
                session: {
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                },
                isLoading: false,
              });
            } else {
              // Email confirmation required
              set({ isLoading: false });
            }
          }
        } catch (error) {
          console.error('Sign up error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to sign up',
            isLoading: false,
          });
          throw error;
        }
      },

      signOut: async () => {
        try {
          set({ isLoading: true, error: null });

          const { error } = await supabase.auth.signOut();
          if (error) throw error;

          set({ user: null, session: null, isLoading: false });
        } catch (error) {
          console.error('Sign out error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to sign out',
            isLoading: false,
          });
        }
      },

      updateProfile: async (updates: Partial<User>) => {
        try {
          const { user } = get();
          if (!user) throw new Error('No user logged in');

          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('users')
            .update({
              ...updates,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .select()
            .single();

          if (error) throw error;

          set({ user: data, isLoading: false });
        } catch (error) {
          console.error('Profile update error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to update profile',
            isLoading: false,
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'watershed-auth',
      partialize: (state) => ({
        session: state.session,
      }),
    }
  )
);
