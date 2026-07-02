import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { Users, ArrowUpDown, Trophy, KeyRound, X, CheckCircle, AlertCircle } from 'lucide-react';

interface PilotStats {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  totalFlights: number;
  totalPax: number;
  lastFlight: string | null;
}

export default function UserManagement() {
  const [pilots, setPilots] = useState<PilotStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwordTarget, setPasswordTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    const [profilesRes, logsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('flight_logs').select('user_id, pax_count, flight_date'),
    ]);

    const profiles: Profile[] = profilesRes.data || [];
    const logs = logsRes.data || [];

    const statsByUser: Record<string, { flights: number; pax: number; lastFlight: string | null }> = {};
    for (const log of logs) {
      if (!statsByUser[log.user_id]) {
        statsByUser[log.user_id] = { flights: 0, pax: 0, lastFlight: null };
      }
      statsByUser[log.user_id].flights += 1;
      statsByUser[log.user_id].pax += log.pax_count;
      if (!statsByUser[log.user_id].lastFlight || log.flight_date > statsByUser[log.user_id].lastFlight!) {
        statsByUser[log.user_id].lastFlight = log.flight_date;
      }
    }

    setPilots(profiles.map(p => ({
      userId: p.id,
      displayName: p.display_name,
      email: p.email,
      role: p.role,
      totalFlights: statsByUser[p.id]?.flights || 0,
      totalPax: statsByUser[p.id]?.pax || 0,
      lastFlight: statsByUser[p.id]?.lastFlight || null,
    })));
    setLoading(false);
  }

  async function toggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setPilots(prev => prev.map(p =>
      p.userId === userId ? { ...p, role: newRole } : p
    ));
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordTarget || !newPassword) return;
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setPasswordError('Not authenticated');
      setPasswordLoading(false);
      return;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: passwordTarget.userId,
          new_password: newPassword,
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      setPasswordError(result.error || 'Failed to set password');
    } else {
      setPasswordSuccess(`Password updated for ${passwordTarget.displayName}`);
      setNewPassword('');
      setTimeout(() => {
        setPasswordTarget(null);
        setPasswordSuccess('');
      }, 2000);
    }
    setPasswordLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const sorted = [...pilots].sort((a, b) => b.totalPax - a.totalPax);

  return (
    <div className="space-y-4">
      {/* Pilot Leaderboard */}
      {sorted.some(p => p.totalFlights > 0) && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Pilot Leaderboard
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.filter(p => p.totalFlights > 0).map((pilot, idx) => (
              <div key={pilot.userId} className="bg-slate-900/60 rounded-lg p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                  idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                  idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                  'bg-slate-700 text-slate-500'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{pilot.displayName}</p>
                  <p className="text-slate-400 text-xs">{pilot.totalFlights} flights</p>
                </div>
                <div className="text-right">
                  <p className="text-sky-400 font-bold text-sm">{pilot.totalPax.toLocaleString()}</p>
                  <p className="text-slate-500 text-[10px]">PAX moved</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <span className="text-white font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            {pilots.length} Registered Users
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-slate-400 font-medium">User</th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">Role</th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">Flights</th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">PAX Moved</th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">Last Flight</th>
                <th className="px-4 py-3 text-right text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sorted.map(pilot => (
                <tr key={pilot.userId} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white font-medium">{pilot.displayName}</p>
                      <p className="text-slate-500 text-xs">{pilot.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      pilot.role === 'admin'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-600/50 text-slate-400'
                    }`}>
                      {pilot.role === 'admin' ? 'ADMIN' : 'PILOT'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{pilot.totalFlights}</td>
                  <td className="px-4 py-3 text-sky-300 font-semibold">{pilot.totalPax.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {pilot.lastFlight || 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setPasswordTarget({ userId: pilot.userId, displayName: pilot.displayName });
                          setNewPassword('');
                          setPasswordError('');
                          setPasswordSuccess('');
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                        title="Set Password"
                      >
                        <KeyRound className="w-3 h-3" />
                        Password
                      </button>
                      <button
                        onClick={() => toggleRole(pilot.userId, pilot.role)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                        title={pilot.role === 'admin' ? 'Demote to Pilot' : 'Promote to Admin'}
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        {pilot.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set Password Modal */}
      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-400" />
                Set Password
              </h3>
              <button
                onClick={() => setPasswordTarget(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Setting a new password for <span className="text-white font-medium">{passwordTarget.displayName}</span>
            </p>
            <form onSubmit={setPassword} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  autoFocus
                />
              </div>
              {passwordError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  {passwordSuccess}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPasswordTarget(null)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading || newPassword.length < 6}
                  className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-all"
                >
                  {passwordLoading ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
