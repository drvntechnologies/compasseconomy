import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route, PaxPool, FlightBooking, Aircraft, Gate, SizeCategory } from '../lib/types';
import { Plane, Clock, Users, MapPin, ArrowRight, CheckCircle, XCircle, AlertCircle, Radio, DoorOpen, DollarSign, Timer, RefreshCw, FileText } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SimBriefModal, { getSimBriefType } from './SimBriefModal';

interface DispatchProps {
  airports: Airport[];
  routes: Route[];
  currentUserId: string | null;
  isAdmin?: boolean;
}

const SIZE_HIERARCHY: SizeCategory[] = ['ramp', 'small', 'medium', 'heavy'];

function getCompatibleGateTypes(aircraftSize: SizeCategory): SizeCategory[] {
  const idx = SIZE_HIERARCHY.indexOf(aircraftSize);
  return SIZE_HIERARCHY.slice(idx);
}

export default function Dispatch({ airports, routes, currentUserId, isAdmin }: DispatchProps) {
  const [bookings, setBookings] = useState<FlightBooking[]>([]);
  const [bookedPaxMap, setBookedPaxMap] = useState<Record<string, PaxPool[]>>({});
  const [loading, setLoading] = useState(true);

  // Aircraft state
  const [availableAircraft, setAvailableAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [bookingAircraftMap, setBookingAircraftMap] = useState<Record<string, Aircraft>>({});

  // Gate assignment state
  const [gateAssignments, setGateAssignments] = useState<Record<string, Gate>>({});
  const [departureGateMap, setDepartureGateMap] = useState<Record<string, Gate>>({});
  const [requestingGate, setRequestingGate] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [pilotNames, setPilotNames] = useState<Record<string, string>>({});

  // Booking form state
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [requestedPax, setRequestedPax] = useState(0);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Completing flight state
  const [completing, setCompleting] = useState<string | null>(null);
  const [engineHoursMap, setEngineHoursMap] = useState<Record<string, string>>({});

  // Auto-refresh
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<number | null>(null);

  // SimBrief modal state
  const [simbriefBookingId, setSimbriefBookingId] = useState<string | null>(null);

  const airportCodes = useMemo(() => airports.map(a => a.icao_code).sort(), [airports]);

  const matchingRoutes = useMemo(() => {
    if (!departure && !arrival) return routes.filter(r => r.is_active);
    return routes.filter(r => {
      if (!r.is_active) return false;
      if (departure && r.departure_icao !== departure) return false;
      if (arrival && r.arrival_icao !== arrival) return false;
      return true;
    });
  }, [routes, departure, arrival]);

  const arrivalOptions = useMemo(() => {
    if (!departure) return airportCodes;
    const destinations = routes
      .filter(r => r.is_active && r.departure_icao === departure)
      .map(r => r.arrival_icao);
    return [...new Set(destinations)].sort();
  }, [routes, departure, airportCodes]);

  const departureAircraft = useMemo(() => {
    if (!departure) return [];
    return availableAircraft.filter(
      ac => ac.current_airport_icao === departure.toUpperCase() && ac.status === 'available'
    );
  }, [availableAircraft, departure]);

  const selectedAircraft = useMemo(() => {
    return availableAircraft.find(ac => ac.id === selectedAircraftId) || null;
  }, [availableAircraft, selectedAircraftId]);

  useEffect(() => {
    fetchBookings();
    fetchAircraft();
    pollRef.current = window.setInterval(() => {
      silentRefresh();
    }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function silentRefresh() {
    setRefreshing(true);
    const { data: bookingData } = await supabase
      .from('flight_bookings')
      .select('*')
      .in('status', ['booked', 'in_progress'])
      .order('departure_time_utc', { ascending: true });

    if (bookingData) {
      setBookings(bookingData);
      fetchPilotNames(bookingData);
      const map: Record<string, PaxPool[]> = {};
      const acMap: Record<string, Aircraft> = {};
      const gateMap: Record<string, Gate> = {};

      for (const b of bookingData) {
        const { data: pools } = await supabase
          .from('pax_pools')
          .select('*')
          .eq('booking_id', b.id);
        if (pools) map[b.id] = pools;

        if (b.aircraft_id) {
          const { data: ac } = await supabase
            .from('aircraft')
            .select('*')
            .eq('id', b.aircraft_id)
            .maybeSingle();
          if (ac) acMap[b.id] = ac;
        }

        const { data: gate } = await supabase
          .from('gates')
          .select('*')
          .eq('assigned_booking_id', b.id)
          .maybeSingle();
        if (gate) gateMap[b.id] = gate;
      }

      const depGateMap: Record<string, Gate> = {};
      for (const b of bookingData) {
        if (b.aircraft_id) {
          const { data: depGate } = await supabase
            .from('gates')
            .select('*')
            .eq('assigned_aircraft_id', b.aircraft_id)
            .eq('airport_icao', b.departure_icao)
            .eq('status', 'occupied')
            .maybeSingle();
          if (depGate) depGateMap[b.id] = depGate;
        }
      }

      setBookedPaxMap(map);
      setBookingAircraftMap(acMap);
      setGateAssignments(gateMap);
      setDepartureGateMap(depGateMap);
    }

    const { data: acData } = await supabase.from('aircraft').select('*');
    if (acData) setAvailableAircraft(acData);

    setLastRefresh(new Date());
    setRefreshing(false);
  }

  async function fetchAircraft() {
    const { data } = await supabase.from('aircraft').select('*');
    if (data) setAvailableAircraft(data);
  }

  async function fetchPilotNames(bookingData: FlightBooking[]) {
    const userIds = [...new Set(bookingData.map(b => b.user_id))];
    if (userIds.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
    if (data) {
      const map: Record<string, string> = {};
      for (const p of data) map[p.id] = p.display_name || p.id.slice(0, 8);
      setPilotNames(map);
    }
  }

  async function fetchBookings() {
    setLoading(true);
    const { data: bookingData } = await supabase
      .from('flight_bookings')
      .select('*')
      .in('status', ['booked', 'in_progress'])
      .order('departure_time_utc', { ascending: true });

    if (bookingData) {
      setBookings(bookingData);
      fetchPilotNames(bookingData);
      const map: Record<string, PaxPool[]> = {};
      const acMap: Record<string, Aircraft> = {};
      const gateMap: Record<string, Gate> = {};

      for (const b of bookingData) {
        const { data: pools } = await supabase
          .from('pax_pools')
          .select('*')
          .eq('booking_id', b.id);
        if (pools) map[b.id] = pools;

        if (b.aircraft_id) {
          const { data: ac } = await supabase
            .from('aircraft')
            .select('*')
            .eq('id', b.aircraft_id)
            .maybeSingle();
          if (ac) acMap[b.id] = ac;
        }

        const { data: gate } = await supabase
          .from('gates')
          .select('*')
          .eq('assigned_booking_id', b.id)
          .maybeSingle();
        if (gate) gateMap[b.id] = gate;
      }

      const depGateMap: Record<string, Gate> = {};
      for (const b of bookingData) {
        if (b.aircraft_id) {
          const { data: depGate } = await supabase
            .from('gates')
            .select('*')
            .eq('assigned_aircraft_id', b.aircraft_id)
            .eq('airport_icao', b.departure_icao)
            .eq('status', 'occupied')
            .maybeSingle();
          if (depGate) depGateMap[b.id] = depGate;
        }
      }

      setBookedPaxMap(map);
      setBookingAircraftMap(acMap);
      setGateAssignments(gateMap);
      setDepartureGateMap(depGateMap);
    }
    setLoading(false);
  }

  async function bookFlight(e: React.FormEvent) {
    e.preventDefault();
    setBookingError('');
    setBookingSuccess('');

    if (!departure || !arrival || !departureTime || requestedPax <= 0) {
      setBookingError('Please fill in all fields.');
      return;
    }

    if (!selectedAircraftId) {
      setBookingError('Please select an aircraft.');
      return;
    }

    setSubmitting(true);

    const arrivalIcao = arrival.toUpperCase();
    const departureIcao = departure.toUpperCase();

    const allEligible: PaxPool[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('pax_pools')
        .select('*')
        .eq('current_airport_icao', departureIcao)
        .in('status', ['waiting', 'layover'])
        .is('booking_id', null)
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        allEligible.push(...data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const activeRoutes = routes.filter(r => r.is_active);
    const destsFromArrival = new Set(activeRoutes.filter(r => r.departure_icao === arrivalIcao).map(r => r.arrival_icao));

    // 2-hop reachability from arrival (arrival -> intermediate -> destination)
    const destsFromArrival2Hop = new Set<string>();
    destsFromArrival.forEach(intermediate => {
      activeRoutes.filter(r => r.departure_icao === intermediate).forEach(r => {
        destsFromArrival2Hop.add(r.arrival_icao);
      });
    });

    // 1-hop reachability via OTHER routes from this departure airport
    // Prevents boarding passengers when a shorter path exists via a different flight
    const otherIntermediates = activeRoutes
      .filter(r => r.departure_icao === departureIcao && r.arrival_icao !== arrivalIcao)
      .map(r => r.arrival_icao);
    const destsViaOtherRoutes1Hop = new Set<string>();
    otherIntermediates.forEach(intermediate => {
      activeRoutes.filter(r => r.departure_icao === intermediate).forEach(r => {
        destsViaOtherRoutes1Hop.add(r.arrival_icao);
      });
    });

    const availablePools = allEligible
      .filter(p => {
        if (p.destination_icao === arrivalIcao) return true;
        if (p.connections_remaining > 0) {
          if (destsFromArrival.has(p.destination_icao)) return true;
          if (p.connections_remaining > 1 && destsFromArrival2Hop.has(p.destination_icao)) {
            // Don't board if a 1-hop path exists via another route from this airport
            if (destsViaOtherRoutes1Hop.has(p.destination_icao)) return false;
            return true;
          }
        }
        return false;
      })
      .sort((a, b) => {
        const aTerminating = a.destination_icao === arrivalIcao ? 0 : 1;
        const bTerminating = b.destination_icao === arrivalIcao ? 0 : 1;
        if (aTerminating !== bTerminating) return aTerminating - bTerminating;
        const aDirectReach = destsFromArrival.has(a.destination_icao) ? 0 : 1;
        const bDirectReach = destsFromArrival.has(b.destination_icao) ? 0 : 1;
        if (aDirectReach !== bDirectReach) return aDirectReach - bDirectReach;
        const aIsLayover = a.status === 'layover' ? 0 : 1;
        const bIsLayover = b.status === 'layover' ? 0 : 1;
        if (aIsLayover !== bIsLayover) return aIsLayover - bIsLayover;
        return a.connections_remaining - b.connections_remaining;
      });

    const totalAvailable = availablePools.reduce((sum, p) => sum + p.pax_count, 0);
    const actualPax = Math.min(requestedPax, totalAvailable);

    if (actualPax === 0) {
      setBookingError(`No eligible passengers at ${departureIcao} for this route.`);
      setSubmitting(false);
      return;
    }

    // Create the booking with aircraft_id
    const depTimeUtc = new Date(departureTime + 'Z').toISOString();
    const { data: booking, error: bookErr } = await supabase
      .from('flight_bookings')
      .insert({
        flight_number: flightNumber,
        departure_icao: departureIcao,
        arrival_icao: arrivalIcao,
        departure_time_utc: depTimeUtc,
        pax_count: actualPax,
        status: 'booked',
        aircraft_id: selectedAircraftId,
      })
      .select()
      .single();

    if (bookErr || !booking) {
      setBookingError(bookErr?.message || 'Failed to create booking.');
      setSubmitting(false);
      return;
    }

    // Reserve the aircraft
    await supabase.from('aircraft').update({
      status: 'reserved',
      reserved_by_booking_id: booking.id,
    }).eq('id', selectedAircraftId);

    // Release departure gate if this aircraft was occupying one
    await supabase.from('gates').update({
      status: 'open',
      assigned_aircraft_id: null,
      assigned_booking_id: null,
      occupied_since: null,
    }).eq('assigned_aircraft_id', selectedAircraftId).eq('airport_icao', departureIcao);

    // Reserve pax pools
    let paxToReserve = actualPax;
    let reservationFailed = false;
    for (const pool of availablePools) {
      if (paxToReserve <= 0) break;

      const paxFromPool = Math.min(pool.pax_count, paxToReserve);
      paxToReserve -= paxFromPool;

      if (paxFromPool === pool.pax_count) {
        const { error: updErr } = await supabase.from('pax_pools').update({
          status: 'in_transit',
          booking_id: booking.id,
        }).eq('id', pool.id);
        if (updErr) { reservationFailed = true; break; }
      } else {
        const { error: splitErr } = await supabase.from('pax_pools').update({
          pax_count: pool.pax_count - paxFromPool,
        }).eq('id', pool.id);
        if (splitErr) { reservationFailed = true; break; }

        const { error: insErr } = await supabase.from('pax_pools').insert({
          origin_icao: pool.origin_icao,
          destination_icao: pool.destination_icao,
          current_airport_icao: pool.current_airport_icao,
          pax_count: paxFromPool,
          status: 'in_transit',
          connections_remaining: pool.connections_remaining,
          generated_date: pool.generated_date,
          booking_id: booking.id,
        });
        if (insErr) {
          // Roll back the split reduction
          await supabase.from('pax_pools').update({
            pax_count: pool.pax_count,
          }).eq('id', pool.id);
          reservationFailed = true;
          break;
        }
      }
    }

    if (reservationFailed) {
      // Cancel the booking since pax reservation failed
      await supabase.from('flight_bookings').update({ status: 'cancelled' }).eq('id', booking.id);
      await supabase.from('aircraft').update({ status: 'available', reserved_by_booking_id: null }).eq('id', selectedAircraftId);
      setBookingError('Failed to reserve passengers. Please try again.');
      setSubmitting(false);
      fetchAircraft();
      return;
    }

    const cappedNote = actualPax < requestedPax
      ? ` (${actualPax} of ${requestedPax} requested available)`
      : '';
    setBookingSuccess(`Flight booked! ${actualPax} PAX reserved ${departureIcao} -> ${arrivalIcao}${cappedNote}`);
    setDeparture('');
    setArrival('');
    setFlightNumber('');
    setDepartureTime('');
    setRequestedPax(0);
    setSelectedAircraftId('');
    setSubmitting(false);
    fetchBookings();
    fetchAircraft();
  }

  async function requestGate(bookingId: string) {
    setRequestingGate(bookingId);
    setGateError(null);
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || !booking.aircraft_id) {
      setGateError('No aircraft assigned to this booking.');
      setRequestingGate(null);
      return;
    }

    const ac = bookingAircraftMap[bookingId];
    if (!ac) { setGateError('Aircraft data not loaded.'); setRequestingGate(null); return; }

    const arrivalIcao = booking.arrival_icao;
    const aircraftSize = ac.size_category;

    // Get all open gates at arrival airport
    const { data: openGates } = await supabase
      .from('gates')
      .select('*')
      .eq('airport_icao', arrivalIcao)
      .eq('status', 'open')
      .order('gate_number');

    if (!openGates || openGates.length === 0) {
      setGateError(`No open gates at ${arrivalIcao}. All gates are currently occupied.`);
      setRequestingGate(null);
      return;
    }

    // Best-fit algorithm: prefer exact size match, then step up
    const compatibleTypes = getCompatibleGateTypes(aircraftSize);
    let assignedGate: Gate | null = null;

    for (const gateType of compatibleTypes) {
      const match = openGates.find(g => g.gate_type === gateType);
      if (match) {
        assignedGate = match;
        break;
      }
    }

    if (!assignedGate) {
      setGateError(`No compatible gate at ${arrivalIcao} for ${ac.tail_number} (${aircraftSize}). Open gates are: ${openGates.map(g => `${g.gate_number} (${g.gate_type})`).join(', ')}`);
      setRequestingGate(null);
      return;
    }

    // Assign the gate
    await supabase.from('gates').update({
      status: 'occupied',
      assigned_aircraft_id: booking.aircraft_id,
      assigned_booking_id: bookingId,
      occupied_since: new Date().toISOString(),
    }).eq('id', assignedGate.id);

    setGateAssignments(prev => ({ ...prev, [bookingId]: { ...assignedGate!, status: 'occupied', assigned_aircraft_id: booking.aircraft_id, assigned_booking_id: bookingId } }));
    setRequestingGate(null);
  }

  async function completeFlight(bookingId: string) {
    const engineHoursStr = engineHoursMap[bookingId];
    const engineHours = parseFloat(engineHoursStr || '0');
    if (!engineHoursStr || isNaN(engineHours) || engineHours <= 0) {
      return;
    }

    setCompleting(bookingId);
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) { setCompleting(null); return; }

    const arrivalIcao = booking.arrival_icao;

    // Get all pax pools for this booking
    const { data: pools } = await supabase
      .from('pax_pools')
      .select('*')
      .eq('booking_id', bookingId);

    if (!pools) { setCompleting(null); return; }

    // Track pax that reach their final destination for revenue
    let arrivedPaxCount = 0;

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

    // Mark booking as completed with engine hours
    await supabase.from('flight_bookings').update({
      status: 'completed',
      engine_hours: engineHours,
    }).eq('id', bookingId);

    // Move aircraft to arrival and set available, unassign origin gate
    let gateFeeTotal = 0;
    if (booking.aircraft_id) {
      await supabase.from('aircraft').update({
        current_airport_icao: arrivalIcao,
        status: 'available',
        reserved_by_booking_id: null,
      }).eq('id', booking.aircraft_id);

      // Get all gates assigned to this aircraft
      const { data: occupiedGates } = await supabase
        .from('gates')
        .select('*')
        .eq('assigned_aircraft_id', booking.aircraft_id);

      // Find the arrival gate (the one assigned to this booking at the arrival airport)
      const arrivalGate = (occupiedGates || []).find(
        g => g.assigned_booking_id === bookingId && g.airport_icao === arrivalIcao
      );

      // Release departure gates (not at arrival airport) and bill per-hour ones
      for (const gate of (occupiedGates || [])) {
        if (gate.id === arrivalGate?.id) continue; // keep arrival gate occupied

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

      // Keep aircraft parked at arrival gate (clear booking reference, keep aircraft)
      if (arrivalGate) {
        await supabase.from('gates').update({
          assigned_booking_id: null,
          occupied_since: new Date().toISOString(),
        }).eq('id', arrivalGate.id);
      }
    }

    // --- ECONOMY: Calculate revenue and costs ---

    // Get current airline balance
    const { data: financials } = await supabase
      .from('airline_financials')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    let balanceChange = -gateFeeTotal;

    // Revenue: ticket price * arrived pax
    if (arrivedPaxCount > 0) {
      const route = routes.find(r => r.flight_number === booking.flight_number);
      const ticketPrice = route?.ticket_price_usd ?? 250;
      const revenue = arrivedPaxCount * ticketPrice;
      balanceChange += revenue;

      await supabase.from('financial_transactions').insert({
        type: 'ticket_revenue',
        amount: revenue,
        description: `CPZ${booking.flight_number} ${booking.departure_icao}->${arrivalIcao}: ${arrivedPaxCount} PAX @ $${ticketPrice}`,
        reference_id: bookingId,
      });
    }

    // Engine cost: hours * hourly rate
    const ac = bookingAircraftMap[bookingId];
    if (ac && ac.hourly_cost_usd > 0) {
      const engineCost = engineHours * ac.hourly_cost_usd;
      balanceChange -= engineCost;

      await supabase.from('financial_transactions').insert({
        type: 'engine_cost',
        amount: -engineCost,
        description: `CPZ${booking.flight_number} ${ac.tail_number}: ${engineHours.toFixed(1)}hrs @ $${ac.hourly_cost_usd}/hr`,
        reference_id: bookingId,
      });
    }

    // Update airline balance
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
    });

    setCompleting(null);
    setEngineHoursMap(prev => { const m = { ...prev }; delete m[bookingId]; return m; });
    fetchBookings();
    fetchAircraft();
  }

  async function cancelBooking(bookingId: string) {
    setCompleting(bookingId);
    const booking = bookings.find(b => b.id === bookingId);

    // Release all reserved pax pools back to their prior status
    const { data: pools } = await supabase
      .from('pax_pools')
      .select('*')
      .eq('booking_id', bookingId);

    if (pools) {
      for (const pool of pools) {
        const wasLayover = pool.connections_remaining < getMaxConnections(pool.origin_icao, pool.destination_icao);
        await supabase.from('pax_pools').update({
          status: wasLayover ? 'layover' : 'waiting',
          booking_id: null,
        }).eq('id', pool.id);
      }
    }

    // Release the aircraft
    if (booking?.aircraft_id) {
      await supabase.from('aircraft').update({
        status: 'available',
        reserved_by_booking_id: null,
      }).eq('id', booking.aircraft_id);
    }

    // Release any assigned gate
    await supabase.from('gates').update({
      status: 'open',
      assigned_aircraft_id: null,
      assigned_booking_id: null,
      occupied_since: null,
    }).eq('assigned_booking_id', bookingId);

    await supabase.from('flight_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    setCompleting(null);
    fetchBookings();
    fetchAircraft();
  }

  function getMaxConnections(origin: string, destination: string): number {
    const originAirport = airports.find(a => a.icao_code === origin);
    const destAirport = airports.find(a => a.icao_code === destination);
    if (originAirport?.is_hub || destAirport?.is_hub) return 1;
    return 2;
  }

  function handleRouteSelect(flightNum: string) {
    setFlightNumber(flightNum);
    const route = routes.find(r => r.flight_number === flightNum && r.is_active);
    if (route) {
      setDeparture(route.departure_icao);
      setArrival(route.arrival_icao);
    }
  }

  function handleAircraftSelect(acId: string) {
    setSelectedAircraftId(acId);
    const ac = availableAircraft.find(a => a.id === acId);
    if (ac && ac.max_pax > 0) {
      setRequestedPax(ac.max_pax);
    }
  }

  function formatUtcTime(iso: string): string {
    const d = new Date(iso);
    return d.toISOString().slice(11, 16) + 'Z';
  }

  function formatUtcDate(iso: string): string {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="space-y-6">
      {/* Refresh indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString()}</span>}
          {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />}
          <span className="text-slate-600">Auto-refresh: 30s</span>
        </div>
        <button
          onClick={() => silentRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Book a Flight */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center">
            <Plane className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">Book Flight</h2>
            <p className="text-slate-400 text-sm">Select aircraft, reserve passengers, and set departure time</p>
          </div>
        </div>

        <form onSubmit={bookFlight} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">From</label>
              <SearchableSelect
                value={departure}
                onChange={(v) => { setDeparture(v); setFlightNumber(''); setSelectedAircraftId(''); }}
                options={airportCodes}
                placeholder="Search..."
                airports={airports}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">To</label>
              <SearchableSelect
                value={arrival}
                onChange={(v) => { setArrival(v); setFlightNumber(''); }}
                options={arrivalOptions}
                placeholder="Search..."
                airports={airports}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Flight Number</label>
              <select
                value={flightNumber}
                onChange={(e) => handleRouteSelect(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              >
                <option value="">Select flight...</option>
                {matchingRoutes.map(r => (
                  <option key={r.id} value={r.flight_number}>
                    CPZ{r.flight_number} - {r.departure_icao} to {r.arrival_icao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Departure (Zulu)</label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={e => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Aircraft</label>
              <select
                value={selectedAircraftId}
                onChange={(e) => handleAircraftSelect(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              >
                <option value="">
                  {departure ? (departureAircraft.length > 0 ? 'Select aircraft...' : 'No aircraft at this airport') : 'Select departure first'}
                </option>
                {departureAircraft.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tail_number} - {ac.aircraft_type} ({ac.max_pax} PAX)
                  </option>
                ))}
              </select>
              {selectedAircraft && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {selectedAircraft.aircraft_type} | Max {selectedAircraft.max_pax} PAX | {selectedAircraft.size_category.charAt(0).toUpperCase() + selectedAircraft.size_category.slice(1)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">PAX (seats available)</label>
              <input
                type="number"
                min={1}
                max={selectedAircraft?.max_pax || undefined}
                value={requestedPax || ''}
                onChange={e => setRequestedPax(parseInt(e.target.value) || 0)}
                placeholder={selectedAircraft ? `Max ${selectedAircraft.max_pax}` : 'e.g. 184'}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">Will auto-correct to available if fewer passengers exist</p>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting || !departure || !arrival || !departureTime || requestedPax <= 0 || !selectedAircraftId}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-sky-500/20"
              >
                {submitting ? 'Booking...' : 'Book & Reserve PAX'}
              </button>
            </div>
          </div>

          {bookingError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {bookingError}
            </div>
          )}
          {bookingSuccess && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              {bookingSuccess}
            </div>
          )}
        </form>
      </div>

      {/* Active Flights (In Transit) */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <Radio className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Active Flights</h2>
            <p className="text-slate-400 text-xs">Passengers reserved and in transit</p>
          </div>
          {bookings.length > 0 && (
            <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded-full font-medium">
              {bookings.length} active
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Plane className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active flights</p>
            <p className="text-xs mt-1">Book a flight above to reserve passengers</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {bookings.map(booking => {
              const paxForBooking = bookedPaxMap[booking.id] || [];
              const terminatingPax = paxForBooking
                .filter(p => p.destination_icao === booking.arrival_icao)
                .reduce((s, p) => s + p.pax_count, 0);
              const connectingPax = paxForBooking
                .filter(p => p.destination_icao !== booking.arrival_icao)
                .reduce((s, p) => s + p.pax_count, 0);
              const aircraftForBooking = bookingAircraftMap[booking.id];
              const assignedGate = gateAssignments[booking.id];
              const depGate = departureGateMap[booking.id];

              return (
                <div key={booking.id} className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Flight header */}
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
                        <span className="text-white font-bold text-base sm:text-lg font-mono">
                          CPZ{booking.flight_number}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-300 text-sm">
                          <span className="font-mono">{booking.departure_icao}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono">{booking.arrival_icao}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>DEP {formatUtcTime(booking.departure_time_utc)}</span>
                          <span className="text-slate-600 ml-1 hidden sm:inline">{formatUtcDate(booking.departure_time_utc)}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          booking.user_id === currentUserId
                            ? 'bg-sky-500/10 text-sky-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {pilotNames[booking.user_id] || 'Pilot'}
                        </span>
                        {booking.status === 'in_progress' && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400 animate-pulse">
                            IN FLIGHT
                          </span>
                        )}
                      </div>

                      {/* Aircraft & Gate info */}
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        {aircraftForBooking && (
                          <div className="flex items-center gap-1.5 text-xs bg-slate-900/50 px-2.5 py-1 rounded-lg">
                            <Plane className="w-3 h-3 text-sky-400" />
                            <span className="text-white font-mono font-medium">{aircraftForBooking.tail_number}</span>
                            <span className="text-slate-500">{aircraftForBooking.aircraft_type}</span>
                          </div>
                        )}
                        {depGate && (
                          <div className="flex items-center gap-1.5 text-xs bg-sky-500/5 border border-sky-500/20 px-2.5 py-1 rounded-lg">
                            <DoorOpen className="w-3 h-3 text-sky-400" />
                            <span className="text-sky-300 font-medium">DEP Gate {depGate.gate_number}</span>
                            <span className="text-slate-500">{depGate.airport_icao}</span>
                          </div>
                        )}
                        {assignedGate && (
                          <div className="flex items-center gap-1.5 text-xs bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                            <DoorOpen className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300 font-medium">ARR Gate {assignedGate.gate_number}</span>
                            <span className="text-slate-500">{assignedGate.airport_icao}</span>
                          </div>
                        )}
                      </div>

                      {/* PAX summary */}
                      <div className="flex items-center gap-3 sm:gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          <span className="text-white font-semibold">{booking.pax_count}</span>
                          <span className="text-slate-400">total PAX</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{terminatingPax}</span>
                          <span className="text-slate-500">terminating</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-violet-400">{connectingPax}</span>
                          <span className="text-slate-500">connecting</span>
                        </div>
                      </div>

                      {/* Passenger details */}
                      {paxForBooking.length > 0 && (() => {
                        const grouped = paxForBooking.reduce<Record<string, { origin_icao: string; destination_icao: string; pax_count: number }>>((acc, pool) => {
                          const key = `${pool.origin_icao}-${pool.destination_icao}`;
                          if (!acc[key]) {
                            acc[key] = { origin_icao: pool.origin_icao, destination_icao: pool.destination_icao, pax_count: 0 };
                          }
                          acc[key].pax_count += pool.pax_count;
                          return acc;
                        }, {});
                        const manifestRows = Object.values(grouped).sort((a, b) => b.pax_count - a.pax_count);
                        return (
                          <div className="mt-3 bg-slate-900/50 rounded-lg p-3">
                            <p className="text-xs text-slate-500 font-medium mb-2">Passenger Manifest</p>
                            <div className="space-y-1">
                              {manifestRows.map(row => (
                                <div key={`${row.origin_icao}-${row.destination_icao}`} className="flex items-center gap-3 text-xs">
                                  <span className="text-white font-mono w-8 text-right">{row.pax_count}</span>
                                  <span className="text-slate-500">PAX</span>
                                  <span className="text-slate-400">{row.origin_icao}</span>
                                  <ArrowRight className="w-3 h-3 text-slate-600" />
                                  <span className={row.destination_icao === booking.arrival_icao ? 'text-emerald-400' : 'text-violet-400'}>
                                    {row.destination_icao}
                                  </span>
                                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                                    row.destination_icao === booking.arrival_icao
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-violet-500/10 text-violet-400'
                                  }`}>
                                    {row.destination_icao === booking.arrival_icao ? 'FINAL' : 'CONNECTING'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Actions - show to booking owner or admins */}
                    {currentUserId && (booking.user_id === currentUserId || isAdmin) && (
                    <div className="flex flex-row lg:flex-col gap-2 shrink-0 flex-wrap">
                      {isAdmin && booking.user_id !== currentUserId && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium self-start">
                          ADMIN ACTION
                        </span>
                      )}
                      {aircraftForBooking && (
                        <button
                          onClick={() => setSimbriefBookingId(booking.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-sky-600/80 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-sky-600/20"
                        >
                          <FileText className="w-4 h-4" />
                          SimBrief OFP
                        </button>
                      )}
                      {!assignedGate && (
                        <button
                          onClick={() => requestGate(booking.id)}
                          disabled={requestingGate === booking.id || completing === booking.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-teal-600/20"
                        >
                          <DoorOpen className="w-4 h-4" />
                          {requestingGate === booking.id ? 'Assigning...' : 'Request Gate'}
                        </button>
                      )}
                      {!assignedGate && gateError && requestingGate === null && (
                        <p className="text-xs text-red-400 max-w-[220px]">{gateError}</p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={engineHoursMap[booking.id] || ''}
                          onChange={e => setEngineHoursMap(prev => ({ ...prev, [booking.id]: e.target.value }))}
                          placeholder="Eng hrs"
                          className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-xs focus:ring-2 focus:ring-emerald-500/40 placeholder-slate-500"
                        />
                      </div>
                      {engineHoursMap[booking.id] && parseFloat(engineHoursMap[booking.id]) > 0 && aircraftForBooking && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <DollarSign className="w-3 h-3" />
                          <span>Cost: ${(parseFloat(engineHoursMap[booking.id]) * (aircraftForBooking.hourly_cost_usd || 0)).toFixed(0)}</span>
                        </div>
                      )}
                      <button
                        onClick={() => completeFlight(booking.id)}
                        disabled={completing === booking.id || !engineHoursMap[booking.id] || parseFloat(engineHoursMap[booking.id] || '0') <= 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {completing === booking.id ? 'Completing...' : 'Flight Complete'}
                      </button>
                      <button
                        onClick={() => cancelBooking(booking.id)}
                        disabled={completing === booking.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-300 text-sm rounded-lg transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SimBrief Modal */}
      {simbriefBookingId && (() => {
        const booking = bookings.find(b => b.id === simbriefBookingId);
        const ac = booking ? bookingAircraftMap[simbriefBookingId] : null;
        if (!booking || !ac) return null;
        return (
          <SimBriefModal
            callsign="CPZ"
            flightNumber={booking.flight_number}
            origin={booking.departure_icao}
            destination={booking.arrival_icao}
            aircraftIcao={getSimBriefType(ac.aircraft_type)}
            pax={booking.pax_count}
            onClose={() => setSimbriefBookingId(null)}
          />
        );
      })()}
    </div>
  );
}
