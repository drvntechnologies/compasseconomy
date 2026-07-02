import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool, FlightLog } from '../lib/types';
import { Users, Plane, MapPin, ArrowRight, Clock, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
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

export default function Dashboard({ airports, routes }: DashboardProps) {
  const [paxPools, setPaxPools] = useState<PaxPool[]>([]);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const [pools, logsRes] = await Promise.all([
      fetchAllPaxPools(),
      supabase.from('flight_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setPaxPools(pools);
    if (logsRes.data) setFlightLogs(logsRes.data);
    setLastRefresh(new Date());
    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = window.setInterval(() => fetchData(true), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

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

  const airportSummaries: AirportSummary[] = airports.map(apt => {
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
  }).sort((a, b) => b.totalPools - a.totalPools);

  const totalWaiting = airportSummaries.reduce((s, a) => s + a.waitingPax, 0);
  const totalLayover = airportSummaries.reduce((s, a) => s + a.layoverPax, 0);
  const totalArrived = airportSummaries.reduce((s, a) => s + a.arrivedPax, 0);
  const totalInTransit = paxPools
    .filter(p => p.status === 'in_transit')
    .reduce((s, p) => s + p.pax_count, 0);

  const selectedSummary = selectedAirport
    ? airportSummaries.find(a => a.icao === selectedAirport)
    : null;

  const selectedPools = selectedAirport
    ? paxPools.filter(p => p.current_airport_icao === selectedAirport && (p.status === 'waiting' || p.status === 'layover'))
    : [];

  // Group pax by final destination for the selected airport
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

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

      {/* Stats row */}
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
