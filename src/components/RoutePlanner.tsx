import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool } from '../lib/types';
import { Navigation, Plane, Users, ArrowRight, RotateCcw, Sparkles, MapPin, Clock, ChevronDown } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

interface RoutePlannerProps {
  airports: Airport[];
  routes: Route[];
}

interface PlannedLeg {
  route: Route;
  estimatedPax: number;
  directPax: number;
  connectingPax: number;
  cumulativePax: number;
}

type DurationCategory = 'short' | 'medium' | 'long';

export default function RoutePlanner({ airports, routes }: RoutePlannerProps) {
  const [startAirport, setStartAirport] = useState('');
  const [endAirport, setEndAirport] = useState('');
  const [numLegs, setNumLegs] = useState(3);
  const [durationPrefs, setDurationPrefs] = useState<Set<DurationCategory>>(new Set());
  const [paxPools, setPaxPools] = useState<PaxPool[]>([]);
  const [plan, setPlan] = useState<PlannedLeg[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [poolsLoaded, setPoolsLoaded] = useState(false);

  useEffect(() => {
    fetchPools();
  }, []);

  async function fetchPools() {
    const allRows: PaxPool[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('pax_pools')
        .select('*')
        .in('status', ['waiting', 'layover'])
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        allRows.push(...data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setPaxPools(allRows);
    setPoolsLoaded(true);
  }

  const activeRoutes = useMemo(() => routes.filter(r => r.is_active), [routes]);

  const routesByDeparture = useMemo(() => {
    const map: Record<string, Route[]> = {};
    for (const r of activeRoutes) {
      if (!map[r.departure_icao]) map[r.departure_icao] = [];
      map[r.departure_icao].push(r);
    }
    return map;
  }, [activeRoutes]);

  function filterByDuration(r: Route): boolean {
    if (durationPrefs.size === 0) return true;
    if (durationPrefs.has('short') && r.duration_minutes <= 120) return true;
    if (durationPrefs.has('medium') && r.duration_minutes > 120 && r.duration_minutes <= 300) return true;
    if (durationPrefs.has('long') && r.duration_minutes > 300) return true;
    return false;
  }

  function toggleDuration(cat: DurationCategory) {
    setDurationPrefs(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function scoreRoute(route: Route, currentPools: PaxPool[]): { total: number; direct: number; connecting: number } {
    const arrivalIcao = route.arrival_icao;
    const arrivalIsHub = airports.find(a => a.icao_code === arrivalIcao)?.is_hub ?? false;

    let direct = 0;
    let connecting = 0;

    for (const pool of currentPools) {
      if (pool.current_airport_icao !== route.departure_icao) continue;
      if (pool.status !== 'waiting' && pool.status !== 'layover') continue;

      if (pool.destination_icao === arrivalIcao) {
        direct += pool.pax_count;
      } else if (pool.connections_remaining > 0 && arrivalIsHub) {
        connecting += pool.pax_count;
      }
    }

    return { total: direct + connecting, direct, connecting };
  }

  function generatePlan() {
    if (!startAirport) return;
    setLoading(true);

    const result: PlannedLeg[] = [];
    let currentAirport = startAirport.toUpperCase();
    let simulatedPools = [...paxPools];
    let cumulativePax = 0;

    for (let leg = 0; leg < numLegs; leg++) {
      const available = (routesByDeparture[currentAirport] || []).filter(filterByDuration);
      if (available.length === 0) break;

      // Score all available routes
      const scored = available.map(route => {
        const score = scoreRoute(route, simulatedPools);

        // If end airport is specified and this is the last leg or near-last, bias toward it
        let endBonus = 0;
        if (endAirport) {
          const endCode = endAirport.toUpperCase();
          if (route.arrival_icao === endCode) {
            endBonus = leg === numLegs - 1 ? 5000 : 500;
          } else if (leg >= numLegs - 2) {
            // Check if arrival can reach the end airport
            const canReachEnd = (routesByDeparture[route.arrival_icao] || [])
              .some(r => r.arrival_icao === endCode);
            if (canReachEnd) endBonus = 200;
          }
        }

        return { route, ...score, finalScore: score.total + endBonus };
      });

      scored.sort((a, b) => b.finalScore - a.finalScore);
      const best = scored[0];
      if (!best || best.total === 0) {
        // Even if no pax, still suggest a route if we need to reposition
        if (endAirport && scored.length > 0) {
          const reposition = scored[0];
          cumulativePax += reposition.total;
          result.push({
            route: reposition.route,
            estimatedPax: reposition.total,
            directPax: reposition.direct,
            connectingPax: reposition.connecting,
            cumulativePax,
          });
          currentAirport = reposition.route.arrival_icao;
          continue;
        }
        break;
      }

      cumulativePax += best.total;
      result.push({
        route: best.route,
        estimatedPax: best.total,
        directPax: best.direct,
        connectingPax: best.connecting,
        cumulativePax,
      });

      // Simulate moving pax: remove pools that would board this flight
      const arrivalIsHub = airports.find(a => a.icao_code === best.route.arrival_icao)?.is_hub ?? false;
      simulatedPools = simulatedPools.filter(pool => {
        if (pool.current_airport_icao !== currentAirport) return true;
        if (pool.destination_icao === best.route.arrival_icao) return false;
        if (pool.connections_remaining > 0 && arrivalIsHub) return false;
        return true;
      });

      // Move connecting pax to the arrival airport in the simulation
      simulatedPools = simulatedPools.map(pool => {
        if (pool.current_airport_icao === currentAirport &&
            pool.connections_remaining > 0 && arrivalIsHub) {
          return { ...pool, current_airport_icao: best.route.arrival_icao, connections_remaining: pool.connections_remaining - 1 };
        }
        return pool;
      });

      currentAirport = best.route.arrival_icao;
    }

    setPlan(result);
    setLoading(false);
  }

  const totalEstimatedPax = plan.reduce((s, l) => s + l.estimatedPax, 0);
  const totalDuration = plan.reduce((s, l) => s + l.route.duration_minutes, 0);

  const airportOptions = airports.map(a => a.icao_code).sort();

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center justify-between hover:bg-slate-700/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
            <Navigation className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-left">
            <h3 className="text-white font-semibold">Route Planner</h3>
            <p className="text-slate-400 text-sm">Find the most efficient flight sequence based on passenger demand</p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-700 pt-5">
          {/* Input Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Starting Airport</label>
              <SearchableSelect
                value={startAirport}
                onChange={setStartAirport}
                options={airportOptions}
                placeholder="Search..."
                airports={airports}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">End Airport (optional)</label>
              <SearchableSelect
                value={endAirport}
                onChange={setEndAirport}
                options={airportOptions}
                placeholder="Any / Open"
                allowEmpty
                emptyLabel="Any / Open"
                airports={airports}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Number of Legs</label>
              <input
                type="number"
                value={numLegs}
                onChange={e => setNumLegs(Math.max(1, Math.min(10, Number(e.target.value))))}
                min={1}
                max={10}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Flight Duration</label>
              <div className="flex gap-1.5 flex-wrap">
                {([['short', '<2hr'], ['medium', '2-5hr'], ['long', '>5hr']] as [DurationCategory, string][]).map(([cat, label]) => (
                  <button
                    key={cat}
                    onClick={() => toggleDuration(cat)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                      durationPrefs.has(cat)
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {durationPrefs.size === 0 && (
                <p className="text-[10px] text-slate-500 mt-1">All durations</p>
              )}
            </div>
            <div className="flex items-end">
              <button
                onClick={generatePlan}
                disabled={!startAirport || !poolsLoaded || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
              >
                {loading ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate Plan
              </button>
            </div>
          </div>

          {!poolsLoaded && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full" />
              Loading passenger data...
            </div>
          )}

          {/* Results */}
          {plan.length > 0 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-cyan-400" />
                  <span className="text-white font-semibold">{plan.length} legs</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-white font-semibold">{totalEstimatedPax.toLocaleString()} est. PAX</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-white font-semibold">{formatDuration(totalDuration)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 ml-auto">
                  <MapPin className="w-3 h-3" />
                  {startAirport} {endAirport ? `to ${endAirport}` : '(open ended)'}
                </div>
              </div>

              {/* Flight legs */}
              <div className="relative">
                {/* Connection line */}
                <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-cyan-500/50 via-cyan-500/20 to-transparent" />

                <div className="space-y-3">
                  {plan.map((leg, idx) => (
                    <div key={idx} className="relative flex items-stretch gap-4">
                      {/* Step indicator */}
                      <div className="relative z-10 flex flex-col items-center pt-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-cyan-500 text-slate-900' :
                          idx === plan.length - 1 ? 'bg-emerald-500 text-slate-900' :
                          'bg-slate-700 text-slate-300 border border-slate-600'
                        }`}>
                          {idx + 1}
                        </div>
                      </div>

                      {/* Leg card */}
                      <div className="flex-1 bg-slate-900/60 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-white font-mono font-bold">CPZ{leg.route.flight_number}</span>
                            <span className="text-slate-300 flex items-center gap-1.5 font-mono text-sm">
                              {leg.route.departure_icao}
                              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                              {leg.route.arrival_icao}
                            </span>
                            {airports.find(a => a.icao_code === leg.route.arrival_icao)?.is_hub && (
                              <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">HUB</span>
                            )}
                          </div>
                          <span className="text-slate-400 text-xs">{leg.route.duration_minutes}m</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-cyan-300 font-semibold text-sm">{leg.estimatedPax.toLocaleString()} PAX</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{leg.directPax} direct</span>
                            <span>{leg.connectingPax} connecting</span>
                          </div>
                          {leg.route.airframes && (
                            <span className="text-xs text-slate-500 ml-auto">{leg.route.airframes}</span>
                          )}
                        </div>

                        {/* PAX efficiency bar */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                              style={{ width: `${Math.min(100, (leg.estimatedPax / Math.max(1, totalEstimatedPax / plan.length)) * 50)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500">{Math.round(leg.estimatedPax / Math.max(1, leg.route.duration_minutes) * 60)} PAX/hr</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alternative suggestion */}
              {plan.length < numLegs && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm">
                  Only {plan.length} legs generated -- no further routes available from {plan[plan.length - 1]?.route.arrival_icao}
                  {durationPrefs.size > 0 && ' with your duration preference'}.
                </div>
              )}
            </div>
          )}

          {plan.length === 0 && startAirport && poolsLoaded && !loading && (
            <div className="p-6 text-center text-slate-500 text-sm">
              Set your parameters and click "Generate Plan" to find optimal routes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}