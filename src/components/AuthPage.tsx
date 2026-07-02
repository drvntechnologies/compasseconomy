import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plane, LogIn, UserPlus, ArrowLeft, Mail } from 'lucide-react';

interface AuthPageProps {
  onAuth: () => void;
}

type View = 'login' | 'signup' | 'forgot';

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (view === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      } else if (view === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split('@')[0],
              role: 'user',
            },
          },
        });
        if (error) throw error;
        onAuth();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-500/10 mb-4">
            <Plane className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">Compass Atlantic</h1>
          <p className="text-slate-400 mt-2">Passenger Demand System</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-xl">
          {view === 'forgot' ? (
            <>
              <button
                onClick={() => { setView('login'); setError(''); setResetSent(false); }}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-5"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>

              {resetSent ? (
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-4">
                    <Mail className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white mb-2">Check Your Email</h2>
                  <p className="text-slate-400 text-sm">
                    We sent a password reset link to <span className="text-white font-medium">{email}</span>.
                    Click the link in the email to set a new password.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white mb-1">Reset Password</h2>
                  <p className="text-slate-400 text-sm mb-5">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                  <form onSubmit={handleResetRequest} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                        placeholder="pilot@compass.aero"
                      />
                    </div>
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
                    >
                      {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex mb-6 bg-slate-900 rounded-lg p-1">
                <button
                  onClick={() => { setView('login'); setError(''); }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    view === 'login' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-4 h-4 inline mr-2" />
                  Sign In
                </button>
                <button
                  onClick={() => { setView('signup'); setError(''); }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    view === 'signup' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4 inline mr-2" />
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {view === 'signup' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                      placeholder="Your callsign"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    placeholder="pilot@compass.aero"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    placeholder="Min 6 characters"
                  />
                </div>
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
                >
                  {loading ? 'Please wait...' : view === 'login' ? 'Sign In' : 'Create Account'}
                </button>

                {view === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setError(''); }}
                    className="w-full text-sm text-slate-400 hover:text-sky-400 transition-colors mt-2"
                  >
                    Forgot your password?
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
