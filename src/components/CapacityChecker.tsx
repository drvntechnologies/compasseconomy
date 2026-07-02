import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool } from '../lib/types';
import { Search, Users, ArrowRight, Plane, MapPin, AlertCircle } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

interface CapacityCheckerProps {
  airports: Airport[];
  routes: Route[];
}

interface PaxBreakdown {
  pool: PaxPool;
  type: 'terminating' | 'connecting';
}

export default function CapacityChecker({ airports, routes }: CapacityCheckerProps) {
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [seats, setSeats] = useState(0);
  const [results, setResults] = useState<PaxBreakdown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableRoutes = routes.filter(r => r.is_active && r.departure_icao === departure);
  const arrivalOptions = useMemo(() => [...new Set(availableRoutes.map(r => r.arrival_icao))].sort(), [availableRoutes]);
  const allAirportCodes = useMemo(() => airports.map(a => a.icao_code).sort(), [airports]);

  useEffect(() => {
    if (arrival && !arrivalOptions.includes(arrival)) {
      setArrival('');
    }
  }, [departure]);

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

    const eligible = allRows.filter(pool => {
      if (pool.destination_icao === arrival) return true;
      if (pool.connections_remaining > 0) {
        const canReachFromArrival = canReachDestination(arrival, pool.destination_icao, pool.connections_remaining - 1);
        return canReachFromArrival;
      }
      return false;
    });

    const breakdown: PaxBreakdown[] = eligible.map(pool => ({
      pool,
      type: pool.destination_icao === arrival ? 'terminating' : 'connecting',
    }));

    breakdown.sort((a, b) => {
      if (a.type === 'terminating' && b.type !== 'terminating') return -1;
      if (a.type !== 'terminating' && b.type === 'terminating') return 1;
      return b.pool.pax_count - a.pool.pax_count;
    });

    setResults(breakdown);
    setLoading(false);
  }

  function canReachDestination(fromIcao: string, destIcao: string, hopsLeft: number): boolean {
    if (hopsLeft < 0) return false;
    const activeRoutes = routes.filter(r => r.is_active && r.departure_icao === fromIcao);
    for (const r of activeRoutes) {
      if (r.arrival_icao === destIcao) return true;
      if (hopsLeft > 0 && canReachDestination(r.arrival_icao, destIcao, hopsLeft - 1)) return true;
    }
    return false;
  }

  const totalEligible = results?.reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const terminatingPax = results?.filter(r => r.type === 'terminating').reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const connectingPax = results?.filter(r => r.type === 'connecting').reduce((s, r) => s + r.pool.pax_count, 0) ?? 0;
  const boarding = Math.min(totalEligible, seats);
  const leftBehind = Math.max(0, totalEligible - seats);

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
            <p className="text-slate-400 text-sm">Check passenger demand for a specific leg</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Departure</label>
            <SearchableSelect
              value={departure}
              onChange={setDeparture}
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
          {loading ? 'Checking...' : 'Check Capacity'}
        </button>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Total Eligible</p>
              <p className="text-2xl font-bold text-white">{totalEligible}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Can Board</p>
              <p className={`text-2xl font-bold ${boarding >= seats ? 'text-emerald-400' : 'text-amber-400'}`}>{boarding}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Final Dest. Here</p>
              <p className="text-2xl font-bold text-sky-400">{terminatingPax}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Connecting Thru</p>
              <p className="text-2xl font-bold text-violet-400">{connectingPax}</p>
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

          {/* Breakdown table */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-white font-medium text-sm">Passenger Breakdown</h3>
            </div>
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No eligible passengers at {departure} for this leg</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-slate-500 font-medium bg-slate-900/30">
                  <div className="col-span-2">PAX</div>
                  <div className="col-span-3">Origin</div>
                  <div className="col-span-3">Final Dest</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Status</div>
                </div>
                {results.map((r, i) => (
                  <div
                    key={r.pool.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center ${
                      i < seats ? '' : 'opacity-40'
                    }`}
                  >
                    <div className="col-span-2 font-mono font-semibold text-white">
                      {r.pool.pax_count}
                    </div>
                    <div className="col-span-3 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span className="text-slate-300">{r.pool.origin_icao}</span>
                    </div>
                    <div className="col-span-3 flex items-center gap-1.5">
                      <Plane className="w-3 h-3 text-slate-500" />
                      <span className="text-slate-300">{r.pool.destination_icao}</span>
                    </div>
                    <div className="col-span-2">
                      {r.type === 'terminating' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-500/10 text-sky-400">
                          Final
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-400">
                          Connecting
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.pool.status === 'layover'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-slate-600/30 text-slate-400'
                      }`}>
                        {r.pool.status === 'layover' ? 'Layover' : 'Waiting'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Route info */}
          {results.length > 0 && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ArrowRight className="w-3 h-3" />
                <span>
                  Showing passengers currently at <span className="text-white font-medium">{departure}</span> who can travel toward <span className="text-white font-medium">{arrival}</span> (direct or connecting onward)
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
