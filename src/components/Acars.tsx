import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, FlightBooking, Aircraft, PaxPool, AcarsFlight, FlightPhase, Gate, SizeCategory } from '../lib/types';
import { FLIGHT_PHASES, FLIGHT_PHASE_LABELS } from '../lib/types';
import { getChecklistForAircraft } from '../lib/checklists';
import type { ChecklistSection } from '../lib/checklists';
import {
  Radar, AlertTriangle, Plane, Play, Square, ChevronRight, Users, MapPin,
  ArrowRight, Clock, Gauge, Compass, TrendingUp, TrendingDown, Fuel, RefreshCw,
  Radio, ClipboardList, Check, ChevronLeft, RotateCcw, DoorOpen
} from 'lucide-react';

interface AcarsProps {
  airports: Airport[];
  routes: Route[];
  currentUserId: string | null;
  isAdmin: boolean;
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

function Acars({ currentUserId }: AcarsProps) {
  const [acarsFlights, setAcarsFlights] = useState<AcarsFlight[]>([]);
  const [bookings, setBookings] = useState<FlightBooking[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [paxPools, setPaxPools] = useState<PaxPool[]>([]);
  const [pilotNames, setPilotNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [startingTracking, setStartingTracking] = useState<string | null>(null);
  const [advancingPhase, setAdvancingPhase] = useState<string | null>(null);
  const [checklistTab, setChecklistTab] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({}); // sectionTitle -> set of checked indices
  const [assignedGate, setAssignedGate] = useState<Gate | null>(null);
  const [gateAssigning, setGateAssigning] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    const [acarsRes, bookingsRes, acRes, paxRes, profilesRes] = await Promise.all([
      supabase.from('acars_flights').select('*').order('created_at', { ascending: false }),
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

    setStartingTracking(null);
    fetchData();
  }

  async function advancePhase(acars: AcarsFlight) {
    const currentIdx = FLIGHT_PHASES.indexOf(acars.phase);
    if (currentIdx >= FLIGHT_PHASES.length - 1) return;

    setAdvancingPhase(acars.id);
    const nextPhase = FLIGHT_PHASES[currentIdx + 1];

    const updates: Partial<AcarsFlight> & { phase: FlightPhase; last_report_at: string; ended_at?: string } = {
      phase: nextPhase,
      last_report_at: new Date().toISOString(),
    };

    // Simulate telemetry based on phase
    if (nextPhase === 'taxi_out' || nextPhase === 'taxi_in') {
      updates.ground_speed_kts = 15 + Math.floor(Math.random() * 10);
      updates.altitude_ft = 0;
      updates.vs_fpm = 0;
    } else if (nextPhase === 'takeoff') {
      updates.ground_speed_kts = 140 + Math.floor(Math.random() * 30);
      updates.altitude_ft = 500 + Math.floor(Math.random() * 500);
      updates.vs_fpm = 2000 + Math.floor(Math.random() * 1000);
    } else if (nextPhase === 'climb') {
      updates.ground_speed_kts = 280 + Math.floor(Math.random() * 40);
      updates.altitude_ft = 10000 + Math.floor(Math.random() * 15000);
      updates.vs_fpm = 1500 + Math.floor(Math.random() * 1000);
    } else if (nextPhase === 'cruise') {
      updates.ground_speed_kts = 420 + Math.floor(Math.random() * 80);
      updates.altitude_ft = 30000 + Math.floor(Math.random() * 11000);
      updates.vs_fpm = 0;
    } else if (nextPhase === 'descent') {
      updates.ground_speed_kts = 320 + Math.floor(Math.random() * 60);
      updates.altitude_ft = 15000 + Math.floor(Math.random() * 10000);
      updates.vs_fpm = -(1000 + Math.floor(Math.random() * 1500));
    } else if (nextPhase === 'approach') {
      updates.ground_speed_kts = 160 + Math.floor(Math.random() * 40);
      updates.altitude_ft = 2000 + Math.floor(Math.random() * 3000);
      updates.vs_fpm = -(500 + Math.floor(Math.random() * 500));
    } else if (nextPhase === 'landed') {
      updates.ground_speed_kts = 60 + Math.floor(Math.random() * 40);
      updates.altitude_ft = 0;
      updates.vs_fpm = 0;
    } else if (nextPhase === 'parked') {
      updates.ground_speed_kts = 0;
      updates.altitude_ft = 0;
      updates.vs_fpm = 0;
      updates.ended_at = new Date().toISOString();
    }

    if (nextPhase !== 'preflight' && nextPhase !== 'parked') {
      updates.heading_deg = Math.floor(Math.random() * 360);
      updates.fuel_lbs = 5000 + Math.floor(Math.random() * 30000);
    }

    await supabase.from('acars_flights').update(updates).eq('id', acars.id);

    // Auto-assign gate on landing
    if (nextPhase === 'landed') {
      await autoAssignGate(acars);
    }

    setAdvancingPhase(null);
    fetchData();
  }

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
  const completedAcars = useMemo(() => acarsFlights.filter(a => a.ended_at), [acarsFlights]);
  const unbookedFlights = useMemo(() =>
    bookings.filter(b => b.status === 'booked' && b.user_id === currentUserId && !acarsFlights.some(a => a.booking_id === b.id)),
    [bookings, acarsFlights, currentUserId]
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
      {/* Development Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-amber-200 font-semibold text-sm">ACARS System -- Actively in Development</p>
          <p className="text-amber-300/70 text-xs mt-0.5">
            SimConnect integration is under construction. Manual phase simulation is available for testing flight tracking workflows.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Active Flights</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{activeAcars.length}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Awaiting Track</p>
          <p className="text-xl font-bold text-sky-400 mt-1">{unbookedFlights.length}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Completed Today</p>
          <p className="text-xl font-bold text-white mt-1">{completedAcars.length}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">PAX In Transit</p>
          <p className="text-xl font-bold text-amber-400 mt-1">
            {paxPools.reduce((s, p) => s + p.pax_count, 0)}
          </p>
        </div>
      </div>

      {/* Main 3-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left panel: Active Flights + Bookings + Checklist */}
        <div className="lg:col-span-4 space-y-4">
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

        {/* Center panel: Flight Detail + Controls */}
        <div className="lg:col-span-5">
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

              {/* Telemetry Grid */}
              <div className="p-4 grid grid-cols-3 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <TrendingUp className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                  <p className="text-white font-mono font-bold text-sm">
                    {selectedAcars.altitude_ft != null ? selectedAcars.altitude_ft.toLocaleString() : '---'}
                  </p>
                  <p className="text-[10px] text-slate-500">ALT ft</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Gauge className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-white font-mono font-bold text-sm">
                    {selectedAcars.ground_speed_kts ?? '---'}
                  </p>
                  <p className="text-[10px] text-slate-500">GS kts</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Compass className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                  <p className="text-white font-mono font-bold text-sm">
                    {selectedAcars.heading_deg != null ? `${selectedAcars.heading_deg}°` : '---'}
                  </p>
                  <p className="text-[10px] text-slate-500">HDG</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  {(selectedAcars.vs_fpm ?? 0) >= 0
                    ? <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" />
                    : <TrendingDown className="w-4 h-4 text-red-400 mx-auto mb-1" />}
                  <p className="text-white font-mono font-bold text-sm">
                    {selectedAcars.vs_fpm != null ? `${selectedAcars.vs_fpm > 0 ? '+' : ''}${selectedAcars.vs_fpm}` : '---'}
                  </p>
                  <p className="text-[10px] text-slate-500">VS fpm</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Fuel className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                  <p className="text-white font-mono font-bold text-sm">
                    {selectedAcars.fuel_lbs != null ? Math.round(Number(selectedAcars.fuel_lbs)).toLocaleString() : '---'}
                  </p>
                  <p className="text-[10px] text-slate-500">FUEL lbs</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <p className="text-white font-mono font-bold text-sm">{selectedAcars.sim_rate}x</p>
                  <p className="text-[10px] text-slate-500">SIM RATE</p>
                </div>
              </div>

              {/* Phase Stepper Controls */}
              <div className="px-4 pb-4">
                <p className="text-xs text-slate-400 font-medium mb-2">Flight Phase Controls (Dev Sim)</p>
                <div className="flex flex-wrap gap-1.5">
                  {FLIGHT_PHASES.map((phase, idx) => {
                    const currentIdx = FLIGHT_PHASES.indexOf(selectedAcars.phase);
                    const isActive = idx === currentIdx;
                    const isPast = idx < currentIdx;
                    const isNext = idx === currentIdx + 1;
                    return (
                      <span
                        key={phase}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${
                          isActive
                            ? 'bg-sky-500 text-white'
                            : isPast
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isNext
                            ? 'bg-slate-600 text-slate-200 ring-1 ring-sky-500/50'
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
                    onClick={() => advancePhase(selectedAcars)}
                    disabled={
                      advancingPhase === selectedAcars.id ||
                      FLIGHT_PHASES.indexOf(selectedAcars.phase) >= FLIGHT_PHASES.length - 1
                    }
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-all"
                  >
                    {advancingPhase === selectedAcars.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ChevronRight className="w-4 h-4" />
                        Advance Phase
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => stopTracking(selectedAcars)}
                    className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-sm rounded-lg transition-all"
                    title="Stop tracking and release booking"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
              <Radar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">Select an active flight</p>
              <p className="text-slate-500 text-xs mt-1">Click a tracked flight to view telemetry and controls</p>
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
        </div>
      </div>
    </div>
  );
}

export default Acars;


export default Acars