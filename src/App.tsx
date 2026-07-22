import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, signInWithPassword, signUpWithPassword, resetPasswordForEmail, updatePassword } from './lib/supabase';
import type { Airport, Route, Profile, AcarsFlight, FlightPosition } from './lib/types';
import { Dashboard } from './components/Dashboard';
import { Dispatch } from './components/Dispatch';
import { Fleet } from './components/Fleet';
import { Gates } from './components/Gates';
import { Finances } from './components/Finances';
import { Acars } from './components/Acars';
import { AdminPanel } from './components/AdminPanel';
import { Analytics } from './components/Analytics';
import { RouteNetwork } from './components/RouteNetwork';
import { AuthPage } from './components/AuthPage';
import { AppUpdater } from './components/AppUpdater';
import { SimConnectIndicator } from './components/SimConnectIndicator';
import { CapacityChecker } from './components/CapacityChecker';
import { RoutePlanner } from './components/RoutePlanner';
import { LiveMap } from './components/LiveMap';
import {
  LayoutDashboard, Plane, Building2, DollarSign, Radio, Settings, LogOut,
  Users, BarChart3, Map, Navigation, ClipboardList, Calculator, Globe, Moon, Sun, Clock, User as UserIcon, KeyRound
} from 'lucide-react';

type ActiveView =
  | 'dashboard' | 'dispatch' | 'fleet' | 'gates' | 'finances'
  | 'acars' | 'admin' | 'analytics' | 'capacity' | 'routeplanner' | 'livemap' | 'routenetwork';

