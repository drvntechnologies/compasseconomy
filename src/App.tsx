import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import type { Profile, Airport, Route } from './lib/types';
import AuthPage from './components/AuthPage';
import AdminPanel from './components/AdminPanel';
import Dashboard from './components/Dashboard';
import RoutePlanner from './components/RoutePlanner';
import CapacityChecker from './components/CapacityChecker';
import Dispatch from './components/Dispatch';
import Fleet from './components/Fleet';
import Gates from './components/Gates';
import Finances from './components/Finances';
import { Plane, LogOut, LayoutDashboard, Settings, Users, Navigation, Clock, Gauge, Radio, PanelLeftClose, PanelLeft, DoorOpen, DollarSign, KeyRound, Sun, Moon, Monitor } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'dispatch' | 'planner' | 'capacity' | 'fleet' | 'gates' | 'finances' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });
  const [win98Mode, setWin98Mode] = useState(() => {
    return localStorage.getItem('win98') === 'true';
  });
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (win98Mode) {
      document.documentElement.classList.add('win98');
    } else {
      document.documentElement.classList.remove('win98');
    }
    localStorage.setItem('win98', win98Mode ? 'true' : 'false');
  }, [win98Mode]);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => setNow(new Date()), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
      }
      if (session) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchAirportsAndRoutes();
    }
  }, [session]);

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) setProfile(data);
  }

  async function fetchAirportsAndRoutes() {
    const [airportsRes, routesRes] = await Promise.all([
      supabase.from('airports').select('*').order('icao_code'),
      supabase.from('routes').select('*').order('flight_number'),
    ]);
    if (airportsRes.data) setAirports(airportsRes.data);
    if (routesRes.data) setRoutes(routesRes.data);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setResetError(error.message);
    } else {
      setResetSuccess(true);
      setTimeout(() => {
        setShowPasswordReset(false);
        setNewPassword('');
        setResetSuccess(false);
      }, 2000);
    }
    setResetting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuth={() => {}} />;
  }

  const isAdmin = profile?.role === 'admin';

  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const utcTime = now.toUTCString().slice(17, 25);
  const localDate = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'dispatch' as const, label: 'Dispatch/Logging', icon: Radio },
    { id: 'fleet' as const, label: 'Fleet', icon: Plane },
    { id: 'gates' as const, label: 'Gates', icon: DoorOpen },
    { id: 'finances' as const, label: 'Finances', icon: DollarSign },
    { id: 'planner' as const, label: 'Planner', icon: Navigation },
    { id: 'capacity' as const, label: 'Capacity', icon: Gauge },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-800 border-r border-slate-700 transition-all duration-300 ${
        sidebarCollapsed ? 'w-[68px]' : 'w-60'
      }`}>
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-700 shrink-0">
          <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Plane className="w-5 h-5 text-sky-400" />
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-white font-bold text-sm leading-tight whitespace-nowrap">Compass Atlantic</h1>
              <p className="text-slate-500 text-[10px]">PAX Demand System</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!sidebarCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Clock section */}
        <div className={`px-3 py-3 border-t border-slate-700 ${sidebarCollapsed ? 'text-center' : ''}`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-0.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] text-cyan-400 font-mono">{utcTime.slice(0, 5)}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400">{localDate}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-300">{localTime} <span className="text-slate-500">LCL</span></span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-400">{utcTime} <span className="text-cyan-600">UTC</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Demand generates at 0400Z
              </div>
            </div>
          )}
        </div>

        {/* User + collapse */}
        <div className="px-3 py-3 border-t border-slate-700 shrink-0">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium leading-tight truncate">{profile?.display_name}</p>
                  <p className="text-slate-500 text-xs">{isAdmin ? 'Admin' : 'Pilot'}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Theme + Collapse toggle */}
        <div className="px-3 py-2 border-t border-slate-700 shrink-0 flex items-center gap-1">
          <button
            onClick={() => setWin98Mode(!win98Mode)}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
              win98Mode ? 'text-teal-400 bg-teal-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
            title={win98Mode ? 'Disable retro mode' : 'Enable Windows 98 mode'}
          >
            <Monitor className="w-4 h-4" />
            {!sidebarCollapsed && <span>{win98Mode ? 'W98' : 'W98'}</span>}
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {!sidebarCollapsed && <span>{darkMode ? 'Light' : 'Dark'}</span>}
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all ml-auto"
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 transition-all duration-300 ${
        sidebarCollapsed ? 'ml-[68px]' : 'ml-60'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          {activeView === 'dashboard' && (
            <Dashboard airports={airports} routes={routes} />
          )}

          {activeView === 'dispatch' && (
            <Dispatch airports={airports} routes={routes} currentUserId={session?.user?.id || null} />
          )}

          {activeView === 'fleet' && (
            <Fleet airports={airports} isAdmin={isAdmin} />
          )}

          {activeView === 'gates' && (
            <Gates airports={airports} isAdmin={isAdmin} />
          )}

          {activeView === 'finances' && (
            <Finances isAdmin={isAdmin} />
          )}

          {activeView === 'planner' && (
            <RoutePlanner airports={airports} routes={routes} />
          )}

          {activeView === 'capacity' && (
            <CapacityChecker airports={airports} routes={routes} />
          )}

          {activeView === 'admin' && isAdmin && (
            <AdminPanel
              airports={airports}
              routes={routes}
              onRefresh={fetchAirportsAndRoutes}
            />
          )}
        </div>
      </main>

      {showPasswordReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-sky-500/10 rounded-lg flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Set New Password</h2>
                <p className="text-slate-400 text-xs">Choose a new password for your account</p>
              </div>
            </div>

            {resetSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm text-center">
                Password updated successfully! Redirecting...
              </div>
            ) : (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    placeholder="Min 6 characters"
                    autoFocus
                  />
                </div>
                {resetError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {resetError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={resetting}
                  className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetting ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
