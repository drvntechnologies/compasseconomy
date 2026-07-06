import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getIsTauri, invokeCommand, listenEvent } from '../lib/tauri-bridge';
import type { SimTelemetry, SimConnectStatus } from '../lib/tauri-bridge';
import type { Airport, Route, FlightBooking, Aircraft, PaxPool, AcarsFlight, FlightPhase, Gate, SizeCategory } from '../lib/types';
import { FLIGHT_PHASES, FLIGHT_PHASE_LABELS } from '../lib/types';
import { getChecklistForAircraft } from '../lib/checklists';
import type { ChecklistSection } from '../lib/checklists';
import SimBriefModal, { getSimBriefType } from './SimBriefModal';
import {
  Radar, AlertTriangle, Plane, Play, Square, ChevronRight, Users, MapPin,
  ArrowRight, Clock, Gauge, Compass, TrendingUp, TrendingDown, Fuel, RefreshCw,
  Radio, ClipboardList, Check, ChevronLeft, RotateCcw, DoorOpen, Wifi, WifiOff, FileText,
  CheckCircle, Timer
} from 'lucide-react';

interface AcarsProps {
  airports: Airport[];
  routes: Route[];
  currentUserId: string | null;
  isAdmin: boolean;
  simbriefId?: string | null;
}

const SIZE_HIERARCHY: SizeCategory[] = ['ramp', 'small', 'medium', 'heavy'];

const PHASE_COLORS: Record<FlightPhase, string> = {
  preflight: 'bg-slate-500/20 text-slate-300',
  taxi_out: 'bg-amber-500/20 text-amber-300',
  takeoff: 'bg-orange-500/20 text-orange-300',
  climb: 'bg-sky-500/20 text-sky-300',
  cruise: 'bg-emerald-500/20 text-emerald-300',
  descent: 'bg-cyan-500/20 text-cyan-300',
  approach: 'bg-violet-500/20 text-violet-300',
  landed: 'bg-green-500/20 text-green-300',
  taxi_in: 'bg-amber-500/20 text-amber-300',
  parked: 'bg-slate-500/20 text-slate-300',
};