export default function App() {
  const [session, setSession] = useState<null | { user: { id: string; email: string } }>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [loading, setLoading] = useState(true);
  const [showPilotSettings, setShowPilotSettings] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [simConnected, setSimConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<{ lat: number; lon: number; alt: number; spd: number; hdg: number; onGround: boolean; vs: number; gnd: number } | null>(null);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);
  const [acarsFlights, setAcarsFlights] = useState<AcarsFlight[]>([]);
  const [flightPositions, setFlightPositions] = useState<Record<string, FlightPosition>>({});
  const [darkMode, setDarkMode] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pilotName, setPilotName] = useState('');
  const [pilotId, setPilotId] = useState('');
  const [pilotEmail, setPilotEmail] = useState('');
  const [simbriefId, setSimbriefId] = useState('');
  const [savingPilot, setSavingPilot] = useState(false);
  const [pilotSaveMsg, setPilotSaveMsg] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdateMsg, setPasswordUpdateMsg] = useState('');
  const [passwordUpdateErr, setPasswordUpdateErr] = useState('');
  const telemetryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session as typeof session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s as typeof session);
      if (!s) { setProfile(null); setLoading(false); setActiveView('dashboard'); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (data) {
      setProfile(data as Profile);
      setPilotName(data.pilot_name || '');
      setPilotId(data.pilot_id || '');
      setPilotEmail(data.email || '');
      setSimbriefId(data.simbrief_id || '');
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const fetchAirports = useCallback(async () => {
    const { data } = await supabase.from('airports').select('*').order('icao_code');
    if (data) setAirports(data as Airport[]);
  }, []);

  const fetchRoutes = useCallback(async () => {
    const { data } = await supabase.from('routes').select('*').order('flight_number');
    if (data) setRoutes(data as Route[]);
  }, []);

  const refreshData = useCallback(() => {
    fetchAirports();
    fetchRoutes();
  }, [fetchAirports, fetchRoutes]);

  useEffect(() => {
    if (profile) {
      refreshData();
      setLoading(false);
    }
  }, [profile, refreshData]);

  // SimConnect telemetry polling
  useEffect(() => {
    if (activeView !== 'acars' && activeView !== 'livemap') {
      if (telemetryIntervalRef.current) {
        clearInterval(telemetryIntervalRef.current);
        telemetryIntervalRef.current = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch('http://127.0.0.1:41850/telemetry');
        if (res.ok) {
          const data = await res.json();
          setTelemetry(data);
          setSimConnected(true);
        } else {
          setSimConnected(false);
        }
      } catch {
        setSimConnected(false);
      }
    };
    poll();
    telemetryIntervalRef.current = setInterval(poll, 2000);
    return () => {
      if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
    };
  }, [activeView]);

  // ACARS flights subscription
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('acars-flights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acars_flights' }, () => {
        supabase.from('acars_flights').select('*').order('created_at', { ascending: false }).then(({ data }) => {
          if (data) setAcarsFlights(data as AcarsFlight[]);
        });
      })
      .subscribe();
    supabase.from('acars_flights').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setAcarsFlights(data as AcarsFlight[]);
    });
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Flight positions subscription
  useEffect(() => {
    const channel = supabase
      .channel('flight-positions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flight_positions' }, (payload) => {
        const pos = payload.new as FlightPosition;
        setFlightPositions(prev => ({ ...prev, [pos.flight_id]: pos }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Theme
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading Compass Atlantic...</div>
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthPage onAuth={() => {}} />;
  }

  const handleLogout = () => supabase.auth.signOut();

  const savePilotSettings = async () => {
    if (!session?.user?.id) return;
    setSavingPilot(true);
    setPilotSaveMsg('');
    const { error } = await supabase.from('profiles').update({
      pilot_name: pilotName,
      pilot_id: pilotId,
      email: pilotEmail,
      simbrief_id: simbriefId,
    }).eq('id', session.user.id);
    if (error) {
      setPilotSaveMsg(`Error: ${error.message}`);
    } else {
      setPilotSaveMsg('Settings saved successfully.');
      fetchProfile(session.user.id);
    }
    setSavingPilot(false);
  };

  const handlePasswordReset = async () => {
    setResetMsg('');
    setResetErr('');
    if (!resetEmail.trim()) {
      setResetErr('Please enter your email address.');
      return;
    }
    const { error } = await resetPasswordForEmail(resetEmail.trim());
    if (error) {
      setResetErr(error.message);
    } else {
      setResetMsg('Password reset link sent. Check your email.');
      setResetEmail('');
    }
  };

  const handlePasswordUpdate = async () => {
    setPasswordUpdateMsg('');
    setPasswordUpdateErr('');
    if (!newPassword || newPassword.length < 6) {
      setPasswordUpdateErr('Password must be at least 6 characters.');
      return;
    }
    const { error } = await updatePassword(newPassword);
    if (error) {
      setPasswordUpdateErr(error.message);
    } else {
      setPasswordUpdateMsg('Password updated successfully.');
      setNewPassword('');
    }
  };

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'dispatch' as const, label: 'Dispatch', icon: ClipboardList },
    { id: 'capacity' as const, label: 'Capacity', icon: Calculator },
    { id: 'routeplanner' as const, label: 'Route Planner', icon: Navigation },
    { id: 'livemap' as const, label: 'Live Map', icon: Globe },
  ];

  const flightOpsItems = [
    { id: 'acars' as const, label: 'ACARS', icon: Radio },
    { id: 'routenetwork' as const, label: 'Route Network', icon: Map },
  ];

  const managementItems = [
    { id: 'fleet' as const, label: 'Fleet', icon: Plane },
    { id: 'gates' as const, label: 'Gates', icon: Building2 },
    { id: 'finances' as const, label: 'Finances', icon: DollarSign },
  ];

  const adminItems = profile?.role === 'admin' ? [
    { id: 'admin' as const, label: 'Admin Panel', icon: Settings },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
  ] : [];

  const allNavItems = [...navItems, ...flightOpsItems, ...managementItems, ...adminItems];

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-slate-950' : 'bg-slate-100'} transition-colors`}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className={`w-64 shrink-0 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border-r flex flex-col`}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Plane className="w-7 h-7 text-sky-500" />
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white">Compass Atlantic</h1>
                <p className="text-xs text-slate-500">Virtual Airline Ops</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {navItems.map(item => (
              <NavButton key={item.id} item={item} activeView={activeView} setActiveView={setActiveView} darkMode={darkMode} />
            ))}

            <div className="pt-3 pb-1 px-3 text-xs font-semibold uppercase text-slate-400">Flight Ops</div>
            {flightOpsItems.map(item => (
              <NavButton key={item.id} item={item} activeView={activeView} setActiveView={setActiveView} darkMode={darkMode} />
            ))}

            <div className="pt-3 pb-1 px-3 text-xs font-semibold uppercase text-slate-400">Management</div>
            {managementItems.map(item => (
              <NavButton key={item.id} item={item} activeView={activeView} setActiveView={setActiveView} darkMode={darkMode} />
            ))}

            {adminItems.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-3 text-xs font-semibold uppercase text-slate-400">Administration</div>
                {adminItems.map(item => (
                  <NavButton key={item.id} item={item} activeView={activeView} setActiveView={setActiveView} darkMode={darkMode} />
                ))}
              </>
            )}
          </nav>

          {/* Bottom nav */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button
              onClick={() => setShowPilotSettings(true)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <UserIcon className="w-4 h-4" />
              <span className="truncate">{profile?.pilot_name || profile?.email || 'Pilot'}</span>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Header bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <SimConnectIndicator connected={simConnected} />
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono">{currentTime.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${profile?.role === 'admin' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-600/20 text-slate-400'}`}>
                  {profile?.role?.toUpperCase() || 'PILOT'}
                </span>
              </div>
            </div>

            {activeView === 'dashboard' && <Dashboard airports={airports} routes={routes} profile={profile} />}
            {activeView === 'dispatch' && <Dispatch airports={airports} routes={routes} profile={profile} onRefresh={refreshData} />}
            {activeView === 'fleet' && <Fleet />}
            {activeView === 'gates' && <Gates airports={airports} />}
            {activeView === 'finances' && <Finances />}
            {activeView === 'acars' && (
              <Acars
                telemetry={telemetry}
                simConnected={simConnected}
                profile={profile}
                routes={routes}
                airports={airports}
                activeFlightId={activeFlightId}
                setActiveFlightId={setActiveFlightId}
                acarsFlights={acarsFlights}
              />
            )}
            {activeView === 'admin' && <AdminPanel airports={airports} routes={routes} onRefresh={refreshData} />}
            {activeView === 'analytics' && <Analytics airports={airports} routes={routes} />}
            {activeView === 'capacity' && <CapacityChecker airports={airports} routes={routes} />}
            {activeView === 'routeplanner' && <RoutePlanner airports={airports} routes={routes} />}
            {activeView === 'livemap' && <LiveMap flights={acarsFlights} positions={flightPositions} telemetry={telemetry} profile={profile} />}
            {activeView === 'routenetwork' && (<RouteNetwork airports={airports} routes={routes} />)}
          </div>
        </main>
      </div>

      {/* Pilot Settings Modal */}
      {showPilotSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pilot Settings</h2>
              <button onClick={() => setShowPilotSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Pilot Name</label>
                <input
                  type="text"
                  value={pilotName}
                  onChange={e => setPilotName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Pilot ID</label>
                <input
                  type="text"
                  value={pilotId}
                  onChange={e => setPilotId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Email</label>
                <input
                  type="email"
                  value={pilotEmail}
                  onChange={e => setPilotEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">SimBrief ID</label>
                <input
                  type="text"
                  value={simbriefId}
                  onChange={e => setSimbriefId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
              </div>
              {pilotSaveMsg && (
                <p className={`text-sm ${pilotSaveMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{pilotSaveMsg}</p>
              )}
              <button
                onClick={savePilotSettings}
                disabled={savingPilot}
                className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              >
                {savingPilot ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                onClick={() => { setShowPilotSettings(false); setShowPasswordReset(true); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Password Reset</h2>
              <button onClick={() => setShowPasswordReset(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="pilot@compassatlantic.com"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
              </div>
              {resetMsg && <p className="text-sm text-emerald-400">{resetMsg}</p>}
              {resetErr && <p className="text-sm text-red-400">{resetErr}</p>}
              <button
                onClick={handlePasswordReset}
                className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all"
              >
                Send Reset Link
              </button>
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <label className="text-xs text-slate-500 mb-1 block">Update Password (if logged in)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                />
                {passwordUpdateMsg && <p className="text-sm text-emerald-400 mt-2">{passwordUpdateMsg}</p>}
                {passwordUpdateErr && <p className="text-sm text-red-400 mt-2">{passwordUpdateErr}</p>}
                <button
                  onClick={handlePasswordUpdate}
                  className="w-full mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AppUpdater />
    </div>
  );
}

function NavButton({ item, activeView, setActiveView, darkMode }: {
  item: { id: ActiveView; label: string; icon: React.FC<{ className?: string }> };
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;
  darkMode: boolean;
}) {
  const Icon = item.icon;
  const isActive = activeView === item.id;
  return (
    <button
      onClick={() => setActiveView(item.id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-sky-500 text-white font-medium'
          : darkMode
            ? 'text-slate-300 hover:bg-slate-800'
            : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{item.label}</span>
    </button>
  );
}
