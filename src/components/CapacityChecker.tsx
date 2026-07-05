import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool } from '../lib/types';
import { Search, Users, ArrowRight, Plane, MapPin, AlertCircle } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

interface CapacityCheckerProps {
  airports: Airport[];
  routes: Route[];
}

type ReachType = 'terminating' | '1-hop' | '2-hop';

interface PaxBreakdown {
  pool: PaxPool;
  type: ReachType;
}

export default function CapacityChecker({ airports, routes }: CapacityCheckerProps) {
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [seats, setSeats] = useState(0);
  const [results, setResults] = useState<PaxBreakdown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeRoutes = useMemo(() => routes.filter(r => r.is_active), [routes]);
  const availableRoutes = activeRoutes.filter(r => r.departure_icao === departure);
  const arrivalOptions = useMemo(() => [...new Set(availableRoutes.map(r => r.arrival_icao))].sort(), [availableRoutes]);
  const allAirportCodes = useMemo(() => airports.map(a => a.icao_code).sort(), [airports]);

  async function checkCapacity() {
    if (!departure || !arrival || seats <= 0) {
      setError('Please select airports and enter available seats.');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    const allRows: PaxPool[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error: fetchErr } = await supabase
        .from('pax_pools')
        .select('*')
        .eq('current_airport_icao', departure)
        .in('status', ['waiting', 'layover'])
        .range(from, from + pageSize - 1);

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }
      if (data && data.length > 0) {
        allRows.push(...data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    // Build reachability sets exactly as Dispatch does
    const arrivalIcao = arrival.toUpperCase();
    const departureIcao = departure.toUpperCase();

    // 1-hop: destinations directly reachable from the arrival airport
    const destsFromArrival = new Set(
      activeRoutes.filter(r => r.departure_icao === arrivalIcao).map(r => r.arrival_icao)
    );

    // 2-hop: destinations reachable from arrival via one intermediate
    const destsFromArrival2Hop = new Set<string>();
    destsFromArrival.forEach(intermediate => {
      activeRoutes.filter(r => r.departure_icao === intermediate).forEach(r => {
        destsFromArrival2Hop.add(r.arrival_icao);
      });
    });

    // Better-route exclusion: 1-hop reachability via OTHER routes from departure
    const otherIntermediates = activeRoutes
      .filter(r => r.departure_icao === departureIcao && r.arrival_icao !== arrivalIcao)
      .map(r => r.arrival_icao);
    const destsViaOtherRoutes1Hop = new Set<string>();
    otherIntermediates.forEach(intermediate => {
      activeRoutes.filter(r => r.departure_icao === intermediate).forEach(r => {
        destsViaOtherRoutes1Hop.add(r.arrival_icao);
      });
    });

    // Filter eligible pools using the same logic as Dispatch
    const breakdown: PaxBreakdown[] = [];

    for (const pool of allRows) {
      if (pool.destination_icao === arrivalIcao) {
        breakdown.push({ pool, type: 'terminating' });
      } else if (pool.connections_remaining > 0 && destsFromArrival.has(pool.destination_icao)) {
        breakdown.push({ pool, type: '1-hop' });
      } else if (pool.connections_remaining > 1 && destsFromArrival2Hop.has(pool.destination_icao)) {
        // Better-route exclusion: skip if a 1-hop path exists via another route
        if (destsViaOtherRoutes1Hop.has(pool.destination_icao)) continue;
        breakdown.push({ pool, type: '2-hop' });
      }
    }

    // Sort matching Dispatch priority: terminating > 1-hop > 2-hop > layover > fewer connections
    breakdown.sort((a, b) => {
      const typeOrder: Record<ReachType, number> = { 'terminating': 0, '1-hop': 1, '2-hop': 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      // 1-hop reachable before 2-hop already handled above
      const aDirectReach = destsFromArrival.has(a.pool.destination_icao) ? 0 : 1;
      const bDirectReach = destsFromArrival.has(b.pool.destination_icao) ? 0 : 1;
      if (aDirectReach !== bDirectReach) return aDirectReach - bDirectReach;
      const aIsLayover = a.pool.status === 'layover' ? 0 : 1;
      const bIsLayover = b.pool.status === 'layover' ? 0 : 1;
      if (aIsLayover !== bIsLayover) return aIsLayover - bIsLayover;
      return a.pool.connections_remaining - b.pool.connections_remaining;
    });

    setResults(breakdown);
    setLoading(false);
  }

  const totalEligible = results?.reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const terminatingPax = results?.filter(r => r.type === 'terminating').reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const oneHopPax = results?.filter(r => r.type === '1-hop').reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const twoHopPax = results?.filter(r => r.type === '2-hop').reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const boarding = Math.min(totalEligible, seats);
  const leftBehind = Math.max(0, totalEligible - seats);

  // Grouped manifest (same as Dispatch)
  const manifest = useMemo(() => {
    if (!results || results.length === 0) return [];
    const grouped: Record<string, { origin_icao: string; destination_icao: string; pax_count: number; type: ReachType }> = {};
    for (const r of results) {
      const key = `${r.pool.origin_icao}-${r.pool.destination_icao}`;
      if (!grouped[key]) {
        grouped[key] = { origin_icao: r.pool.origin_icao, destination_icao: r.pool.destination_icao, pax_count: 0, type: r.type };
      }
      grouped[key].pax_count += r.pool.pax_count;
    }
    return Object.values(grouped).sort((a, b) => {
      const typeOrder: Record<ReachType, number> = { 'terminating': 0, '1-hop': 1, '2-hop': 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      return b.pax_count - a.pax_count;
    });
  }, [results]);

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <Search className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">Capacity Checker</h2>
            <p className="text-slate-400 text-sm">Check total passenger demand for a specific leg</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Departure</label>
            <SearchableSelect
              value={departure}
              onChange={(v) => { setDeparture(v); if (arrival && !routes.some(r => r.is_active && r.departure_icao === v && r.arrival_icao === arrival)) setArrival(''); }}
              options={allAirportCodes}
              placeholder="Search airport..."
              airports={airports}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Arrival</label>
            <SearchableSelect
              value={arrival}
              onChange={setArrival}
              options={arrivalOptions}
              placeholder={departure ? "Search destination..." : "Select departure first"}
              airports={airports}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Available Seats</label>
            <input
              type="number"
              min={1}
              value={seats || ''}
              onChange={e => setSeats(parseInt(e.target.value) || 0)}
              placeholder="e.g. 150"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          onClick={checkCapacity}
          disabled={loading || !departure || !arrival || seats <= 0}
          className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:text-slate-400 text-slate-900 font-semibold text-sm rounded-lg transition-all"
        >
          {loading ? 'Checking...' : 'Check Demand'}
        </button>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Total Demand</p>
              <p className="text-2xl font-bold text-white">{totalEligible}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Can Board</p>
              <p className={`text-2xl font-bold ${boarding >= seats ? 'text-emerald-400' : 'text-amber-400'}`}>{boarding}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Terminating</p>
              <p className="text-2xl font-bold text-sky-400">{terminatingPax}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">1-Hop Connect</p>
              <p className="text-2xl font-bold text-violet-400">{oneHopPax}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">2-Hop Connect</p>
              <p className="text-2xl font-bold text-amber-400">{twoHopPax}</p>
            </div>
          </div>

          {/* Capacity bar */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Load Factor</span>
              <span>{Math.min(100, Math.round((totalEligible / seats) * 100))}% ({boarding}/{seats} seats)</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  totalEligible >= seats ? 'bg-emerald-500' : totalEligible >= seats * 0.7 ? 'bg-amber-500' : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(100, (totalEligible / seats) * 100)}%` }}
              />
            </div>
            {leftBehind > 0 && (
              <p className="text-xs text-amber-400 mt-2">
                {leftBehind} passengers will need to wait for a later flight
              </p>
            )}
            {totalEligible < seats && (
              <p className="text-xs text-slate-500 mt-2">
                {seats - totalEligible} seats will be empty on this leg
              </p>
            )}
          </div>

          {/* Grouped Manifest */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Demand Manifest</h3>
              <span className="text-xs text-slate-500">{manifest.length} group{manifest.length !== 1 ? 's' : ''}</span>
            </div>
            {manifest.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No eligible passengers at {departure} for this leg</p>
              </div>
            ) : (
              <div className="p-4">
                <div className="space-y-1.5">
                  {manifest.map(row => (
                    <div key={`${row.origin_icao}-${row.destination_icao}`} className="flex items-center gap-3 text-sm bg-slate-900/50 rounded-lg px-3 py-2">
                      <span className="text-white font-mono font-semibold w-10 text-right">{row.pax_count}</span>
                      <span className="text-slate-500 text-xs">PAX</span>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-300 font-mono">{row.origin_icao}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-600" />
                      <div className="flex items-center gap-1.5">
                        <Plane className="w-3 h-3 text-slate-500" />
                        <span className={`font-mono ${
                          row.type === 'terminating' ? 'text-emerald-400' : row.type === '1-hop' ? 'text-violet-400' : 'text-amber-400'
                        }`}>
                          {row.destination_icao}
                        </span>
                      </div>
                      <span className={`ml-auto text-[10px] px-2 py-0.5 rounded font-medium ${
                        row.type === 'terminating'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : row.type === '1-hop'
                          ? 'bg-violet-500/10 text-violet-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {row.type === 'terminating' ? 'FINAL' : row.type === '1-hop' ? '1-HOP' : '2-HOP'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Route info */}
          {results.length > 0 && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <AlertCircle className="w-3 h-3" />
                <span>
                  Showing total demand at <span className="text-white font-medium">{departure}</span> eligible for <span className="text-white font-medium">{arrival}</span> (includes already-booked PAX). Uses same eligibility rules as Dispatch including better-route exclusion.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
