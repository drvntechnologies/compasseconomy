import { X, Plane, MapPin, ArrowRight, Users, RefreshCw } from 'lucide-react';
import type { Airport, Route, PaxPool } from '../lib/types';
import { COASTLINES } from '../lib/coastlines';

const AIRPORT_COORDS: Record<string, [number, number]> = {
  CYQB: [46.79, -71.39],
  CYUL: [45.47, -73.74],
  EDDS: [48.69, 9.22],
  EGPF: [55.87, -4.43],
  EHAM: [52.31, 4.76],
  EIDW: [53.42, -6.27],
  EKCH: [55.62, 12.66],
  KATL: [33.64, -84.43],
  KAUS: [30.19, -97.67],
  KBGR: [44.81, -68.83],
  KBUF: [42.94, -78.73],
  KCMH: [39.99, -82.89],
  KDSM: [41.53, -93.66],
  KDTW: [42.21, -83.35],
  KEWR: [40.69, -74.17],
  KEYW: [24.56, -81.76],
  KGSP: [34.90, -82.22],
  KIAD: [38.95, -77.46],
  KJAX: [30.49, -81.69],
  KLAS: [36.08, -115.15],
  KMCO: [28.43, -81.31],
  KMIA: [25.79, -80.29],
  KMSP: [44.88, -93.22],
  KMSY: [29.99, -90.26],
  KMYR: [33.68, -78.93],
  KRDU: [35.88, -78.79],
  KSAN: [32.73, -117.19],
  KSFO: [37.62, -122.38],
  KSYR: [43.11, -76.11],
  KTPA: [27.98, -82.53],
  LICJ: [38.18, 13.09],
  LLBG: [32.01, 34.88],
  LOWW: [48.11, 16.57],
  LSZH: [47.46, 8.55],
  MDLR: [18.45, -68.91],
  MGGT: [14.58, -90.53],
  MMMX: [19.44, -99.07],
  MMUN: [21.04, -86.87],
  MSLP: [13.44, -89.06],
  MUHA: [22.99, -82.41],
  MWCR: [19.29, -81.36],
  SBGR: [-23.43, -46.47],
  SPJC: [-12.02, -77.11],
  TAPA: [17.14, -61.79],
  TFFR: [16.27, -61.53],
  TJSJ: [18.44, -66.00],
  TNCM: [18.04, -63.11],
};

interface Props {
  airport: Airport;
  airports: Airport[];
  routes: Route[];
  paxPools: PaxPool[];
  onClose: () => void;
}

interface DemandLine {
  from: string;
  to: string;
  pax: number;
  type: 'outbound' | 'inbound' | 'transit';
}