function Acars({ currentUserId, simbriefId, routes }: AcarsProps) {
  const [acarsFlights, setAcarsFlights] = useState<AcarsFlight[]>([]);
  const [bookings, setBookings] = useState<FlightBooking[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [paxPools, setPaxPools] = useState<PaxPool[]>([]);
  const [pilotNames, setPilotNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [startingTracking, setStartingTracking] = useState<string | null>(null);
  const [checklistTab, setChecklistTab] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({}); // sectionTitle -> set of checked indices
  const [assignedGate, setAssignedGate] = useState<Gate | null>(null);
  const [gateAssigning, setGateAssigning] = useState(false);

  // Flight completion state
  const [completingFlight, setCompletingFlight] = useState(false);
  const [completionSuccess, setCompletionSuccess] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // SimConnect state
  const [isTauriApp] = useState(() => getIsTauri());
  const [simStatus, setSimStatus] = useState<SimConnectStatus | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<SimTelemetry | null>(null);

  // OFP tab state
  const [acarsTab, setAcarsTab] = useState<'telemetry' | 'ofp'>('telemetry');
  const [simbriefOpen, setSimbriefOpen] = useState(false);
  const [ofpData, setOfpData] = useState<any>(null);
  const [ofpLoading, setOfpLoading] = useState(false);
  const [ofpError, setOfpError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  // SimConnect telemetry listener (Tauri only)
  useEffect(() => {
    if (!isTauriApp) return;
    let unlistenTelemetry: (() => void) | null = null;
    let statusInterval: number | null = null;

    (async () => {
      unlistenTelemetry = await listenEvent<SimTelemetry>('simconnect-telemetry', (payload) => {
        setLiveTelemetry(payload);
      });

      const pollStatus = async () => {
        const raw = await invokeCommand<string>('get_simconnect_status');
        if (raw) {
          try { setSimStatus(JSON.parse(raw)); } catch {}
        }
      };
      pollStatus();
      statusInterval = window.setInterval(pollStatus, 5000);
    })();

    return () => {
      unlistenTelemetry?.();
      if (statusInterval) clearInterval(statusInterval);
    };
  }, [isTauriApp]);

  // Fetch OFP from SimBrief when OFP tab is opened
  useEffect(() => {
    if (acarsTab !== 'ofp' || !simbriefId || !selectedFlightId) return;
    fetchOfp();
  }, [acarsTab, simbriefId, selectedFlightId]);

  async function fetchOfp() {
    if (!simbriefId) {
      setOfpError('No SimBrief Pilot ID configured. Go to Settings to add yours.');
      return;
    }
    setOfpLoading(true);
    setOfpError(null);
    try {
      const resp = await fetch(
        `https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(simbriefId)}&json=1`
      );
      if (!resp.ok) {
        throw new Error(`SimBrief API returned ${resp.status}`);
      }
      const data = await resp.json();
      if (data.fetch?.status === 'Error') {
        throw new Error(data.fetch.result || 'Failed to fetch OFP');
      }
      setOfpData(data);
    } catch (e: any) {
      setOfpError(e.message || 'Failed to fetch OFP from SimBrief');
      setOfpData(null);
    } finally {
      setOfpLoading(false);
    }
  }

  async function fetchData() {
    const [acarsRes, bookingsRes, acRes, paxRes, profilesRes] = await Promise.all([
      supabase.from('acars_flights').select('*').is('ended_at', null).order('created_at', { ascending: false }),
      supabase.from('flight_bookings').select('*').in('status', ['booked', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('aircraft').select('*'),
      supabase.from('pax_pools').select('*').eq('status', 'in_transit'),
      supabase.from('profiles').select('id, display_name'),
    ]);

    if (acarsRes.data) setAcarsFlights(acarsRes.data);
    if (bookingsRes.data) setBookings(bookingsRes.data);
    if (acRes.data) setAircraft(acRes.data);
    if (paxRes.data) setPaxPools(paxRes.data);
    if (profilesRes.data) {
      const names: Record<string, string> = {};
      profilesRes.data.forEach((p: { id: string; display_name: string | null }) => {
        names[p.id] = p.display_name || 'Pilot';
      });
      setPilotNames(names);
    }
    setLoading(false);
  }

  async function startTracking(booking: FlightBooking) {
    setStartingTracking(booking.id);

    // Transition booking to in_progress
    await supabase.from('flight_bookings').update({ status: 'in_progress' }).eq('id', booking.id);

    // Create ACARS flight record
    await supabase.from('acars_flights').insert({
      booking_id: booking.id,
      user_id: booking.user_id,
      phase: 'preflight',
      started_at: new Date().toISOString(),
    });

    // Enable position reporting via SimConnect if running in Tauri
    if (isTauriApp) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bgbfknpzkidqodagqvna.supabase.co';
        await invokeCommand('start_flight_tracking', {
          supabaseUrl,
          supabaseToken: session.access_token,
        });
      }
    }

    setStartingTracking(null);
    fetchData();
  }

  // Track previously seen phases to detect transitions (for gate assignment on landing)
  const prevPhasesRef = useRef<Record<string, FlightPhase>>({});

  useEffect(() => {
    for (const acars of acarsFlights) {
      const prevPhase = prevPhasesRef.current[acars.id];
      if (prevPhase && prevPhase !== 'landed' && acars.phase === 'landed') {
        autoAssignGate(acars);
      }
      prevPhasesRef.current[acars.id] = acars.phase;
    }
  }, [acarsFlights]);

  async function stopTracking(acars: AcarsFlight) {
    await supabase.from('acars_flights').update({
      phase: 'parked',
      ended_at: new Date().toISOString(),
      ground_speed_kts: 0,
      altitude_ft: 0,
      vs_fpm: 0,
      last_report_at: new Date().toISOString(),
    }).eq('id', acars.id);

    // Transition booking back so dispatch can handle it
    await supabase.from('flight_bookings').update({ status: 'booked' }).eq('id', acars.booking_id);

    if (isTauriApp) {
      await invokeCommand('stop_flight_tracking');
    }

    fetchData();
  }

  async function autoAssignGate(acars: AcarsFlight) {
    setGateAssigning(true);
    const booking = bookings.find(b => b.id === acars.booking_id);
    if (!booking?.aircraft_id) { setGateAssigning(false); return; }

    const ac = aircraft.find(a => a.id === booking.aircraft_id);
    if (!ac) { setGateAssigning(false); return; }

    const arrivalIcao = booking.arrival_icao;
    const aircraftSize = ac.size_category;

    const { data: openGates } = await supabase
      .from('gates')
      .select('*')
      .eq('airport_icao', arrivalIcao)
      .eq('status', 'open')
      .order('gate_number');

    if (!openGates || openGates.length === 0) {
      setAssignedGate(null);
      setGateAssigning(false);
      return;
    }

    const compatibleTypes = getCompatibleGateTypes(aircraftSize);
    let bestGate: Gate | null = null;
    for (const gateType of compatibleTypes) {
      const match = openGates.find(g => g.gate_type === gateType);
      if (match) { bestGate = match; break; }
    }

    if (!bestGate) { setAssignedGate(null); setGateAssigning(false); return; }

    await supabase.from('gates').update({
      status: 'occupied',
      assigned_aircraft_id: booking.aircraft_id,
      assigned_booking_id: booking.id,
      occupied_since: new Date().toISOString(),
    }).eq('id', bestGate.id);

    setAssignedGate({ ...bestGate, status: 'occupied', assigned_aircraft_id: booking.aircraft_id, assigned_booking_id: booking.id });
    setGateAssigning(false);
  }

  function getCompatibleGateTypes(aircraftSize: SizeCategory): SizeCategory[] {
    const idx = SIZE_HIERARCHY.indexOf(aircraftSize);
    return SIZE_HIERARCHY.slice(idx);
  }

  async function completeFlight(acars: AcarsFlight) {
    // Auto-calculate engine hours from ACARS flight duration
    const startedAt = new Date(acars.started_at);
    const now = new Date();
    const hours = Math.round(((now.getTime() - startedAt.getTime()) / 3600000) * 10) / 10;

    if (hours <= 0) {
      setCompletionError('Flight duration too short to log');
      return;
    }

    setCompletingFlight(true);
    setCompletionError(null);
    setCompletionSuccess(null);

    const booking = bookings.find(b => b.id === acars.booking_id);
    if (!booking) { setCompletingFlight(false); setCompletionError('Booking not found'); return; }

    const arrivalIcao = booking.arrival_icao;

    // Process pax pools
    const { data: pools } = await supabase
      .from('pax_pools')
      .select('*')
      .eq('booking_id', booking.id);

    let arrivedPaxCount = 0;
    if (pools) {
      for (const pool of pools) {
        if (pool.destination_icao === arrivalIcao) {
          arrivedPaxCount += pool.pax_count;
          await supabase.from('pax_pools').update({
            current_airport_icao: arrivalIcao,
            status: 'arrived',
            connections_remaining: 0,
            booking_id: null,
          }).eq('id', pool.id);
        } else {
          await supabase.from('pax_pools').update({
            current_airport_icao: arrivalIcao,
            status: 'layover',
            connections_remaining: Math.max(0, pool.connections_remaining - 1),
            booking_id: null,
          }).eq('id', pool.id);
        }
      }
    }

    // Process cargo pools
    const { data: cargoPoolsForBooking } = await supabase
      .from('cargo_pools')
      .select('*')
      .eq('booking_id', booking.id);

    let arrivedCargoKg = 0;
    if (cargoPoolsForBooking) {
      for (const cargo of cargoPoolsForBooking) {
        if (cargo.destination_icao === arrivalIcao) {
          arrivedCargoKg += cargo.weight_kg;
          await supabase.from('cargo_pools').update({
            current_airport_icao: arrivalIcao,
            status: 'arrived',
            connections_remaining: 0,
            booking_id: null,
          }).eq('id', cargo.id);
        } else {
          await supabase.from('cargo_pools').update({
            current_airport_icao: arrivalIcao,
            status: 'layover',
            connections_remaining: Math.max(0, cargo.connections_remaining - 1),
            booking_id: null,
          }).eq('id', cargo.id);
        }
      }
    }

    // Mark booking completed
    await supabase.from('flight_bookings').update({
      status: 'completed',
      engine_hours: hours,
    }).eq('id', booking.id);

    // Move aircraft to arrival and release
    let gateFeeTotal = 0;
    if (booking.aircraft_id) {
      await supabase.from('aircraft').update({
        current_airport_icao: arrivalIcao,
        status: 'available',
        reserved_by_booking_id: null,
      }).eq('id', booking.aircraft_id);

      // Release departure gates
      const { data: occupiedGates } = await supabase
        .from('gates')
        .select('*')
        .eq('assigned_aircraft_id', booking.aircraft_id);

      const arrivalGate = (occupiedGates || []).find(
        g => g.assigned_booking_id === booking.id && g.airport_icao === arrivalIcao
      );

      for (const gate of (occupiedGates || [])) {
        if (gate.id === arrivalGate?.id) continue;

        if (gate.lease_type === 'per_hour' && gate.hourly_price && gate.occupied_since) {
          const billingStart = gate.last_billed_at || gate.occupied_since;
          const now = new Date();
          const minutesParked = (now.getTime() - new Date(billingStart).getTime()) / 60000;
          const tenMinBlocks = Math.ceil(minutesParked / 10);
          const fee = tenMinBlocks * (gate.hourly_price / 6);
          if (fee > 0) {
            gateFeeTotal += fee;
            await supabase.from('financial_transactions').insert({
              type: 'gate_fee',
              amount: -fee,
              description: `Gate ${gate.gate_number} at ${gate.airport_icao}: ${tenMinBlocks * 10}min @ $${gate.hourly_price}/hr`,
              reference_id: gate.id,
            });
          }
        }
        await supabase.from('gates').update({
          status: 'open',
          assigned_aircraft_id: null,
          assigned_booking_id: null,
          occupied_since: null,
          last_billed_at: null,
        }).eq('id', gate.id);
      }

      if (arrivalGate) {
        await supabase.from('gates').update({
          assigned_booking_id: null,
          occupied_since: new Date().toISOString(),
        }).eq('id', arrivalGate.id);
      }
    }

    // Revenue calculations
    const { data: financials } = await supabase
      .from('airline_financials')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    let balanceChange = -gateFeeTotal;

    if (arrivedPaxCount > 0) {
      const route = routes.find(r => r.flight_number === booking.flight_number);
      const ticketPrice = route?.ticket_price_usd ?? 250;
      const revenue = arrivedPaxCount * ticketPrice;
      balanceChange += revenue;

      await supabase.from('financial_transactions').insert({
        type: 'ticket_revenue',
        amount: revenue,
        description: `CPZ${booking.flight_number} ${booking.departure_icao}->${arrivalIcao}: ${arrivedPaxCount} PAX @ $${ticketPrice}`,
        reference_id: booking.id,
      });
    }

    if (arrivedCargoKg > 0) {
      const route = routes.find(r => r.flight_number === booking.flight_number);
      const cargoRate = route?.cargo_price_per_kg ?? 0.45;
      const cargoRevenue = arrivedCargoKg * cargoRate;
      balanceChange += cargoRevenue;

      await supabase.from('financial_transactions').insert({
        type: 'cargo_revenue',
        amount: cargoRevenue,
        description: `CPZ${booking.flight_number} ${booking.departure_icao}->${arrivalIcao}: ${(arrivedCargoKg / 1000).toFixed(1)}t cargo @ $${cargoRate}/kg`,
        reference_id: booking.id,
      });
    }

    const ac = booking.aircraft_id ? aircraftMap[booking.aircraft_id] : null;
    if (ac && ac.hourly_cost_usd > 0) {
      const engineCost = hours * ac.hourly_cost_usd;
      balanceChange -= engineCost;

      await supabase.from('financial_transactions').insert({
        type: 'engine_cost',
        amount: -engineCost,
        description: `CPZ${booking.flight_number} ${ac.tail_number}: ${hours.toFixed(1)}hrs @ $${ac.hourly_cost_usd}/hr`,
        reference_id: booking.id,
      });
    }

    if (financials && balanceChange !== 0) {
      await supabase.from('airline_financials').update({
        balance_usd: financials.balance_usd + balanceChange,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
    }

    // Log the flight
    await supabase.from('flight_logs').insert({
      flight_number: booking.flight_number,
      departure_icao: booking.departure_icao,
      arrival_icao: booking.arrival_icao,
      pax_count: booking.pax_count,
      user_id: booking.user_id,
    });

    // End ACARS tracking
    await supabase.from('acars_flights').update({
      phase: 'parked',
      ended_at: new Date().toISOString(),
      ground_speed_kts: 0,
      altitude_ft: 0,
      vs_fpm: 0,
    }).eq('id', acars.id);

    if (isTauriApp) {
      await invokeCommand('stop_flight_tracking');
    }

    setCompletingFlight(false);
    setCompletionSuccess(`Flight completed! ${hours.toFixed(1)}hrs logged. Net: $${Math.round(balanceChange).toLocaleString()}`);
    setSelectedFlightId(null);
    fetchData();
  }

  const aircraftMap = useMemo(() => {
    const m: Record<string, Aircraft> = {};
    aircraft.forEach(a => { m[a.id] = a; });
    return m;
  }, [aircraft]);

  const bookingMap = useMemo(() => {
    const m: Record<string, FlightBooking> = {};
    bookings.forEach(b => { m[b.id] = b; });
    return m;
  }, [bookings]);

  const activeAcars = useMemo(() => acarsFlights.filter(a => !a.ended_at), [acarsFlights]);
  const activeAcarsBookingIds = useMemo(() => new Set(activeAcars.map(a => a.booking_id)), [activeAcars]);
  const unbookedFlights = useMemo(() =>
    bookings.filter(b => b.status === 'booked' && b.user_id === currentUserId && !activeAcarsBookingIds.has(b.id)),
    [bookings, activeAcars, currentUserId, activeAcarsBookingIds]
  );

  const selectedAcars = useMemo(() =>
    acarsFlights.find(a => a.id === selectedFlightId) || null,
    [acarsFlights, selectedFlightId]
  );

  const selectedBooking = useMemo(() =>
    selectedAcars ? bookingMap[selectedAcars.booking_id] : null,
    [selectedAcars, bookingMap]
  );

  const selectedPax = useMemo(() =>
    selectedAcars ? paxPools.filter(p => p.booking_id === selectedAcars.booking_id) : [],
    [selectedAcars, paxPools]
  );

  const selectedAircraftChecklist = useMemo(() => {
    if (!selectedBooking?.aircraft_id) return null;
    const ac = aircraftMap[selectedBooking.aircraft_id];
    if (!ac) return null;
    return getChecklistForAircraft(ac.aircraft_type);
  }, [selectedBooking, aircraftMap]);

  function toggleCheckItem(sectionTitle: string, itemIdx: number) {
    setCheckedItems(prev => {
      const sectionSet = new Set(prev[sectionTitle] || []);
      if (sectionSet.has(itemIdx)) {
        sectionSet.delete(itemIdx);
      } else {
        sectionSet.add(itemIdx);
      }
      return { ...prev, [sectionTitle]: sectionSet };
    });
  }

  function resetChecklist() {
    setCheckedItems({});
    setChecklistTab(0);
  }

  function getSectionProgress(section: ChecklistSection): { checked: number; total: number } {
    const sectionSet = checkedItems[section.title] || new Set();
    return { checked: sectionSet.size, total: section.items.length };
  }

  function getPhaseProgress(phase: FlightPhase): number {
    return ((FLIGHT_PHASES.indexOf(phase) + 1) / FLIGHT_PHASES.length) * 100;
  }

  function formatTimeSince(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {isTauriApp && simStatus ? (
        <div className={`${simStatus.connected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'} border rounded-xl p-4 flex items-center gap-3`}>
          {simStatus.connected ? (
            <Wifi className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <div className="flex-1">
            <p className={`${simStatus.connected ? 'text-emerald-200' : 'text-amber-200'} font-semibold text-sm`}>
              {simStatus.connected ? 'Connected to MSFS via SimConnect' : 'SimConnect Disconnected'}
            </p>
            <p className={`${simStatus.connected ? 'text-emerald-300/70' : 'text-amber-300/70'} text-xs mt-0.5`}>
              {simStatus.connected
                ? simStatus.tracking
                  ? `Tracking active -- Phase: ${FLIGHT_PHASE_LABELS[simStatus.phase as FlightPhase] || simStatus.phase} -- Reports every 120s`
                  : 'Connected but not tracking. Start a flight to begin ACARS reporting.'
                : simStatus.error || 'Click "Connect" to establish SimConnect link with MSFS.'
              }
            </p>
          </div>
          {simStatus.connected && simStatus.last_report_at && (
            <span className="text-[10px] text-emerald-400/60 font-mono shrink-0">
              Last: {new Date(simStatus.last_report_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-amber-200 font-semibold text-sm">ACARS System -- {isTauriApp ? 'Desktop Mode' : 'Web Mode'}</p>
            <p className="text-amber-300/70 text-xs mt-0.5">
              {isTauriApp
                ? 'Running in desktop app. Connect to MSFS for live flight data, or use manual phase simulation below.'
                : 'SimConnect integration requires the desktop app. Manual phase simulation is available for testing.'
              }
            </p>
          </div>
        </div>
      )}

      {/* ACARS header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-emerald-400" />
          <h2 className="text-white font-bold text-lg tracking-wide uppercase">ACARS Logging</h2>
        </div>
        {isTauriApp && simStatus && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            simStatus.connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/30 text-slate-400'
          }`}>
            {simStatus.connected ? 'SimConnect Active' : 'SimConnect Idle'}
          </span>
        )}
      </div>

      {/* Main 3-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left panel: Active Flights + Bookings */}
        <div className="lg:col-span-3 space-y-4">
          {/* Active ACARS Flights */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Radar className="w-4 h-4 text-emerald-400" />
              <h3 className="text-white font-semibold text-sm">Active Flights</h3>
              <button onClick={fetchData} className="ml-auto p-1 text-slate-400 hover:text-white rounded transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-700/50">
              {activeAcars.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">No active flights</div>
              ) : (
                activeAcars.map(acars => {
                  const booking = bookingMap[acars.booking_id];
                  const ac = booking?.aircraft_id ? aircraftMap[booking.aircraft_id] : null;
                  const isSelected = selectedFlightId === acars.id;
                  return (
                    <button
                      key={acars.id}
                      onClick={() => { setSelectedFlightId(isSelected ? null : acars.id); setAssignedGate(null); }}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-700/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Plane className="w-3.5 h-3.5 text-sky-400" />
                          <span className="text-white font-mono font-semibold text-sm">
                            CPZ{booking?.flight_number || '???'}
                          </span>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[acars.phase]}`}>
                          {FLIGHT_PHASE_LABELS[acars.phase]}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                        <span>{booking?.departure_icao}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span>{booking?.arrival_icao}</span>
                        {ac && <span className="text-slate-500 ml-auto font-mono">{ac.tail_number}</span>}
                      </div>
                      {/* Phase progress bar */}
                      <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${getPhaseProgress(acars.phase)}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Available Bookings to Track */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Radio className="w-4 h-4 text-sky-400" />
              <h3 className="text-white font-semibold text-sm">Ready for Tracking</h3>
            </div>
            <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-700/50">
              {unbookedFlights.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">No bookings waiting</div>
              ) : (
                unbookedFlights.map(booking => {
                  const ac = booking.aircraft_id ? aircraftMap[booking.aircraft_id] : null;
                  return (
                    <div key={booking.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono font-semibold text-sm">CPZ{booking.flight_number}</span>
                          <span className="text-slate-500 text-xs">{pilotNames[booking.user_id] || 'Pilot'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                          <span>{booking.departure_icao}</span>
                          <ArrowRight className="w-3 h-3" />
                          <span>{booking.arrival_icao}</span>
                          {ac && <span className="text-slate-500 ml-1">({ac.tail_number})</span>}
                          <span className="ml-auto text-slate-500">{booking.pax_count} PAX</span>
                        </div>
                      </div>
                      <button
                        onClick={() => startTracking(booking)}
                        disabled={startingTracking === booking.id}
                        className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all disabled:opacity-50"
                        title="Start ACARS tracking"
                      >
                        {startingTracking === booking.id ? (
                          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Center panel: Flight Detail + Controls + Checklist */}
        <div className="lg:col-span-6 space-y-4">
          {selectedAcars && selectedBooking ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              {/* Flight header */}
              <div className="px-5 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-800/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg font-mono">CPZ{selectedBooking.flight_number}</h3>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {pilotNames[selectedBooking.user_id] || 'Pilot'} &middot;{' '}
                      {selectedBooking.aircraft_id && aircraftMap[selectedBooking.aircraft_id]
                        ? aircraftMap[selectedBooking.aircraft_id].tail_number
                        : 'No aircraft'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${PHASE_COLORS[selectedAcars.phase]}`}>
                      {FLIGHT_PHASE_LABELS[selectedAcars.phase]}
                    </span>
                    {selectedAcars.started_at && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Elapsed: {formatTimeSince(selectedAcars.started_at)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Route display */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-white font-mono font-bold text-sm">{selectedBooking.departure_icao}</p>
                    <p className="text-[10px] text-slate-500">DEP</p>
                  </div>
                  <div className="flex-1 relative h-6 flex items-center">
                    <div className="absolute inset-x-0 top-1/2 h-px bg-slate-600" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-sky-400 rounded-full border-2 border-slate-800 transition-all duration-500"
                      style={{ left: `${getPhaseProgress(selectedAcars.phase)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-mono font-bold text-sm">{selectedBooking.arrival_icao}</p>
                    <p className="text-[10px] text-slate-500">ARR</p>
                  </div>
                </div>

                {/* Phase progress */}
                <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 via-emerald-500 to-green-400 rounded-full transition-all duration-700"
                    style={{ width: `${getPhaseProgress(selectedAcars.phase)}%` }}
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-700">
                <button
                  onClick={() => setAcarsTab('telemetry')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors ${
                    acarsTab === 'telemetry'
                      ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-500/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5 inline mr-1.5" />
                  Telemetry
                </button>
                <button
                  onClick={() => setAcarsTab('ofp')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors ${
                    acarsTab === 'ofp'
                      ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-500/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1.5" />
                  OFP / SimBrief
                </button>
              </div>

              {acarsTab === 'telemetry' ? (
                <>
                  {/* Telemetry Grid */}
                  <div className="p-4 grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <TrendingUp className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? liveTelemetry.altitude_ft.toLocaleString()
                          : selectedAcars.altitude_ft != null ? selectedAcars.altitude_ft.toLocaleString() : '---'}
                      </p>
                      <p className="text-[10px] text-slate-500">ALT ft</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <Gauge className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? liveTelemetry.ground_speed_kts
                          : selectedAcars.ground_speed_kts ?? '---'}
                      </p>
                      <p className="text-[10px] text-slate-500">GS kts</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <Compass className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? `${liveTelemetry.heading_deg}°`
                          : selectedAcars.heading_deg != null ? `${selectedAcars.heading_deg}°` : '---'}
                      </p>
                      <p className="text-[10px] text-slate-500">HDG</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      {((liveTelemetry && simStatus?.connected) ? liveTelemetry.vs_fpm : (selectedAcars.vs_fpm ?? 0)) >= 0
                        ? <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" />
                        : <TrendingDown className="w-4 h-4 text-red-400 mx-auto mb-1" />}
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? `${liveTelemetry.vs_fpm > 0 ? '+' : ''}${liveTelemetry.vs_fpm}`
                          : selectedAcars.vs_fpm != null ? `${selectedAcars.vs_fpm > 0 ? '+' : ''}${selectedAcars.vs_fpm}` : '---'}
                      </p>
                      <p className="text-[10px] text-slate-500">VS fpm</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <Fuel className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? Math.round(liveTelemetry.fuel_lbs).toLocaleString()
                          : selectedAcars.fuel_lbs != null ? Math.round(Number(selectedAcars.fuel_lbs)).toLocaleString() : '---'}
                      </p>
                      <p className="text-[10px] text-slate-500">FUEL lbs</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                      <p className="text-white font-mono font-bold text-sm">
                        {(liveTelemetry && simStatus?.connected)
                          ? `${liveTelemetry.sim_rate}x`
                          : `${selectedAcars.sim_rate}x`}
                      </p>
                      <p className="text-[10px] text-slate-500">SIM RATE</p>
                    </div>
                  </div>

                  {/* Phase Indicator */}
                  <div className="px-4 pb-4">
                    <p className="text-xs text-slate-400 font-medium mb-2">Flight Phases</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FLIGHT_PHASES.map((phase, idx) => {
                        const currentIdx = FLIGHT_PHASES.indexOf(selectedAcars.phase);
                        const isActive = idx === currentIdx;
                        const isPast = idx < currentIdx;
                        return (
                          <span
                            key={phase}
                            className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${
                              isActive
                                ? 'bg-sky-500 text-white'
                                : isPast
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-slate-700/50 text-slate-500'
                            }`}
                          >
                            {FLIGHT_PHASE_LABELS[phase]}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => stopTracking(selectedAcars)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-sm rounded-lg transition-all"
                        title="Cancel and release booking"
                      >
                        <Square className="w-4 h-4" />
                        Cancel Flight
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* OFP Tab */
                <div className="p-4 space-y-4">
                  {!simbriefId ? (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm font-medium">SimBrief Pilot ID Not Set</p>
                      <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
                        Open Pilot Settings (gear icon in the sidebar) and enter your SimBrief Pilot ID to view your generated OFPs here.
                      </p>
                    </div>
                  ) : ofpLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
                      <span className="ml-3 text-slate-400 text-sm">Fetching OFP from SimBrief...</span>
                    </div>
                  ) : ofpError ? (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 text-red-500/50 mx-auto mb-2" />
                      <p className="text-red-400 text-sm">{ofpError}</p>
                      <button
                        onClick={fetchOfp}
                        className="mt-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : ofpData ? (
                    <>
                      {/* OFP Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">
                            {ofpData.general?.icao_airline || 'CPZ'}{ofpData.general?.flight_number || ''} OFP
                          </p>
                          <p className="text-slate-400 text-xs mt-0.5">
                            Generated {ofpData.params?.time_generated
                              ? new Date(Number(ofpData.params.time_generated) * 1000).toLocaleString()
                              : 'recently'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={fetchOfp}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors"
                          >
                            Refresh
                          </button>
                          <button
                            onClick={() => setSimbriefOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-all"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            New Plan
                          </button>
                        </div>
                      </div>

                      {/* Flight Summary */}
                      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Origin</p>
                            <p className="text-white font-mono text-sm font-bold">{ofpData.origin?.icao_code || '----'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Destination</p>
                            <p className="text-white font-mono text-sm font-bold">{ofpData.destination?.icao_code || '----'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Aircraft</p>
                            <p className="text-white font-mono text-sm">{ofpData.aircraft?.icaocode || '----'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Cruise FL</p>
                            <p className="text-white font-mono text-sm">FL{ofpData.general?.initial_altitude ? Math.round(Number(ofpData.general.initial_altitude) / 100) : '---'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Cost Index</p>
                            <p className="text-white font-mono text-sm">{ofpData.general?.costindex ?? '---'}</p>
                          </div>
                        </div>

                        {/* Route */}
                        {ofpData.general?.route && (
                          <div className="mb-3">
                            <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Route</p>
                            <p className="text-white font-mono text-[11px] leading-relaxed bg-slate-800 rounded p-2 break-all max-h-20 overflow-y-auto">
                              {ofpData.general.route}
                            </p>
                          </div>
                        )}

                        {/* Key Performance Data */}
                        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-700/50">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Distance</p>
                            <p className="text-white font-mono text-xs">
                              {ofpData.general?.route_distance || '--'} nm
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Est. Time</p>
                            <p className="text-white font-mono text-xs">
                              {ofpData.times?.est_time_enroute
                                ? `${Math.floor(Number(ofpData.times.est_time_enroute) / 3600)}h${Math.floor((Number(ofpData.times.est_time_enroute) % 3600) / 60).toString().padStart(2, '0')}m`
                                : '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">Avg Wind</p>
                            <p className="text-white font-mono text-xs">
                              {ofpData.general?.avg_wind_dir || '---'}/{ofpData.general?.avg_wind_spd || '--'}kt
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Fuel Summary */}
                      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                        <p className="text-xs text-slate-400 font-medium mb-3">Fuel Plan</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Block Fuel', value: ofpData.fuel?.plan_ramp },
                            { label: 'Trip Fuel', value: ofpData.fuel?.enroute_burn },
                            { label: 'Reserves', value: ofpData.fuel?.reserve },
                            { label: 'Alternate', value: ofpData.fuel?.alternate_burn },
                            { label: 'Contingency', value: ofpData.fuel?.contingency },
                            { label: 'Min Takeoff', value: ofpData.fuel?.min_takeoff },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between py-1">
                              <span className="text-[11px] text-slate-400">{item.label}</span>
                              <span className="text-[11px] text-white font-mono">
                                {item.value ? `${Number(item.value).toLocaleString()} lbs` : '--'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Weights */}
                      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                        <p className="text-xs text-slate-400 font-medium mb-3">Weights</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'ZFW', value: ofpData.weights?.est_zfw },
                            { label: 'TOW', value: ofpData.weights?.est_tow },
                            { label: 'LDW', value: ofpData.weights?.est_ldw },
                            { label: 'Payload', value: ofpData.weights?.payload },
                            { label: 'Passengers', value: ofpData.weights?.pax_count, unit: '' },
                            { label: 'Cargo', value: ofpData.weights?.cargo },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between py-1">
                              <span className="text-[11px] text-slate-400">{item.label}</span>
                              <span className="text-[11px] text-white font-mono">
                                {item.value
                                  ? item.unit === '' ? item.value : `${Number(item.value).toLocaleString()} lbs`
                                  : '--'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Alternate */}
                      {ofpData.alternate && (
                        <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-500 uppercase font-medium">Alternate</p>
                          <p className="text-white font-mono text-sm">
                            {ofpData.alternate.icao_code || '--'} ({ofpData.alternate.name || ''})
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">No OFP loaded</p>
                      <button
                        onClick={fetchOfp}
                        className="mt-3 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg transition-colors"
                      >
                        Fetch Latest OFP
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
              <Radar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">Select an active flight</p>
              <p className="text-slate-500 text-xs mt-1">Click a tracked flight to view telemetry and controls</p>
            </div>
          )}

          {/* Aircraft Checklist */}
          {selectedAcars && selectedBooking && selectedAircraftChecklist && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-sky-400" />
                <h3 className="text-white font-semibold text-sm">{selectedAircraftChecklist.aircraft} Checklist</h3>
                <button
                  onClick={resetChecklist}
                  className="ml-auto p-1 text-slate-400 hover:text-white rounded transition-colors"
                  title="Reset checklist"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tab navigation */}
              <div className="border-b border-slate-700">
                <div className="flex items-center px-2 py-1.5 gap-1">
                  <button
                    onClick={() => setChecklistTab(Math.max(0, checklistTab - 1))}
                    disabled={checklistTab === 0}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 overflow-x-auto scrollbar-none">
                    <div className="flex gap-0.5 min-w-max">
                      {selectedAircraftChecklist.sections.map((section, idx) => {
                        const progress = getSectionProgress(section);
                        const isComplete = progress.checked === progress.total;
                        const isActive = checklistTab === idx;
                        return (
                          <button
                            key={section.title}
                            onClick={() => setChecklistTab(idx)}
                            className={`px-2 py-1 text-[10px] font-medium whitespace-nowrap rounded transition-colors ${
                              isActive
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                : isComplete
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30 border border-transparent'
                            }`}
                          >
                            {isComplete && <Check className="w-2.5 h-2.5 inline mr-0.5" />}
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => setChecklistTab(Math.min(selectedAircraftChecklist.sections.length - 1, checklistTab + 1))}
                    disabled={checklistTab === selectedAircraftChecklist.sections.length - 1}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors shrink-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active section title + progress */}
              {selectedAircraftChecklist.sections[checklistTab] && (() => {
                const section = selectedAircraftChecklist.sections[checklistTab];
                const progress = getSectionProgress(section);
                return (
                  <div className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs font-semibold">{section.title}</span>
                      <span className={`text-[10px] font-mono ${
                        progress.checked === progress.total ? 'text-emerald-400' : 'text-slate-400'
                      }`}>
                        {progress.checked}/{progress.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Checklist items */}
              <div className="max-h-[400px] overflow-y-auto">
                {selectedAircraftChecklist.sections[checklistTab] && (
                  <div className="divide-y divide-slate-700/30">
                    {selectedAircraftChecklist.sections[checklistTab].items.map((item, idx) => {
                      const sectionTitle = selectedAircraftChecklist.sections[checklistTab].title;
                      const isChecked = checkedItems[sectionTitle]?.has(idx) || false;
                      return (
                        <button
                          key={`${sectionTitle}-${idx}`}
                          onClick={() => toggleCheckItem(sectionTitle, idx)}
                          className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${
                            isChecked ? 'bg-emerald-500/5' : 'hover:bg-slate-700/20'
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-slate-500 bg-slate-800'
                          }`}>
                            {isChecked && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs leading-relaxed ${
                              isChecked ? 'text-slate-400 line-through' : 'text-white'
                            }`}>
                              {item.label}
                            </span>
                          </div>
                          {item.state && (
                            <span className={`text-[10px] font-mono shrink-0 ${
                              isChecked ? 'text-emerald-500' : 'text-sky-400'
                            }`}>
                              {item.state}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section navigation footer */}
              <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
                <button
                  onClick={() => setChecklistTab(Math.max(0, checklistTab - 1))}
                  disabled={checklistTab === 0}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-3 h-3" />
                  Prev
                </button>
                <span className="text-[10px] text-slate-500">
                  {checklistTab + 1} / {selectedAircraftChecklist.sections.length}
                </span>
                <button
                  onClick={() => setChecklistTab(Math.min(selectedAircraftChecklist.sections.length - 1, checklistTab + 1))}
                  disabled={checklistTab === selectedAircraftChecklist.sections.length - 1}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  Next
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {selectedAcars && selectedBooking && !selectedAircraftChecklist && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <ClipboardList className="w-4 h-4" />
                <span className="text-xs">No checklist available for this aircraft type</span>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: PAX Tracking + Gate Assignment */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold text-sm">PAX Manifest</h3>
            </div>

            {selectedAcars && selectedBooking ? (
              <div className="p-4 space-y-3">
                {/* Summary */}
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Total on board</span>
                    <span className="text-white font-bold font-mono">{selectedBooking.pax_count}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">Groups tracked</span>
                    <span className="text-white font-mono">{selectedPax.length}</span>
                  </div>
                </div>

                {/* Pax groups */}
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {selectedPax.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-3">
                      No pax pool data linked to this flight
                    </p>
                  ) : (
                    selectedPax.map(pool => {
                      const isDirect = pool.connections_remaining === 0;
                      return (
                        <div key={pool.id} className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-2.5">
                          <div className="flex items-center gap-2">
                            <Users className="w-3 h-3 text-sky-400" />
                            <span className="text-white font-mono text-xs font-semibold">{pool.pax_count} PAX</span>
                            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                              isDirect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {isDirect ? 'Direct' : `${pool.connections_remaining} stop${pool.connections_remaining > 1 ? 's' : ''}`}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <MapPin className="w-3 h-3" />
                            <span>{pool.origin_icao}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                            <span className="text-white">{pool.destination_icao}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* PAX Stats breakdown */}
                {selectedPax.length > 0 && (
                  <div className="border-t border-slate-700/50 pt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Direct passengers</span>
                      <span className="text-emerald-400 font-mono">
                        {selectedPax.filter(p => p.connections_remaining === 0).reduce((s, p) => s + p.pax_count, 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Connecting passengers</span>
                      <span className="text-amber-400 font-mono">
                        {selectedPax.filter(p => p.connections_remaining > 0).reduce((s, p) => s + p.pax_count, 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Unique destinations</span>
                      <span className="text-white font-mono">
                        {new Set(selectedPax.map(p => p.destination_icao)).size}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">Select a flight to view passenger manifest</p>
              </div>
            )}
          </div>

          {/* Gate Assignment Card */}
          {selectedAcars && selectedBooking && (selectedAcars.phase === 'landed' || selectedAcars.phase === 'taxi_in' || selectedAcars.phase === 'parked') && (
            <div className="bg-slate-800/50 border border-emerald-500/30 rounded-xl overflow-hidden animate-in">
              <div className="px-4 py-3 border-b border-emerald-500/20 bg-emerald-500/5 flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-emerald-400" />
                <h3 className="text-emerald-300 font-semibold text-sm">Gate Assignment</h3>
              </div>
              <div className="p-4">
                {gateAssigning ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-slate-400">Assigning gate...</span>
                  </div>
                ) : assignedGate ? (
                  <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                      <p className="text-emerald-400 font-bold font-mono text-2xl">{assignedGate.gate_number}</p>
                      <p className="text-slate-400 text-xs mt-1">{assignedGate.airport_icao} - {assignedGate.gate_type} gate</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <p className="text-slate-400">Type</p>
                        <p className="text-white font-medium capitalize">{assignedGate.gate_type}</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <p className="text-slate-400">Billing</p>
                        <p className="text-white font-medium capitalize">{assignedGate.lease_type?.replace('_', ' ') || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-amber-400 text-xs font-medium">No compatible gate available</p>
                    <p className="text-slate-500 text-[10px] mt-1">Check gate availability at {selectedBooking.arrival_icao}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete Flight Card - shows when parked (engines off) */}
          {selectedAcars && selectedBooking && selectedAcars.phase === 'parked' && !selectedAcars.ended_at && (
            <div className="bg-slate-800/50 border border-sky-500/30 rounded-xl overflow-hidden animate-in">
              <div className="px-4 py-3 border-b border-sky-500/20 bg-sky-500/5 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-sky-400" />
                <h3 className="text-sky-300 font-semibold text-sm">Complete Flight</h3>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Engines off at {selectedBooking.arrival_icao}. Complete the flight to process passengers, cargo, and record revenue.
                </p>

                {/* Auto-calculated engine hours */}
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="w-4 h-4 text-sky-400" />
                    <span className="text-xs text-slate-400 font-medium">Engine Time (auto-calculated)</span>
                  </div>
                  <p className="text-white font-mono font-bold text-lg">
                    {(Math.round(((Date.now() - new Date(selectedAcars.started_at).getTime()) / 3600000) * 10) / 10).toFixed(1)} hrs
                  </p>
                </div>

                {completionError && (
                  <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {completionError}
                  </div>
                )}

                <button
                  onClick={() => completeFlight(selectedAcars)}
                  disabled={completingFlight}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-all shadow-lg shadow-sky-600/20"
                >
                  {completingFlight ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Complete Flight
                    </>
                  )}
                </button>

                <div className="bg-slate-900/50 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">PAX delivered</span>
                    <span className="text-white font-mono">{selectedBooking.pax_count}</span>
                  </div>
                  {selectedBooking.cargo_kg && selectedBooking.cargo_kg > 0 && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Cargo on board</span>
                      <span className="text-teal-400 font-mono">{(selectedBooking.cargo_kg / 1000).toFixed(1)}t</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Route</span>
                    <span className="text-white font-mono">{selectedBooking.departure_icao} -&gt; {selectedBooking.arrival_icao}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Completion success toast */}
          {completionSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 animate-in">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-emerald-300 text-sm font-semibold">Flight Completed</p>
                  <p className="text-emerald-400/70 text-xs mt-0.5">{completionSuccess}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SimBrief Modal */}
      {simbriefOpen && selectedBooking && selectedBooking.aircraft_id && aircraftMap[selectedBooking.aircraft_id] && (
        <SimBriefModal
          callsign="CPZ"
          flightNumber={selectedBooking.flight_number}
          origin={selectedBooking.departure_icao}
          destination={selectedBooking.arrival_icao}
          aircraftIcao={getSimBriefType(aircraftMap[selectedBooking.aircraft_id].aircraft_type)}
          pax={selectedBooking.pax_count}
          onClose={() => setSimbriefOpen(false)}
        />
      )}
    </div>
  );
}

export default Acars;