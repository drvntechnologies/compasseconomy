import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import type { AcarsFlight, FlightBooking, Airport } from '../lib/types';
import { FLIGHT_PHASE_LABELS } from '../lib/types';
import { Plane, MapPin, Users, Gauge, TrendingUp, Clock, RefreshCw, Maximize2 } from 'lucide-react';

import 'leaflet/dist/leaflet.css';

interface LiveMapProps {
  airports?: Airport[];
  compact?: boolean;
  onExpandClick?: () => void;
}

interface ActiveFlightData {
  acars: AcarsFlight;
  booking: FlightBooking | null;
  pilotName: string;
  aircraftTail: string;
}

interface AirportWithCoords extends Airport {
  latitude: number | null;
  longitude: number | null;
}

function createPlaneIcon(heading: number, isSelected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'plane-marker',
    html: `<div style="transform: rotate(${heading}deg); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${isSelected ? '#38bdf8' : '#22d3ee'}" stroke="${isSelected ? '#0284c7' : '#155e75'}" stroke-width="1.5">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createAirportIcon(isHub: boolean): L.DivIcon {
  return L.divIcon({
    className: 'airport-marker',
    html: `<div style="width: ${isHub ? 14 : 10}px; height: ${isHub ? 14 : 10}px; background: ${isHub ? '#f59e0b' : '#64748b'}; border: 2px solid ${isHub ? '#d97706' : '#475569'}; border-radius: 50%; box-shadow: 0 0 6px ${isHub ? 'rgba(245,158,11,0.5)' : 'rgba(100,116,139,0.3)'}"></div>`,
    iconSize: [isHub ? 14 : 10, isHub ? 14 : 10],
    iconAnchor: [isHub ? 7 : 5, isHub ? 7 : 5],
  });
}

function MapBounds({ flights, airports }: { flights: ActiveFlightData[]; airports: AirportWithCoords[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current) return;
    const points: [number, number][] = [];
    flights.forEach(f => {
      if (f.acars.latitude != null && f.acars.longitude != null) {
        points.push([Number(f.acars.latitude), Number(f.acars.longitude)]);
      }
    });
    airports.forEach(a => {
      if (a.latitude != null && a.longitude != null) {
        points.push([Number(a.latitude), Number(a.longitude)]);
      }
    });
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
      hasFit.current = true;
    } else if (points.length === 1) {
      map.setView(points[0], 6);
      hasFit.current = true;
    }
  }, [flights, airports, map]);

  return null;
}

export default function LiveMap({ compact = false, onExpandClick }: LiveMapProps) {
  const [activeFlights, setActiveFlights] = useState<ActiveFlightData[]>([]);
  const [airportsWithCoords, setAirportsWithCoords] = useState<AirportWithCoords[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [positionHistory, setPositionHistory] = useState<Record<string, [number, number][]>>({});
  const [loading, setLoading] = useState(true);

  const fetchActiveFlights = useCallback(async () => {
    const { data: acarsData } = await supabase
      .from('acars_flights')
      .select('*')
      .is('ended_at', null)
      .not('latitude', 'is', null);

    if (!acarsData || acarsData.length === 0) {
      setActiveFlights([]);
      setLoading(false);
      return;
    }

    const bookingIds = acarsData.map(a => a.booking_id);
    const userIds = [...new Set(acarsData.map(a => a.user_id))];

    const [bookingsRes, profilesRes] = await Promise.all([
      supabase.from('flight_bookings').select('*').in('id', bookingIds),
      supabase.from('profiles').select('id, display_name').in('id', userIds),
    ]);

    const bookingMap: Record<string, FlightBooking> = {};
    bookingsRes.data?.forEach(b => { bookingMap[b.id] = b; });

    const nameMap: Record<string, string> = {};
    profilesRes.data?.forEach(p => { nameMap[p.id] = p.display_name || 'Pilot'; });

    let aircraftMap: Record<string, string> = {};
    const aircraftIds = bookingsRes.data?.filter(b => b.aircraft_id).map(b => b.aircraft_id) || [];
    if (aircraftIds.length > 0) {
      const { data: acData } = await supabase.from('aircraft').select('id, tail_number').in('id', aircraftIds);
      acData?.forEach(a => { aircraftMap[a.id] = a.tail_number; });
    }

    const flights: ActiveFlightData[] = acarsData.map(acars => {
      const booking = bookingMap[acars.booking_id] || null;
      return {
        acars,
        booking,
        pilotName: nameMap[acars.user_id] || 'Pilot',
        aircraftTail: booking?.aircraft_id ? aircraftMap[booking.aircraft_id] || '' : '',
      };
    });

    setActiveFlights(flights);
    setLoading(false);
  }, []);

  const fetchAirportCoords = useCallback(async () => {
    const { data } = await supabase
      .from('airports')
      .select('*')
      .not('latitude', 'is', null);
    if (data) setAirportsWithCoords(data);
  }, []);

  const fetchFlightPath = useCallback(async (flightId: string) => {
    const { data } = await supabase
      .from('acars_position_history')
      .select('latitude, longitude')
      .eq('acars_flight_id', flightId)
      .order('recorded_at', { ascending: true });

    if (data && data.length > 0) {
      const path: [number, number][] = data.map(p => [Number(p.latitude), Number(p.longitude)]);
      setPositionHistory(prev => ({ ...prev, [flightId]: path }));
    }
  }, []);

  useEffect(() => {
    fetchActiveFlights();
    fetchAirportCoords();
    const interval = setInterval(fetchActiveFlights, 15000);
    return () => clearInterval(interval);
  }, [fetchActiveFlights, fetchAirportCoords]);

  useEffect(() => {
    if (selectedFlight) {
      fetchFlightPath(selectedFlight);
    }
  }, [selectedFlight, fetchFlightPath]);

  const selectedData = activeFlights.find(f => f.acars.id === selectedFlight);

  if (compact) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <h3 className="text-white font-semibold text-sm">Live Flights</h3>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
              {activeFlights.length}
            </span>
          </div>
          {onExpandClick && (
            <button
              onClick={onExpandClick}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="View full map"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="h-[280px] relative">
          {activeFlights.length === 0 && !loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <Plane className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">No active flights</p>
            </div>
          ) : (
            <MapContainer
              center={[39.8, -98.5]}
              zoom={4}
              className="h-full w-full"
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapBounds flights={activeFlights} airports={airportsWithCoords} />
              {activeFlights.map(flight => (
                flight.acars.latitude != null && flight.acars.longitude != null && (
                  <Marker
                    key={flight.acars.id}
                    position={[Number(flight.acars.latitude), Number(flight.acars.longitude)]}
                    icon={createPlaneIcon(flight.acars.heading_deg || 0, false)}
                  />
                )
              ))}
            </MapContainer>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Live Map</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeFlights.length} flight{activeFlights.length !== 1 ? 's' : ''} airborne
          </p>
        </div>
        <button
          onClick={() => { fetchActiveFlights(); fetchAirportCoords(); }}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sidebar - Flight List */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Plane className="w-4 h-4 text-cyan-400" />
              <span className="text-white font-semibold text-sm">Active Flights</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-700/50">
              {activeFlights.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No flights currently airborne
                </div>
              ) : (
                activeFlights.map(flight => {
                  const isSelected = selectedFlight === flight.acars.id;
                  return (
                    <button
                      key={flight.acars.id}
                      onClick={() => setSelectedFlight(isSelected ? null : flight.acars.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-sky-500/10 border-l-2 border-sky-400' : 'hover:bg-slate-700/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-mono font-semibold text-sm">
                          CPZ{flight.booking?.flight_number || '???'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {FLIGHT_PHASE_LABELS[flight.acars.phase as keyof typeof FLIGHT_PHASE_LABELS] || flight.acars.phase}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {flight.pilotName} {flight.aircraftTail && `- ${flight.aircraftTail}`}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>{flight.booking?.departure_icao}</span>
                        <span>-&gt;</span>
                        <span>{flight.booking?.arrival_icao}</span>
                        <span className="ml-auto font-mono">
                          FL{Math.round((flight.acars.altitude_ft || 0) / 100)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Flight Detail */}
          {selectedData && (
            <div className="bg-slate-800/50 border border-sky-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-bold font-mono">
                  CPZ{selectedData.booking?.flight_number || '???'}
                </h4>
                <span className="text-xs text-sky-400">
                  {FLIGHT_PHASE_LABELS[selectedData.acars.phase as keyof typeof FLIGHT_PHASE_LABELS]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <TrendingUp className="w-3 h-3 text-sky-400 mx-auto mb-0.5" />
                  <p className="text-white font-mono text-xs font-bold">
                    {(selectedData.acars.altitude_ft || 0).toLocaleString()} ft
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <Gauge className="w-3 h-3 text-emerald-400 mx-auto mb-0.5" />
                  <p className="text-white font-mono text-xs font-bold">
                    {selectedData.acars.ground_speed_kts || 0} kts
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  <span>{selectedData.pilotName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>HDG {selectedData.acars.heading_deg || 0}&deg; | VS {selectedData.acars.vs_fpm || 0} fpm</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-9">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden h-[600px]">
            <MapContainer
              center={[39.8, -98.5]}
              zoom={4}
              className="h-full w-full"
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
              <MapBounds flights={activeFlights} airports={airportsWithCoords} />

              {/* Airport markers */}
              {airportsWithCoords.map(airport => (
                airport.latitude != null && airport.longitude != null && (
                  <Marker
                    key={airport.id}
                    position={[Number(airport.latitude), Number(airport.longitude)]}
                    icon={createAirportIcon(airport.is_hub)}
                  >
                    <Popup className="airport-popup">
                      <div className="text-sm font-bold">{airport.icao_code}</div>
                      <div className="text-xs text-gray-500">{airport.is_hub ? 'Hub' : 'Spoke'}</div>
                    </Popup>
                  </Marker>
                )
              ))}

              {/* Flight markers */}
              {activeFlights.map(flight => {
                if (flight.acars.latitude == null || flight.acars.longitude == null) return null;
                const isSelected = selectedFlight === flight.acars.id;
                return (
                  <Marker
                    key={flight.acars.id}
                    position={[Number(flight.acars.latitude), Number(flight.acars.longitude)]}
                    icon={createPlaneIcon(flight.acars.heading_deg || 0, isSelected)}
                    eventHandlers={{ click: () => setSelectedFlight(flight.acars.id) }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <div className="font-bold">CPZ{flight.booking?.flight_number || '???'}</div>
                        <div className="text-xs">{flight.pilotName} - {flight.aircraftTail}</div>
                        <div className="text-xs mt-1">
                          {flight.booking?.departure_icao} -&gt; {flight.booking?.arrival_icao}
                        </div>
                        <div className="text-xs">
                          FL{Math.round((flight.acars.altitude_ft || 0) / 100)} | {flight.acars.ground_speed_kts || 0} kts
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Route lines for selected flight */}
              {selectedData && selectedData.booking && (() => {
                const depAirport = airportsWithCoords.find(a => a.icao_code === selectedData.booking!.departure_icao);
                const arrAirport = airportsWithCoords.find(a => a.icao_code === selectedData.booking!.arrival_icao);
                const depPos = depAirport?.latitude != null && depAirport?.longitude != null
                  ? [Number(depAirport.latitude), Number(depAirport.longitude)] as [number, number]
                  : null;
                const arrPos = arrAirport?.latitude != null && arrAirport?.longitude != null
                  ? [Number(arrAirport.latitude), Number(arrAirport.longitude)] as [number, number]
                  : null;
                const currentPos = selectedData.acars.latitude != null && selectedData.acars.longitude != null
                  ? [Number(selectedData.acars.latitude), Number(selectedData.acars.longitude)] as [number, number]
                  : null;

                return (
                  <>
                    {/* Planned route (dashed) */}
                    {depPos && arrPos && (
                      <Polyline
                        positions={[depPos, arrPos]}
                        pathOptions={{ color: '#475569', weight: 1.5, dashArray: '6 4', opacity: 0.6 }}
                      />
                    )}
                    {/* Remaining route (dashed cyan) */}
                    {currentPos && arrPos && (
                      <Polyline
                        positions={[currentPos, arrPos]}
                        pathOptions={{ color: '#22d3ee', weight: 1.5, dashArray: '4 4', opacity: 0.5 }}
                      />
                    )}
                    {/* Flown path from history (solid) */}
                    {positionHistory[selectedData.acars.id] && positionHistory[selectedData.acars.id].length > 1 && (
                      <Polyline
                        positions={positionHistory[selectedData.acars.id]}
                        pathOptions={{ color: '#38bdf8', weight: 2.5, opacity: 0.8 }}
                      />
                    )}
                  </>
                );
              })()}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