export default function AirportDetailModal({ airport, airports, routes, paxPools, onClose }: Props) {
  const icao = airport.icao_code;

  // Outbound: pax at this airport heading elsewhere
  const outboundPools = paxPools.filter(
    p => p.current_airport_icao === icao && (p.status === 'waiting' || p.status === 'layover')
  );
  const outboundByDest = outboundPools.reduce<Record<string, number>>((acc, p) => {
    acc[p.destination_icao] = (acc[p.destination_icao] || 0) + p.pax_count;
    return acc;
  }, {});

  // Inbound: pax at other airports whose final destination IS this airport
  const inboundPools = paxPools.filter(
    p => p.destination_icao === icao && p.current_airport_icao !== icao && (p.status === 'waiting' || p.status === 'layover')
  );
  const inboundByOrigin = inboundPools.reduce<Record<string, number>>((acc, p) => {
    acc[p.current_airport_icao] = (acc[p.current_airport_icao] || 0) + p.pax_count;
    return acc;
  }, {});

  // Transit: pax at other airports who need to CONNECT through this airport
  // These are pax with connections_remaining > 0 whose destination has a direct route
  // FROM this airport, and who could reach this airport via existing routes
  const routesFromHere = routes.filter(r => r.departure_icao === icao && r.is_active);
  const destinationsFromHere = new Set(routesFromHere.map(r => r.arrival_icao));
  const routesToHere = routes.filter(r => r.arrival_icao === icao && r.is_active);
  const originsToHere = new Set(routesToHere.map(r => r.departure_icao));

  const transitPools = paxPools.filter(p =>
    p.current_airport_icao !== icao &&
    p.destination_icao !== icao &&
    (p.status === 'waiting' || p.status === 'layover') &&
    p.connections_remaining > 0 &&
    originsToHere.has(p.current_airport_icao) &&
    destinationsFromHere.has(p.destination_icao)
  );
  const transitByOrigin = transitPools.reduce<Record<string, { pax: number; dest: string }>>((acc, p) => {
    const key = `${p.current_airport_icao}->${p.destination_icao}`;
    if (!acc[key]) acc[key] = { pax: 0, dest: p.destination_icao };
    acc[key].pax += p.pax_count;
    return acc;
  }, {});
  const transitByCurrentAirport = transitPools.reduce<Record<string, number>>((acc, p) => {
    acc[p.current_airport_icao] = (acc[p.current_airport_icao] || 0) + p.pax_count;
    return acc;
  }, {});

  const sortedTransit = Object.entries(transitByCurrentAirport).sort(([, a], [, b]) => b - a);
  const totalTransit = Object.values(transitByCurrentAirport).reduce((s, v) => s + v, 0);

  // Build demand lines for the map
  const demandLines: DemandLine[] = [
    ...Object.entries(outboundByDest).map(([dest, pax]) => ({
      from: icao, to: dest, pax, type: 'outbound' as const,
    })),
    ...Object.entries(inboundByOrigin).map(([origin, pax]) => ({
      from: origin, to: icao, pax, type: 'inbound' as const,
    })),
    ...sortedTransit.map(([origin, pax]) => ({
      from: origin, to: icao, pax, type: 'transit' as const,
    })),
  ];

  const maxPax = Math.max(...demandLines.map(l => l.pax), 1);

  const totalOutbound = Object.values(outboundByDest).reduce((s, v) => s + v, 0);
  const totalInbound = Object.values(inboundByOrigin).reduce((s, v) => s + v, 0);
  const arrivedHere = paxPools.filter(p => p.current_airport_icao === icao && p.status === 'arrived')
    .reduce((s, p) => s + p.pax_count, 0);
  const layoverHere = paxPools.filter(p => p.current_airport_icao === icao && p.status === 'layover')
    .reduce((s, p) => s + p.pax_count, 0);

  const activeRoutes = routes.filter(r => (r.departure_icao === icao || r.arrival_icao === icao) && r.is_active);

  const sortedOutbound = Object.entries(outboundByDest).sort(([, a], [, b]) => b - a);
  const sortedInbound = Object.entries(inboundByOrigin).sort(([, a], [, b]) => b - a);

  // Transit detail: group by origin -> destination pairs
  const transitPairs = Object.entries(transitByOrigin)
    .sort(([, a], [, b]) => b.pax - a.pax);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${airport.is_hub ? 'bg-amber-400' : 'bg-sky-400'}`} />
            <h2 className="text-xl font-bold text-white font-mono">{icao}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
              {airport.is_hub ? 'HUB' : 'SPOKE'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <StatCard icon={<Users className="w-4 h-4" />} label="Waiting" value={totalOutbound - layoverHere} color="text-amber-400" />
            <StatCard icon={<Plane className="w-4 h-4" />} label="On Layover" value={layoverHere} color="text-sky-400" />
            <StatCard icon={<MapPin className="w-4 h-4" />} label="Arrived" value={arrivedHere} color="text-emerald-400" />
            <StatCard icon={<ArrowRight className="w-4 h-4" />} label="Inbound" value={totalInbound} color="text-cyan-400" />
            <StatCard icon={<RefreshCw className="w-4 h-4" />} label="Transit" value={totalTransit} color="text-violet-400" />
          </div>

          {/* Map */}
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
            <RouteMap
              selectedAirport={icao}
              airports={airports}
              demandLines={demandLines}
              maxPax={maxPax}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-slate-400 px-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-amber-400 rounded" />
              <span>Outbound</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-sky-400 rounded" />
              <span>Inbound</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-violet-400 rounded" />
              <span>Transit (connecting)</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span>Thicker line = more pax</span>
            </div>
          </div>

          {/* Data Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Outbound */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-3 uppercase tracking-wide flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Outbound ({totalOutbound} PAX)
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {sortedOutbound.map(([dest, count]) => {
                  const hasRoute = activeRoutes.some(r => r.departure_icao === icao && r.arrival_icao === dest);
                  const pctOfMax = (count / maxPax) * 100;
                  return (
                    <div key={dest} className="relative flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60">
                      <div className="absolute inset-0 bg-amber-400/5 rounded-lg" style={{ width: `${pctOfMax}%` }} />
                      <div className="relative flex items-center gap-2">
                        <span className="text-white font-mono font-medium">{dest}</span>
                        {hasRoute && <span className="text-emerald-400 text-[10px] font-bold">ROUTE</span>}
                      </div>
                      <span className="relative text-white font-semibold">{count}</span>
                    </div>
                  );
                })}
                {sortedOutbound.length === 0 && <p className="text-slate-500 text-xs">No outbound demand</p>}
              </div>
            </div>

            {/* Inbound */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-semibold text-sky-400 mb-3 uppercase tracking-wide flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Inbound ({totalInbound} PAX)
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {sortedInbound.map(([origin, count]) => {
                  const hasRoute = activeRoutes.some(r => r.departure_icao === origin && r.arrival_icao === icao);
                  const pctOfMax = (count / maxPax) * 100;
                  return (
                    <div key={origin} className="relative flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60">
                      <div className="absolute inset-0 bg-sky-400/5 rounded-lg" style={{ width: `${pctOfMax}%` }} />
                      <div className="relative flex items-center gap-2">
                        <span className="text-white font-mono font-medium">{origin}</span>
                        {hasRoute && <span className="text-emerald-400 text-[10px] font-bold">ROUTE</span>}
                      </div>
                      <span className="relative text-white font-semibold">{count}</span>
                    </div>
                  );
                })}
                {sortedInbound.length === 0 && <p className="text-slate-500 text-xs">No inbound demand</p>}
              </div>
            </div>

            {/* Transit / Connecting */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-semibold text-violet-400 mb-3 uppercase tracking-wide flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Transit ({totalTransit} PAX)
              </h3>
              <p className="text-[10px] text-slate-500 mb-2">PAX that need to connect here en route to their final destination</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {transitPairs.map(([key, { pax, dest }]) => {
                  const origin = key.split('->')[0];
                  return (
                    <div key={key} className="relative flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60">
                      <div className="absolute inset-0 bg-violet-400/5 rounded-lg" style={{ width: `${(pax / maxPax) * 100}%` }} />
                      <div className="relative flex items-center gap-1">
                        <span className="text-white font-mono font-medium">{origin}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                        <span className="text-violet-300 font-mono text-[10px]">{icao}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                        <span className="text-white font-mono font-medium">{dest}</span>
                      </div>
                      <span className="relative text-white font-semibold">{pax}</span>
                    </div>
                  );
                })}
                {transitPairs.length === 0 && (
                  <p className="text-slate-500 text-xs">
                    {airport.is_hub ? 'No transit demand identified' : 'Spokes typically do not handle transit'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Active routes */}
          {activeRoutes.length > 0 && (
            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
                Active Routes ({activeRoutes.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {activeRoutes.map(route => (
                  <div key={route.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-900/60">
                    <span className="text-emerald-400 font-mono font-bold">{route.flight_number}</span>
                    <span className="text-slate-400">
                      {route.departure_icao} <ArrowRight className="w-3 h-3 inline" /> {route.arrival_icao}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <span className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</span>
    </div>
  );
}

function RouteMap({
  selectedAirport,
  airports,
  demandLines,
  maxPax,
}: {
  selectedAirport: string;
  airports: Airport[];
  demandLines: DemandLine[];
  maxPax: number;
}) {
  const MAP_W = 960;
  const MAP_H = 520;
  const PADDING = 50;

  // Gather all relevant airports
  const relevantIcaos = new Set<string>([selectedAirport]);
  demandLines.forEach(l => { relevantIcaos.add(l.from); relevantIcaos.add(l.to); });

  const coordEntries = [...relevantIcaos]
    .map(code => ({ code, coords: AIRPORT_COORDS[code] }))
    .filter((e): e is { code: string; coords: [number, number] } => !!e.coords);

  if (coordEntries.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Insufficient coordinate data for map
      </div>
    );
  }

  const lats = coordEntries.map(e => e.coords[0]);
  const lons = coordEntries.map(e => e.coords[1]);
  const minLat = Math.min(...lats) - 4;
  const maxLat = Math.max(...lats) + 4;
  const minLon = Math.min(...lons) - 6;
  const maxLon = Math.max(...lons) + 6;

  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;

  function project(lat: number, lon: number): { x: number; y: number } | null {
    const x = PADDING + ((lon - minLon) / lonRange) * (MAP_W - 2 * PADDING);
    const y = PADDING + ((maxLat - lat) / latRange) * (MAP_H - 2 * PADDING);
    if (x < -50 || x > MAP_W + 50 || y < -50 || y > MAP_H + 50) return null;
    return { x, y };
  }

  // Project airport positions
  const airportPositions: Record<string, { x: number; y: number }> = {};
  coordEntries.forEach(({ code, coords }) => {
    const pos = project(coords[0], coords[1]);
    if (pos) airportPositions[code] = pos;
  });

  // Project coastlines
  const coastlinePaths: string[] = [];
  for (const polyline of COASTLINES) {
    const segments: string[] = [];
    let started = false;
    for (const [lat, lon] of polyline) {
      const pos = project(lat, lon);
      if (!pos) {
        started = false;
        continue;
      }
      if (!started) {
        segments.push(`M ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
        started = true;
      } else {
        segments.push(`L ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
      }
    }
    if (segments.length > 1) {
      coastlinePaths.push(segments.join(' '));
    }
  }

  // Sort lines so thickest draw on bottom
  const sortedLines = [...demandLines]
    .filter(l => airportPositions[l.from] && airportPositions[l.to])
    .sort((a, b) => b.pax - a.pax);

  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto" style={{ minHeight: 300 }}>
      <defs>
        <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
      </defs>

      <rect width={MAP_W} height={MAP_H} fill="url(#mapGlow)" />

      {/* World map coastlines */}
      {coastlinePaths.map((path, i) => (
        <path
          key={`coast-${i}`}
          d={path}
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.6"
        />
      ))}

      {/* Subtle grid */}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = PADDING + (i / 4) * (MAP_H - 2 * PADDING);
        return <line key={`h${i}`} x1={PADDING} x2={MAP_W - PADDING} y1={y} y2={y} stroke="#0f2340" strokeWidth="0.5" />;
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const x = PADDING + (i / 6) * (MAP_W - 2 * PADDING);
        return <line key={`v${i}`} x1={x} x2={x} y1={PADDING} y2={MAP_H - PADDING} stroke="#0f2340" strokeWidth="0.5" />;
      })}

      {/* Demand lines */}
      {sortedLines.map((line, i) => {
        const from = airportPositions[line.from];
        const to = airportPositions[line.to];
        if (!from || !to) return null;

        const thickness = Math.max(1.5, (line.pax / maxPax) * 12);
        const color = line.type === 'outbound' ? '#f59e0b' : line.type === 'inbound' ? '#38bdf8' : '#a78bfa';
        const opacity = 0.25 + (line.pax / maxPax) * 0.65;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(dist * 0.18, 50);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const nx = dist > 0 ? -dy / dist : 0;
        const ny = dist > 0 ? dx / dist : 0;
        const cx = midX + nx * offset;
        const cy = midY + ny * offset;

        return (
          <path
            key={i}
            d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            opacity={opacity}
            strokeLinecap="round"
          />
        );
      })}

      {/* Airport dots */}
      {Object.entries(airportPositions).map(([code, pos]) => {
        const isSelected = code === selectedAirport;
        const ap = airports.find(a => a.icao_code === code);
        const isHub = ap?.is_hub ?? false;

        return (
          <g key={code}>
            {isSelected && (
              <circle cx={pos.x} cy={pos.y} r={14} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4">
                <animate attributeName="r" values="11;16;11" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2.5s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isSelected ? 6 : isHub ? 4.5 : 3}
              fill={isSelected ? '#f59e0b' : isHub ? '#fbbf24' : '#64748b'}
              stroke={isSelected ? '#fef3c7' : isHub ? '#92400e' : 'none'}
              strokeWidth={isSelected ? 2 : isHub ? 1 : 0}
            />
            <text
              x={pos.x}
              y={pos.y - (isSelected ? 13 : 9)}
              textAnchor="middle"
              fill={isSelected ? '#fef3c7' : isHub ? '#fde68a' : '#94a3b8'}
              fontSize={isSelected ? 11 : 9}
              fontFamily="monospace"
              fontWeight={isSelected ? 'bold' : 'normal'}
            >
              {code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
