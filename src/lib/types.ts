export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'user';
  simbrief_id: string | null;
  created_at: string;
}

export interface Airport {
  id: string;
  icao_code: string;
  is_hub: boolean;
  min_daily_pax: number;
  max_daily_pax: number;
  min_daily_cargo_kg: number;
  max_daily_cargo_kg: number;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Route {
  id: string;
  flight_number: string;
  departure_icao: string;
  arrival_icao: string;
  flight_type: string;
  duration_minutes: number;
  days_of_week: Record<string, boolean>;
  airframes: string;
  is_active: boolean;
  ticket_price_usd: number;
  cargo_price_per_kg: number;
  created_at: string;
}

export interface PaxPool {
  id: string;
  origin_icao: string;
  destination_icao: string;
  current_airport_icao: string;
  pax_count: number;
  status: 'waiting' | 'in_transit' | 'layover' | 'arrived';
  connections_remaining: number;
  booking_id: string | null;
  generated_date: string;
  created_at: string;
}

export interface CargoPool {
  id: string;
  origin_icao: string;
  destination_icao: string;
  current_airport_icao: string;
  weight_kg: number;
  status: 'waiting' | 'in_transit' | 'layover' | 'arrived';
  connections_remaining: number;
  booking_id: string | null;
  generated_date: string;
  created_at: string;
}

export interface FlightLog {
  id: string;
  user_id: string;
  flight_number: string;
  departure_icao: string;
  arrival_icao: string;
  pax_count: number;
  flight_date: string;
  created_at: string;
}

export interface DemandGenerationLog {
  id: string;
  airport_icao: string;
  pax_generated: number;
  generation_date: string;
  created_at: string;
}

export interface FlightBooking {
  id: string;
  user_id: string;
  flight_number: string;
  departure_icao: string;
  arrival_icao: string;
  departure_time_utc: string;
  pax_count: number;
  cargo_kg: number;
  status: 'booked' | 'in_progress' | 'completed' | 'cancelled';
  aircraft_id: string | null;
  engine_hours: number | null;
  created_at: string;
}

export type SizeCategory = 'heavy' | 'medium' | 'small' | 'ramp';

export interface Aircraft {
  id: string;
  tail_number: string;
  aircraft_type: string;
  size_category: SizeCategory;
  max_pax: number;
  is_freighter: boolean;
  max_cargo_kg: number;
  oew_kg: number | null;
  mtow_kg: number | null;
  mlw_kg: number | null;
  current_airport_icao: string;
  status: 'available' | 'reserved' | 'in_flight' | 'maintenance';
  reserved_by_booking_id: string | null;
  hourly_cost_usd: number;
  monthly_lease_usd: number;
  created_at: string;
}

export type GateType = 'heavy' | 'medium' | 'small' | 'ramp';
export type LeaseType = 'full_time' | 'part_time' | 'per_hour';

export interface Gate {
  id: string;
  airport_icao: string;
  gate_number: string;
  gate_type: GateType;
  lease_type: LeaseType;
  monthly_price: number | null;
  hourly_price: number | null;
  status: 'open' | 'occupied';
  assigned_aircraft_id: string | null;
  assigned_booking_id: string | null;
  occupied_since: string | null;
  last_billed_at: string | null;
  created_at: string;
}

export const AIRCRAFT_SIZE_MAP: Record<string, SizeCategory> = {
  '777': 'heavy',
  '777-200': 'heavy',
  '777-300': 'heavy',
  '767': 'heavy',
  '767-300': 'heavy',
  '767-400': 'heavy',
  '757': 'heavy',
  '757-200': 'heavy',
  '757-300': 'heavy',
  '787': 'heavy',
  '787-8': 'heavy',
  '787-9': 'heavy',
  '787-10': 'heavy',
  'A330': 'heavy',
  'A330-200': 'heavy',
  'A330-300': 'heavy',
  'A340': 'heavy',
  'A350': 'heavy',
  'A380': 'heavy',
  '747': 'heavy',
  '747-400': 'heavy',
  '737': 'medium',
  '737-700': 'medium',
  '736': 'medium',
  '737-800': 'medium',
  '738': 'medium',
  '737-900': 'medium',
  '739': 'medium',
  '737 MAX 8': 'medium',
  '737 MAX 9': 'medium',
  'A319': 'medium',
  'A320': 'medium',
  'A321': 'medium',
  'A220': 'medium',
  'MD-80': 'medium',
  'MD-88': 'medium',
  'MD-90': 'medium',
  'E190': 'medium',
  'E195': 'medium',
  'E175': 'small',
  'E170': 'small',
  'CRJ-700': 'small',
  'CRJ-900': 'small',
  'CRJ-200': 'small',
  'ATR-72': 'small',
  'ATR-42': 'small',
  'Dash 8': 'small',
  'DHC-8': 'small',
};

export type TransactionType = 'ticket_revenue' | 'cargo_revenue' | 'engine_cost' | 'gate_fee' | 'aircraft_lease' | 'adjustment';

export interface AirlineFinancials {
  id: number;
  balance_usd: number;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

export interface MonthlyBillingLog {
  id: string;
  billing_month: string;
  gate_fees_total: number;
  lease_fees_total: number;
  processed_by: string;
  created_at: string;
}

export type FlightPhase =
  | 'preflight'
  | 'taxi_out'
  | 'takeoff'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'approach'
  | 'landed'
  | 'taxi_in'
  | 'parked';

export const FLIGHT_PHASES: FlightPhase[] = [
  'preflight', 'taxi_out', 'takeoff', 'climb', 'cruise',
  'descent', 'approach', 'landed', 'taxi_in', 'parked',
];

export const FLIGHT_PHASE_LABELS: Record<FlightPhase, string> = {
  preflight: 'Pre-Flight',
  taxi_out: 'Taxi Out',
  takeoff: 'Takeoff',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
  approach: 'Approach',
  landed: 'Landed',
  taxi_in: 'Taxi In',
  parked: 'Parked',
};

export type NotamPriority = 'info' | 'warning' | 'urgent';

export interface Notam {
  id: string;
  title: string;
  body: string;
  priority: NotamPriority;
  created_by: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AcarsFlight {
  id: string;
  booking_id: string;
  user_id: string;
  phase: FlightPhase;
  altitude_ft: number | null;
  ground_speed_kts: number | null;
  heading_deg: number | null;
  latitude: number | null;
  longitude: number | null;
  fuel_lbs: number | null;
  vs_fpm: number | null;
  sim_rate: number;
  last_report_at: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}
