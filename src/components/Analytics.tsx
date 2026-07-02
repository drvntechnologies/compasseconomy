import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route } from '../lib/types';
import { TrendingUp, AlertTriangle, CheckCircle, ArrowRight, BarChart3 } from 'lucide-react';

interface AnalyticsProps {
  airports: Airport[];
  routes: Route[];
}

interface AirportHealth {
  icao: string;
  isHub: boolean;
  waitingPax: number;
  layoverPax: number;
  arrivedPax: number;
  outboundRoutes: number;
  inboundRoutes: number;
  score: number;
}

interface RouteUtilization {
  flightNumber: string;
  departure: string;
  arrival: string;
  timesFlown: number;
  totalPax: number;
}

interface DemandHistoryEntry {
  date: string;
  totalGenerated: number;
  airports: number;
}

export default function Analytics({ airports, routes }: AnalyticsProps) {
  const [health, setHealth] = useState<AirportHealth[]>([]);
  const [routeUtil, setRouteUtil] = useState<RouteUtilization[]>([]);
  const [demandHistory, setDemandHistory] = useState<DemandHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAnalytics(); }, [airports, routes]);

  async function fetchAllPools() {
    const allRows: Array<{ current_airport_icao: string; destination_icao: string; status: string; pax_count: number }> = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('pax_pools')
        .select('current_airport_icao, destination_icao, status, pax_count')
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

  async function fetchAnalytics() {
    setLoading(true);
    const [pools, logsRes, demandRes] = await Promise.all([
      fetchAllPools(),
      supabase.from('flight_logs').select('flight_number, departure_icao, arrival_icao, pax_count, flight_date'),
      supabase.from('demand_generation_log').select('airport_icao, pax_generated, generation_date').order('generation_date', { ascending: false }),
    ]);

    const flightLogs = logsRes.data || [];
    const demandLogs = demandRes.data || [];

    // Airport health
    const healthMap: Record<string, AirportHealth> = {};
    for (const apt of airports) {
      healthMap[apt.icao_code] = {
        icao: apt.icao_code,
        isHub: apt.is_hub,
        waitingPax: 0,
        layoverPax: 0,
        arrivedPax: 0,
        outboundRoutes: routes.filter(r => r.departure_icao === apt.icao_code && r.is_active).length,
        inboundRoutes: routes.filter(r => r.arrival_icao === apt.icao_code && r.is_active).length,
        score: 0,
      };
    }
    for (const pool of pools) {
      const h = healthMap[pool.current_airport_icao];
      if (!h) continue;
      if (pool.status === 'waiting') h.waitingPax += pool.pax_count;
      else if (pool.status === 'layover') h.layoverPax += pool.pax_count;
      else if (pool.status === 'arrived' && pool.destination_icao === pool.current_airport_icao) {
        h.arrivedPax += pool.pax_count;
      }
    }
    for (const h of Object.values(healthMap)) {
      const stuckRatio = h.outboundRoutes > 0 ? h.waitingPax / (h.outboundRoutes * 50) : (h.waitingPax > 0 ? 10 : 0);
      h.score = Math.min(10, stuckRatio);
    }
    setHealth(Object.values(healthMap).sort((a, b) => b.score - a.score));

    // Route utilization
    const utilMap: Record<string, RouteUtilization> = {};
    for (const route of routes) {
      utilMap[route.flight_number] = {
        flightNumber: route.flight_number,
        departure: route.departure_icao,
        arrival: route.arrival_icao,
        timesFlown: 0,
        totalPax: 0,
      };
    }
    for (const log of flightLogs) {
      if (utilMap[log.flight_number]) {
        utilMap[log.flight_number].timesFlown += 1;
        utilMap[log.flight_number].totalPax += log.pax_count;
      }
    }
    setRouteUtil(Object.values(utilMap).sort((a, b) => b.totalPax - a.totalPax));

    // Demand history
    const historyMap: Record<string, DemandHistoryEntry> = {};
    for (const log of demandLogs) {
      if (!historyMap[log.generation_date]) {
        historyMap[log.generation_date] = { date: log.generation_date, totalGenerated: 0, airports: 0 };
      }
      historyMap[log.generation_date].totalGenerated += log.pax_generated;
      historyMap[log.generation_date].airports += 1;
    }
    setDemandHistory(Object.values(historyMap).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14));

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalWaiting = health.reduce((s, h) => s + h.waitingPax, 0);
  const totalArrived = health.reduce((s, h) => s + h.arrivedPax, 0);
  const bottlenecks = health.filter(h => h.score >= 3);
  const healthyAirports = health.filter(h => h.score < 1);
  const neverFlown = routeUtil.filter(r => r.timesFlown === 0);
  const totalFlown = routeUtil.reduce((s, r) => s + r.timesFlown, 0);
  const totalPaxMoved = routeUtil.reduce((s, r) => s + r.totalPax, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Waiting" value={totalWaiting} color="text-amber-400" />
        <SummaryCard label="Total Arrived" value={totalArrived} color="text-emerald-400" />
        <SummaryCard label="Flights Logged" value={totalFlown} color="text-sky-400" />
        <SummaryCard label="PAX Moved" value={totalPaxMoved} color="text-cyan-400" />
      </div>

      {/* Network Health */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sky-400" />
          Network Health
          <span className="text-xs text-slate-500 ml-2">
            {bottlenecks.length} bottleneck{bottlenecks.length !== 1 ? 's' : ''} | {healthyAirports.length} healthy
          </span>
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bottlenecks */}
          <div>
            <p className="text-xs text-red-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> High congestion
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {bottlenecks.length === 0 && <p className="text-slate-500 text-xs">No bottlenecks detected</p>}
              {bottlenecks.map(h => (
                <div key={h.icao} className="flex items-center justify-between p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono font-bold text-sm">{h.icao}</span>
                    {h.isHub && <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">HUB</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-amber-300">{h.waitingPax} waiting</span>
                    <span className="text-slate-400">{h.outboundRoutes} routes out</span>
                    <HealthBar score={h.score} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Healthy */}
          <div>
            <p className="text-xs text-emerald-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Well-served
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {healthyAirports.length === 0 && <p className="text-slate-500 text-xs">All airports have some congestion</p>}
              {healthyAirports.slice(0, 10).map(h => (
                <div key={h.icao} className="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono font-bold text-sm">{h.icao}</span>
                    {h.isHub && <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">HUB</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-emerald-300">{h.arrivedPax} arrived</span>
                    <span className="text-slate-400">{h.outboundRoutes} routes out</span>
                    <HealthBar score={h.score} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Route Utilization */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          Route Utilization
          <span className="text-xs text-slate-500 ml-2">
            {neverFlown.length} never flown | {routeUtil.filter(r => r.timesFlown > 0).length} active
          </span>
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Most used */}
          <div>
            <p className="text-xs text-sky-400 font-medium uppercase tracking-wide mb-2">Top Routes by PAX</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {routeUtil.filter(r => r.timesFlown > 0).slice(0, 10).map(r => (
                <div key={r.flightNumber} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono font-medium">CPZ{r.flightNumber}</span>
                    <span className="text-slate-400">
                      {r.departure} <ArrowRight className="w-3 h-3 inline" /> {r.arrival}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{r.timesFlown}x</span>
                    <span className="text-sky-300 font-semibold">{r.totalPax} PAX</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Never flown */}
          <div>
            <p className="text-xs text-amber-400 font-medium uppercase tracking-wide mb-2">Never Flown ({neverFlown.length})</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {neverFlown.slice(0, 15).map(r => (
                <div key={r.flightNumber} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-mono">CPZ{r.flightNumber}</span>
                    <span className="text-slate-500">
                      {r.departure} <ArrowRight className="w-3 h-3 inline" /> {r.arrival}
                    </span>
                  </div>
                </div>
              ))}
              {neverFlown.length > 15 && (
                <p className="text-slate-500 text-xs pl-2">+{neverFlown.length - 15} more...</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Demand History */}
      {demandHistory.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-white font-semibold mb-4">Demand Generation History</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {demandHistory.map(entry => {
              const maxGenerated = Math.max(...demandHistory.map(d => d.totalGenerated));
              const pct = (entry.totalGenerated / maxGenerated) * 100;
              return (
                <div key={entry.date} className="relative flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50">
                  <div className="absolute inset-0 bg-sky-500/5 rounded-lg" style={{ width: `${pct}%` }} />
                  <span className="relative text-white text-sm font-mono">{entry.date}</span>
                  <div className="relative flex items-center gap-4 text-xs">
                    <span className="text-slate-400">{entry.airports} airports</span>
                    <span className="text-sky-300 font-semibold">{entry.totalGenerated.toLocaleString()} PAX</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function HealthBar({ score }: { score: number }) {
  const width = Math.min(100, score * 10);
  const color = score >= 5 ? 'bg-red-500' : score >= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
