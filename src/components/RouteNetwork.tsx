import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import type { Airport, Route } from '../lib/types';
import { Plane, MapPin, RefreshCw, Route as RouteIcon, Navigation, TrendingUp } from 'lucide-react';

import 'leaflet/dist/leaflet.css';

interface RouteNetworkProps {
  airports: Airport[];
  routes: Route[];
}

interface AirportWithCoords extends Airport {
  latitude: number | null;
  longitude: number | null;
}

function hubIcon(): L.DivIcon {
  return L.divIcon({
    className: 'hub-marker',
    html: `<div style="width: 16px; height: 16px; background: #f59e0b; border: 2px solid #d97706; border-radius: 50%; box-shadow: 0 0 8px rgba(245,158,11,0.6);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function spokeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'spoke-marker',
    html: `<div style="width: 10px; height: 10px; background: #38bdf8; border: 2px solid #0284c7; border-radius: 50%; box-shadow: 0 0 4px rgba(56,189,248,0.4);"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function spokeIconHighlighted(): L.DivIcon {
  return L.divIcon({
    className: 'spoke-marker-hl',
    html: `<div style="width: 14px; height: 14px; background: #38bdf8; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 10px rgba(56,189,248,0.8);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function hubIconHighlighted(): L.DivIcon {
  return L.divIcon({
    className: 'hub-marker-hl',
    html: `<div style="width: 20px; height: 20px; background: #f59e0b; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 12px rgba(245,158,11,0.9);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function NetworkBounds({ airports }: { airports: AirportWithCoords[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current) return;
    const points: [number, number][] = airports
      .filter(a => a.latitude != null && a.longitude != null)
      .map(a => [Number(a.latitude), Number(a.longitude)]);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
      hasFit.current = true;
    } else if (points.length === 1) {
      map.setView(points[0], 5);
      hasFit.current = true;
    }
  }, [airports, map]);

  return null;
}

export default function RouteNetwork({ airports: propAirports, routes: propRoutes }: RouteNetworkProps) {
  const [airports, setAirports] = useState<AirportWithCoords[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [airportsRes, routesRes] = await Promise.all([
      supabase.from('airports').select('*').order('icao_code'),
      supabase.from('routes').select('*').order('flight_number'),
    ]);
    if (airportsRes.data) setAirports(airportsRes.data);
    if (routesRes.data) setRoutes(routesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Start with props for instant render, then fetch fresh data
    setAirports(propAirports as AirportWithCoords[]);
    setRoutes(propRoutes);
    setLoading(false);
    fetchData();

    // Realtime: auto-update when airports or routes change
    const channel = supabase
      .channel('route-network')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'airports' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, propAirports, propRoutes]);

  const airportMap = useMemo(() => {
    const map: Record<string, AirportWithCoords> = {};
    airports.forEach(a => { map[a.icao_code] = a; });
    return map;
  }, [airports]);

  const routeSegments = useMemo(() => {
    return routes
      .filter(r => r.is_active)
      .map(r => {
        const dep = airportMap[r.departure_icao];
        const arr = airportMap[r.arrival_icao];
        if (!dep || !arr || dep.latitude == null || dep.longitude == null || arr.latitude == null || arr.longitude == null) {
          return null;
        }
        return {
          route: r,
          dep: [Number(dep.latitude), Number(dep.longitude)] as [number, number],
          arr: [Number(arr.latitude), Number(arr.longitude)] as [number, number],
          depAirport: dep,
          arrAirport: arr,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [routes, airportMap]);

  const hubs = airports.filter(a => a.is_hub && a.latitude != null && a.longitude != null);
  const spokes = airports.filter(a => !a.is_hub && a.latitude != null && a.longitude != null);
  const activeRoutes = routes.filter(r => r.is_active);
  const inactiveRoutes = routes.filter(r => !r.is_active);

  const airportsWithCoords = airports.filter(a => a.latitude != null && a.longitude != null);
  const airportsWithoutCoords = airports.filter(a => a.latitude == null || a.longitude == null);

  const selectedSegment = routeSegments.find(s => s.route.id === selectedRoute);
  const highlightedIcaos = selectedSegment
    ? new Set([selectedSegment.route.departure_icao, selectedSegment.route.arrival_icao])
    : new Set<string>();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Route Network</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {airportsWithCoords.length} of {airports.length} airports mapped &middot; {routeSegments.length} of {activeRoutes.length} active routes drawn
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <Plane className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">{hubs.length}</p>
            <p className="text-slate-500 text-xs mt-0.5">Hubs</p>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">{spokes.length}</p>
            <p className="text-slate-500 text-xs mt-0.5">Spokes</p>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <RouteIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">{activeRoutes.length}</p>
            <p className="text-slate-500 text-xs mt-0.5">Active Routes</p>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-600/20 rounded-lg flex items-center justify-center">
            <Navigation className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">{inactiveRoutes.length}</p>
            <p className="text-slate-500 text-xs mt-0.5">Inactive</p>
          </div>
        </div>
      </div>

      {airportsWithoutCoords.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-amber-400 text-xs">
          <MapPin className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          {airportsWithoutCoords.length} airport{airportsWithoutCoords.length !== 1 ? 's' : ''} missing coordinates and not shown on map: {airportsWithoutCoords.map(a => a.icao_code).join(', ')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Route list sidebar */}
        <div className="lg:col-span-3">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-white font-semibold text-sm">Routes</span>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono ml-auto">
                {activeRoutes.length}
              </span>
            </div>
            <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-700/50">
              {routeSegments.length === 0 && !loading ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No routes with mapped airports yet
                </div>
              ) : (
                routeSegments.map(seg => {
                  const isSelected = selectedRoute === seg.route.id;
                  return (
                    <button
                      key={seg.route.id}
                      onClick={() => setSelectedRoute(isSelected ? null : seg.route.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-sky-500/10 border-l-2 border-sky-400' : 'hover:bg-slate-700/30 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-mono font-semibold text-sm">
                          CPZ{seg.route.flight_number}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${seg.route.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-600/30 text-slate-400'}`}>
                          {seg.route.flight_type}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="text-amber-400 font-medium">{seg.route.departure_icao}</span>
                        <span className="text-slate-600">&rarr;</span>
                        <span className="text-sky-400 font-medium">{seg.route.arrival_icao}</span>
                        <span className="ml-auto text-slate-500">{seg.route.duration_minutes}m</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected route detail */}
          {selectedSegment && (
            <div className="mt-3 bg-slate-800/50 border border-sky-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-bold font-mono">
                  CPZ{selectedSegment.route.flight_number}
                </h4>
                <span className="text-xs text-sky-400">{selectedSegment.route.flight_type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 bg-slate-900/50 rounded-lg p-2 text-center">
                  <p className="text-amber-400 font-bold text-xs">{selectedSegment.route.departure_icao}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    {selectedSegment.depAirport.is_hub ? 'Hub' : 'Spoke'}
                  </p>
                </div>
                <Navigation className="w-4 h-4 text-slate-500" />
                <div className="flex-1 bg-slate-900/50 rounded-lg p-2 text-center">
                  <p className="text-sky-400 font-bold text-xs">{selectedSegment.route.arrival_icao}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    {selectedSegment.arrAirport.is_hub ? 'Hub' : 'Spoke'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-slate-500 text-[10px]">Duration</p>
                  <p className="text-white font-mono font-bold mt-0.5">{selectedSegment.route.duration_minutes} min</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <p className="text-slate-500 text-[10px]">Ticket</p>
                  <p className="text-white font-mono font-bold mt-0.5">${selectedSegment.route.ticket_price_usd}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-9">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden h-[600px] relative">
            {airportsWithCoords.length === 0 && !loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <MapPin className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No airports with coordinates yet</p>
                <p className="text-xs mt-1">Add airport coordinates in the Admin Panel</p>
              </div>
            ) : (
              <MapContainer
                center={[39.8, -98.5]}
                zoom={4}
                className="h-full w-full"
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <NetworkBounds airports={airports} />

                {/* Route lines */}
                {routeSegments.map(seg => {
                  const isSelected = selectedRoute === seg.route.id;
                  return (
                    <Polyline
                      key={seg.route.id}
                      positions={[seg.dep, seg.arr]}
                      pathOptions={{
                        color: isSelected ? '#38bdf8' : '#0ea5e9',
                        weight: isSelected ? 3 : 1.5,
                        opacity: isSelected ? 0.9 : 0.45,
                      }}
                      eventHandlers={{ click: () => setSelectedRoute(seg.route.id) }}
                    />
                  );
                })}

                {/* Hub markers */}
                {airportsWithCoords.map(airport => {
                  const isHighlighted = highlightedIcaos.has(airport.icao_code);
                  return (
                    <Marker
                      key={airport.id}
                      position={[Number(airport.latitude), Number(airport.longitude)]}
                      icon={airport.is_hub ? (isHighlighted ? hubIconHighlighted() : hubIcon()) : (isHighlighted ? spokeIconHighlighted() : spokeIcon())}
                      zIndexOffset={airport.is_hub ? 1000 : 0}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-bold text-base">{airport.icao_code}</div>
                          <div className="text-xs mt-0.5">
                            <span className={airport.is_hub ? 'text-amber-600 font-semibold' : 'text-blue-600'}>
                              {airport.is_hub ? 'Hub' : 'Spoke'}
                            </span>
                          </div>
                          <div className="text-xs mt-1 text-gray-500">
                            Pax: {airport.min_daily_pax}&ndash;{airport.max_daily_pax}/day
                          </div>
                          {routes.filter(r => r.is_active && (r.departure_icao === airport.icao_code || r.arrival_icao === airport.icao_code)).length > 0 && (
                            <div className="text-xs mt-1 text-gray-500">
                              {routes.filter(r => r.is_active && (r.departure_icao === airport.icao_code || r.arrival_icao === airport.icao_code)).length} route(s)
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}

            {/* Legend overlay */}
            {airportsWithCoords.length > 0 && (
              <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg px-3 py-2 space-y-1.5 pointer-events-none">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 bg-amber-500 rounded-full border border-amber-700" />
                  <span className="text-slate-300">Hub</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 bg-sky-400 rounded-full border border-sky-700" />
                  <span className="text-slate-300">Spoke</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-5 h-0.5 bg-sky-500 opacity-45" />
                  <span className="text-slate-300">Route</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
