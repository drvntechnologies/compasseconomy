export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface Airport {
  id: string;
  icao_code: string;
  is_hub: boolean;
  min_daily_pax: number;
  max_daily_pax: number;
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
  status: 'booked' | 'completed' | 'cancelled';
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

export type TransactionType = 'ticket_revenue' | 'engine_cost' | 'gate_fee' | 'aircraft_lease' | 'adjustment';

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
