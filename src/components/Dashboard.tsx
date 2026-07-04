import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool, FlightLog } from '../lib/types';
import { Users, Plane, MapPin, ArrowRight, Clock, CheckCircle, ExternalLink, RefreshCw, TrendingUp, Trophy, DollarSign, Calendar, BarChart3 } from 'lucide-react';
import AirportDetailModal from './AirportDetailModal';

interface DashboardProps {
  airports: Airport[];
  routes: Route[];
}

interface AirportSummary {
  icao: string;
  isHub: boolean;
  waitingPax: number;
  layoverPax: number;
  arrivedPax: number;
  totalPools: number;
}

interface PilotStats {
  userId: string;
  displayName: string;
  flights: number;
  paxDelivered: number;
  engineHours: number;
}

interface PeriodStats {
  flights: number;
  paxFlown: number;
  revenue: number;
  engineHours: number;
  topRoute: string | null;
}

export default function Dashboard({ airports, routes }: DashboardProps) {
  const [paxPools, setPaxPools] = useState<PaxPool[]>([]);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Performance stats
  const [todayGenerated, setTodayGenerated] = useState(0);
  const [todayFlown, setTodayFlown] = useState(0);
  const [todayFlights, setTodayFlights] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [weeklyStats, setWeeklyStats] = useState<PeriodStats>({ flights: 0, paxFlown: 0, revenue: 0, engineHours: 0, topRoute: null });
  const [monthlyStats, setMonthlyStats] = useState<PeriodStats>({ flights: 0, paxFlown: 0, revenue: 0, engineHours: 0, topRoute: null });
  const [pilotLeaderboard, setPilotLeaderboard] = useState<PilotStats[]>([]);
  const [fleetUtilization, setFleetUtilization] = useState({ total: 0, active: 0 });
  const [statsTab, setStatsTab] = useState<'today' | 'week' | 'month'>('today');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const [pools, logsRes] = await Promise.all([
      fetchAllPaxPools(),
      supabase.from('flight_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setPaxPools(pools);
    if (logsRes.data) setFlightLogs(logsRes.data);
    await fetchPerformanceStats();
    setLastRefresh(new Date());
    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = window.setInterval(() => fetchData(true), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  async function fetchPerformanceStats() {
    // Operational day starts at 0400Z (when pax regenerate)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const operationalDayStart = new Date(now);
    if (utcHour < 4) {
      operationalDayStart.setUTCDate(operationalDayStart.getUTCDate() - 1);
    }
    operationalDayStart.setUTCHours(4, 0, 0, 0);
    const operationalDate = operationalDayStart.toISOString().slice(0, 10);
    const operationalStartISO = operationalDayStart.toISOString();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const monthStart = operationalDate.slice(0, 7) + '-01';

    const [
      todayGenRes,
      todayLogsRes,
      todayRevenueRes,
      weekLogsRes,
      weekRevenueRes,
      weekHoursRes,
      monthLogsRes,
      monthRevenueRes,
      monthHoursRes,
      fleetRes,
      pilotLogsRes,
      profilesRes,
    ] = await Promise.all([
      supabase.from('pax_pools').select('pax_count').eq('generated_date', operationalDate),
      supabase.from('flight_logs').select('*').gte('created_at', operationalStartISO),
      supabase.from('financial_transactions').select('amount').eq('type', 'ticket_revenue').gte('created_at', operationalStartISO),
      supabase.from('flight_logs').select('*').gte('flight_date', weekAgo),
      supabase.from('financial_transactions').select('amount').eq('type', 'ticket_revenue').gte('created_at', weekAgo + 'T00:00:00Z'),
      supabase.from('flight_bookings').select('engine_hours').eq('status', 'completed').gte('created_at', weekAgo + 'T00:00:00Z'),
      supabase.from('flight_logs').select('*').gte('flight_date', monthStart),
      supabase.from('financial_transactions').select('amount').eq('type', 'ticket_revenue').gte('created_at', monthStart + 'T00:00:00Z'),
      supabase.from('flight_bookings').select('engine_hours').eq('status', 'completed').gte('created_at', monthStart + 'T00:00:00Z'),
      supabase.from('aircraft').select('id, status'),
      supabase.from('flight_logs').select('user_id, pax_count, flight_number').gte('flight_date', weekAgo),
      supabase.from('profiles').select('id, display_name'),
    ]);

    // Today's generated pax
    const genTotal = (todayGenRes.data || []).reduce((s, r) => s + r.pax_count, 0);
    setTodayGenerated(genTotal);

    // Today's flown pax and flights
    const todayLogs = todayLogsRes.data || [];
    setTodayFlown(todayLogs.reduce((s, l) => s + l.pax_count, 0));
    setTodayFlights(todayLogs.length);

    // Today's revenue
    setTodayRevenue((todayRevenueRes.data || []).reduce((s, t) => s + Number(t.amount), 0));

    // Weekly stats
    const wLogs = weekLogsRes.data || [];
    const wRevenue = (weekRevenueRes.data || []).reduce((s, t) => s + Number(t.amount), 0);
    const wHours = (weekHoursRes.data || []).reduce((s, b) => s + Number(b.engine_hours || 0), 0);
    const wRouteMap: Record<string, number> = {};
    wLogs.forEach(l => {
      const key = `${l.departure_icao}-${l.arrival_icao}`;
      wRouteMap[key] = (wRouteMap[key] || 0) + 1;
    });
    const wTopRoute = Object.entries(wRouteMap).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
    setWeeklyStats({
      flights: wLogs.length,
      paxFlown: wLogs.reduce((s, l) => s + l.pax_count, 0),
      revenue: wRevenue,
      engineHours: wHours,
      topRoute: wTopRoute,
    });

    // Monthly stats
    const mLogs = monthLogsRes.data || [];
    const mRevenue = (monthRevenueRes.data || []).reduce((s, t) => s + Number(t.amount), 0);
    const mHours = (monthHoursRes.data || []).reduce((s, b) => s + Number(b.engine_hours || 0), 0);
    const mRouteMap: Record<string, number> = {};
    mLogs.forEach(l => {
      const key = `${l.departure_icao}-${l.arrival_icao}`;
      mRouteMap[key] = (mRouteMap[key] || 0) + 1;
    });
    const mTopRoute = Object.entries(mRouteMap).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
    setMonthlyStats({
      flights: mLogs.length,
      paxFlown: mLogs.reduce((s, l) => s + l.pax_count, 0),
      revenue: mRevenue,
      engineHours: mHours,
      topRoute: mTopRoute,
    });

    // Fleet utilization
    const fleet = fleetRes.data || [];
    setFleetUtilization({
      total: fleet.length,
      active: fleet.filter(a => a.status === 'reserved' || a.status === 'in_flight').length,
    });

    // Pilot leaderboard (last 7 days)
    const profiles = profilesRes.data || [];
    const profileMap: Record<string, string> = {};
    profiles.forEach(p => { profileMap[p.id] = p.display_name || p.id.slice(0, 8); });

    const pLogs = pilotLogsRes.data || [];
    const pilotMap: Record<string, { flights: number; pax: number }> = {};
    pLogs.forEach(l => {
      if (!pilotMap[l.user_id]) pilotMap[l.user_id] = { flights: 0, pax: 0 };
      pilotMap[l.user_id].flights += 1;
      pilotMap[l.user_id].pax += l.pax_count;
    });

    // Get engine hours per pilot
    const pilotIds = Object.keys(pilotMap);
    let pilotHoursMap: Record<string, number> = {};
    if (pilotIds.length > 0) {
      const { data: bookingsData } = await supabase
        .from('flight_bookings')
        .select('user_id, engine_hours')
        .eq('status', 'completed')
        .gte('created_at', weekAgo + 'T00:00:00Z')
        .in('user_id', pilotIds);
      (bookingsData || []).forEach(b => {
        pilotHoursMap[b.user_id] = (pilotHoursMap[b.user_id] || 0) + Number(b.engine_hours || 0);
      });
    }

    const leaderboard: PilotStats[] = Object.entries(pilotMap)
      .map(([userId, stats]) => ({
        userId,
        displayName: profileMap[userId] || userId.slice(0, 8),
        flights: stats.flights,
        paxDelivered: stats.pax,
        engineHours: pilotHoursMap[userId] || 0,
      }))
      .sort((a, b) => b.paxDelivered - a.paxDelivered);

    setPilotLeaderboard(leaderboard);
  }

  async function fetchAllPaxPools(): Promise<PaxPool[]> {
    const allRows: PaxPool[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('pax_pools')
        .select('*')
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        allRows.push(...data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    return allRows;
  }

  const airportSummaries: AirportSummary[] = useMemo(() => airports.map(apt => {
    const waiting = paxPools
      .filter(p => p.current_airport_icao === apt.icao_code && p.status === 'waiting')
      .reduce((sum, p) => sum + p.pax_count, 0);
    const layover = paxPools
      .filter(p => p.current_airport_icao === apt.icao_code && p.status === 'layover')
      .reduce((sum, p) => sum + p.pax_count, 0);
    const arrived = paxPools
      .filter(p => p.destination_icao === apt.icao_code && p.status === 'arrived')
      .reduce((sum, p) => sum + p.pax_count, 0);
    return {
      icao: apt.icao_code,
      isHub: apt.is_hub,
      waitingPax: waiting,
      layoverPax: layover,
      arrivedPax: arrived,
      totalPools: waiting + layover,
    };
  }).sort((a, b) => b.totalPools - a.totalPools), [airports, paxPools]);

  const totalWaiting = airportSummaries.reduce((s, a) => s + a.waitingPax, 0);
  const totalLayover = airportSummaries.reduce((s, a) => s + a.layoverPax, 0);
  const totalArrived = airportSummaries.reduce((s, a) => s + a.arrivedPax, 0);
  const totalInTransit = paxPools
    .filter(p => p.status === 'in_transit')
    .reduce((s, p) => s + p.pax_count, 0);

  const dailyPaxPercent = todayGenerated > 0 ? Math.round((todayFlown / todayGenerated) * 100) : 0;

  const selectedSummary = selectedAirport
    ? airportSummaries.find(a => a.icao === selectedAirport)
    : null;

  const selectedPools = selectedAirport
    ? paxPools.filter(p => p.current_airport_icao === selectedAirport && (p.status === 'waiting' || p.status === 'layover'))
    : [];

  const destinationBreakdown = selectedAirport
    ? selectedPools.reduce<Record<string, { total: number; direct: number; connecting: number }>>((acc, pool) => {
        const dest = pool.destination_icao;
        if (!acc[dest]) acc[dest] = { total: 0, direct: 0, connecting: 0 };
        acc[dest].total += pool.pax_count;
        if (pool.connections_remaining === 0 && pool.destination_icao !== selectedAirport) {
          acc[dest].direct += pool.pax_count;
        } else {
          acc[dest].connecting += pool.pax_count;
        }
        return acc;
      }, {})
    : {};

  const sortedDestinations = Object.entries(destinationBreakdown)
    .sort(([, a], [, b]) => b.total - a.total);

  const availableRoutes = selectedAirport
    ? routes.filter(r => r.departure_icao === selectedAirport && r.is_active)
    : [];

  function getPercentColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-400';
    if (pct >= 40) return 'text-amber-400';
    return 'text-red-400';
  }

  function getPercentBg(pct: number): string {
    if (pct >= 70) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeStats = statsTab === 'today'
    ? { flights: todayFlights, paxFlown: todayFlown, revenue: todayRevenue, engineHours: 0, topRoute: null }
    : statsTab === 'week' ? weeklyStats : monthlyStats;

  return (
    <div className="space-y-6">
      {/* Refresh indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {lastRefresh && (
            <span>Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          {refreshing && (
            <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Daily Performance Hero */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-xl border border-slate-700 p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">Today's Performance</h2>
            <p className="text-slate-400 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* PAX Flown % - Hero metric */}
          <div className="sm:col-span-2 lg:col-span-1 bg-slate-900/60 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-slate-700"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${dailyPaxPercent}, 100`}
                  className={getPercentColor(dailyPaxPercent)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${getPercentColor(dailyPaxPercent)}`}>{dailyPaxPercent}%</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs text-center font-medium">PAX Moved</p>
            <p className="text-slate-500 text-[10px] text-center mt-0.5">{todayFlown.toLocaleString()} / {todayGenerated.toLocaleString()}</p>
          </div>

          {/* Flights */}
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Plane className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-xs font-medium">Flights</span>
            </div>
            <p className="text-2xl font-bold text-white">{todayFlights}</p>
            <p className="text-slate-500 text-[10px] mt-1">completed today</p>
          </div>

          {/* Revenue */}
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs font-medium">Revenue</span>
            </div>
            <p className="text-2xl font-bold text-white">${todayRevenue.toLocaleString()}</p>
            <p className="text-slate-500 text-[10px] mt-1">ticket revenue today</p>
          </div>

          {/* Fleet Utilization */}
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400 text-xs font-medium">Fleet Active</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {fleetUtilization.total > 0 ? Math.round((fleetUtilization.active / fleetUtilization.total) * 100) : 0}%
            </p>
            <p className="text-slate-500 text-[10px] mt-1">{fleetUtilization.active} / {fleetUtilization.total} aircraft</p>
          </div>

          {/* PAX Generated today */}
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400 text-xs font-medium">Demand</span>
            </div>
            <p className="text-2xl font-bold text-white">{todayGenerated.toLocaleString()}</p>
            <p className="text-slate-500 text-[10px] mt-1">PAX generated today</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400">Daily progress</span>
            <span className={`font-medium ${getPercentColor(dailyPaxPercent)}`}>{todayFlown.toLocaleString()} of {todayGenerated.toLocaleString()} PAX</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getPercentBg(dailyPaxPercent)}`}
              style={{ width: `${Math.min(dailyPaxPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Weekly / Monthly Stats + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Period Stats */}
        <div className="lg:col-span-2 bg-slate-800/50 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-sky-400" />
              <h3 className="text-white font-semibold">Performance Stats</h3>
            </div>
            <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
              {(['today', 'week', 'month'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatsTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    statsTab === tab
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab === 'today' ? 'Today' : tab === 'week' ? '7 Days' : 'Month'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-medium mb-1">Flights</p>
              <p className="text-2xl font-bold text-white">{activeStats.flights}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-medium mb-1">PAX Delivered</p>
              <p className="text-2xl font-bold text-white">{activeStats.paxFlown.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-medium mb-1">Revenue</p>
              <p className="text-2xl font-bold text-emerald-400">${activeStats.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-medium mb-1">Engine Hours</p>
              <p className="text-2xl font-bold text-white">{activeStats.engineHours.toFixed(1)}</p>
            </div>
          </div>

          {activeStats.topRoute && (
            <div className="mt-4 flex items-center gap-2 text-sm bg-slate-900/50 rounded-lg px-4 py-2.5">
              <Plane className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400">Top Route:</span>
              <span className="text-white font-mono font-semibold">{activeStats.topRoute.replace('-', ' -> ')}</span>
            </div>
          )}

          {statsTab !== 'today' && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-xs font-medium mb-1">Avg PAX / Flight</p>
                <p className="text-xl font-bold text-white">
                  {activeStats.flights > 0 ? Math.round(activeStats.paxFlown / activeStats.flights) : 0}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-xs font-medium mb-1">Revenue / Flight</p>
                <p className="text-xl font-bold text-emerald-400">
                  ${activeStats.flights > 0 ? Math.round(activeStats.revenue / activeStats.flights).toLocaleString() : 0}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pilot Leaderboard */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-white font-semibold">Pilot Leaderboard</h3>
              <p className="text-slate-500 text-[10px]">Last 7 days</p>
            </div>
          </div>

          {pilotLeaderboard.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              No flights recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {pilotLeaderboard.slice(0, 8).map((pilot, idx) => (
                <div
                  key={pilot.userId}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                    idx === 0 ? 'bg-amber-500/5 border border-amber-500/20' :
                    idx === 1 ? 'bg-slate-400/5 border border-slate-500/20' :
                    idx === 2 ? 'bg-orange-500/5 border border-orange-500/20' :
                    'bg-slate-900/30'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                    idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                    idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{pilot.displayName}</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span>{pilot.flights} flights</span>
                      <span>{pilot.engineHours.toFixed(1)} hrs</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sky-300 text-sm font-bold">{pilot.paxDelivered.toLocaleString()}</p>
                    <p className="text-slate-500 text-[10px]">PAX</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PAX Status row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-slate-400 text-sm">Waiting PAX</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalWaiting.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
              <Plane className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-slate-400 text-sm">In Transit</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalInTransit.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-sky-400" />
            </div>
            <span className="text-slate-400 text-sm">On Layover</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalLayover.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-slate-400 text-sm">Arrived at Destination</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalArrived.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Airport list */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Airport PAX Status</h3>
            <span className="text-slate-400 text-sm">{airports.length} airports</span>
          </div>
          <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Airport</th>
                  <th className="px-4 py-3 text-right text-slate-400 font-medium">Waiting</th>
                  <th className="px-4 py-3 text-right text-slate-400 font-medium">Layover</th>
                  <th className="px-4 py-3 text-right text-slate-400 font-medium">Arrived</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {airportSummaries.map(summary => (
                  <tr
                    key={summary.icao}
                    onClick={() => setSelectedAirport(summary.icao)}
                    className={`cursor-pointer transition-colors ${
                      selectedAirport === summary.icao
                        ? 'bg-sky-500/10 border-l-2 border-l-sky-500'
                        : 'hover:bg-slate-700/30'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className={`w-4 h-4 ${summary.isHub ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span className="text-white font-mono font-semibold">{summary.icao}</span>
                        {summary.isHub && (
                          <span className="text-xs bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">HUB</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${summary.waitingPax > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                        {summary.waitingPax.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${summary.layoverPax > 0 ? 'text-sky-300' : 'text-slate-500'}`}>
                        {summary.layoverPax.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${summary.arrivedPax > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {summary.arrivedPax.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {airportSummaries.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No airports configured. Admin needs to upload routes first.
            </div>
          )}
        </div>

        {/* Detail / Flight log panel */}
        <div className="space-y-4">
          {selectedAirport && selectedSummary && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-sky-400" />
                  <h3 className="text-white font-bold text-lg font-mono">{selectedAirport}</h3>
                  {selectedSummary.isHub && (
                    <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full">HUB</span>
                  )}
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1.5 text-xs bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Map & Details
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-amber-300 text-lg font-bold">{selectedSummary.waitingPax.toLocaleString()}</p>
                  <p className="text-slate-400 text-xs">Waiting</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-sky-300 text-lg font-bold">{selectedSummary.layoverPax.toLocaleString()}</p>
                  <p className="text-slate-400 text-xs">Layover</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-emerald-300 text-lg font-bold">{selectedSummary.arrivedPax.toLocaleString()}</p>
                  <p className="text-slate-400 text-xs">Arrived</p>
                </div>
              </div>

              {sortedDestinations.length > 0 && (
                <div className="border-t border-slate-700 pt-3 mt-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Top Destinations</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {sortedDestinations.slice(0, 5).map(([dest, counts]) => {
                      const hasDirectRoute = availableRoutes.some(r => r.arrival_icao === dest);
                      return (
                        <div key={dest} className="flex items-center justify-between text-xs p-1.5 rounded-md bg-slate-900/40">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className={`w-3 h-3 ${hasDirectRoute ? 'text-emerald-400' : 'text-slate-600'}`} />
                            <span className="text-white font-mono font-medium">{dest}</span>
                            {hasDirectRoute && <span className="text-emerald-400 text-[10px] font-medium">DIRECT</span>}
                          </div>
                          <span className="text-white font-semibold">{counts.total}</span>
                        </div>
                      );
                    })}
                    {sortedDestinations.length > 5 && (
                      <button
                        onClick={() => setShowModal(true)}
                        className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        +{sortedDestinations.length - 5} more destinations...
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent flights */}
          {flightLogs.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h3 className="text-white font-semibold mb-3">Recent Flights</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {flightLogs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex items-center justify-between text-xs p-2 bg-slate-900/50 rounded-lg">
                    <div>
                      <span className="text-white font-mono">CPZ{log.flight_number}</span>
                      <span className="text-slate-400 ml-2">
                        {log.departure_icao} <ArrowRight className="w-3 h-3 inline" /> {log.arrival_icao}
                      </span>
                    </div>
                    <span className="text-sky-300 font-medium">{log.pax_count} PAX</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Airport Detail Modal */}
      {showModal && selectedAirport && (
        <AirportDetailModal
          airport={airports.find(a => a.icao_code === selectedAirport)!}
          airports={airports}
          routes={routes}
          paxPools={paxPools}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
