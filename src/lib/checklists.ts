export interface ChecklistItem {
  label: string;
  state: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface AircraftChecklist {
  aircraft: string;
  sections: ChecklistSection[];
}

export const B737_CHECKLIST: AircraftChecklist = {
  aircraft: 'B737',
  sections: [
    {
      title: 'Secure Cabin',
      items: [
        { label: 'Landing Gear', state: 'DOWN' },
        { label: 'Speed Brake', state: 'DOWN' },
        { label: 'Flaps', state: 'UP' },
        { label: 'Battery (0HP)', state: 'ON & COVERED' },
        { label: 'Standby PWR', state: 'AUTO & COVERED' },
        { label: 'DC Voltmeter Selector (L)', state: 'BAT' },
        { label: 'AC Voltmeter Selector (R)', state: 'STBY PWR' },
        { label: 'Master Caution', state: 'DISENGAGE' },
        { label: 'Elec Hyd Pumps', state: 'OFF' },
        { label: 'Fuel Pumps', state: 'ALL OFF' },
        { label: 'Interior Lights', state: 'AS REQUIRED' },
        { label: 'Pedestal / Main Panel / Overhead Panel', state: '' },
        { label: 'Cabin / Utility Power', state: 'ON' },
        { label: 'IFE / Pass Seat Power', state: 'ON' },
        { label: 'Ground Power', state: 'CONNECT & ON' },
        { label: 'AC Voltmeter Selector (R)', state: 'GRND PWR' },
        { label: 'Emergency Lights', state: 'ARMED & COVERED' },
        { label: 'Seat Belts', state: 'AUTO/ON' },
        { label: 'Position Lights', state: 'STEADY' },
        { label: 'Wheel Well / Logo / Wing', state: 'AS REQUIRED' },
        { label: 'Cockpit Lights', state: 'TEST' },
        { label: 'Alarms', state: 'TEST' },
        { label: 'Oxygen Masks', state: 'TEST' },
      ],
    },
    {
      title: 'FMC & Ground Services',
      items: [
        { label: 'Set Fuel and Payload', state: '' },
        { label: 'Trim Air', state: 'ON' },
        { label: 'Recirc Fans (L & R)', state: 'AUTO' },
        { label: 'Packs (L & R)', state: 'AUTO' },
        { label: 'Autopilots', state: 'OFF' },
        { label: 'IRS Selectors', state: 'NAV' },
        { label: 'FMC: INIT REF page', state: 'COMPLETE' },
        { label: 'FMC: Route', state: 'COMPLETE' },
        { label: 'FMC: PERF INIT', state: 'COMPLETE' },
      ],
    },
    {
      title: 'APU & Electrical',
      items: [
        { label: 'Fuel Pump FWD No.1', state: 'ON' },
        { label: 'APU', state: 'START' },
        { label: 'APU Gen Switches (L & R)', state: 'ON' },
        { label: 'APU & Engine Bleeds', state: 'ON' },
        { label: 'AC Voltmeter Selector (R)', state: 'APU' },
        { label: 'Master Caution', state: 'DISENGAGE' },
      ],
    },
    {
      title: 'Pre-Departure',
      items: [
        { label: 'Request ATC Clearance', state: '' },
        { label: 'Squawk', state: 'SET' },
        { label: 'Altimeter', state: 'SET' },
        { label: 'FMC: Departure', state: 'COMPLETE' },
        { label: 'FMC: Route / Legs', state: 'CHECK DISCONTINUITIES' },
        { label: 'FMC: Takeoff (P.1 & P.2)', state: 'COMPLETE' },
        { label: 'Initial Altitude', state: 'SET' },
        { label: 'HDG / Takeoff Runway', state: 'SET' },
        { label: 'Elevator Trim', state: 'SET (per FMC data)' },
        { label: 'IAS / Mach Speed', state: 'SET V2' },
        { label: 'Yaw Damper', state: 'ON' },
        { label: 'Fuel Pumps', state: 'ALL (usable) ON' },
        { label: 'Cross Feed Valve', state: 'TEST (enable, wait, OFF)' },
        { label: 'Window Heat', state: 'ON' },
        { label: 'Wing & Engine Anti-Ice', state: 'AS REQUIRED' },
        { label: 'Hydraulic Pumps', state: 'ALL ON' },
        { label: 'Flight Altitude', state: 'SET' },
        { label: 'Landing Altitude', state: 'SET' },
        { label: 'Flight Directors', state: 'ON' },
        { label: 'LNAV / VNAV', state: 'AS REQUIRED' },
        { label: 'Auto Brake', state: 'RTO' },
        { label: 'COM Radios', state: 'SET' },
        { label: 'Remove Ground Connections', state: '' },
        { label: 'Doors', state: 'CLOSED' },
      ],
    },
    {
      title: 'Before Start',
      items: [
        { label: 'Parking Brake', state: 'SET' },
        { label: 'Chocks', state: 'REMOVED' },
        { label: 'Takeoff Briefing', state: 'REVIEWED' },
        { label: 'Packs (L & R)', state: 'OFF' },
        { label: 'Anti-Collision Light', state: 'ON' },
        { label: 'Transponder', state: 'ALT OFF' },
        { label: 'Engine Area', state: 'CLEAR' },
        { label: 'Lower Display Unit', state: 'ENGINE' },
        { label: 'Request Pushback and Start', state: '' },
      ],
    },
    {
      title: 'Engine Start',
      items: [
        { label: 'Pushback', state: 'START' },
        { label: 'Duct Pressure Gauge', state: 'VERIFY 30 PSI' },
        { label: 'Ignition Selector', state: 'OPPOSITE' },
        { label: 'L Engine Start Switch', state: 'GRD' },
        { label: 'L Engine: Wait for >=25% N2', state: '' },
        { label: 'L Engine Fuel Control', state: 'ON' },
        { label: 'L Engine Start Switch', state: 'CONT' },
        { label: 'R Engine Start Switch', state: 'GRD' },
        { label: 'R Engine: Wait for >=25% N2', state: '' },
        { label: 'R Engine Fuel Control', state: 'ON' },
        { label: 'R Engine Start Switch', state: 'CONT' },
      ],
    },
    {
      title: 'Before Taxi',
      items: [
        { label: 'Gen Engine Switches (L & R)', state: 'ON' },
        { label: 'AC Voltmeter Selector (R)', state: 'GEN' },
        { label: 'APU', state: 'OFF' },
        { label: 'APU Bleed', state: 'OFF' },
        { label: 'Packs (L & R)', state: 'ON' },
        { label: 'Isolation Valve', state: 'AUTO' },
        { label: 'Probe Heat', state: 'ON' },
        { label: 'Engine Anti-Ice', state: 'AS REQUIRED' },
        { label: 'Flaps', state: 'SET' },
        { label: 'Trim', state: 'VERIFY SET' },
        { label: 'Flight Controls', state: 'FREE AND CORRECT' },
        { label: 'Recall', state: 'CHECK' },
        { label: 'Lower Display Unit', state: 'OFF' },
        { label: 'Request Taxi Clearance', state: '' },
        { label: 'Taxi Lights', state: 'ON' },
        { label: 'Runway Turnoff Lights', state: 'AS REQUIRED' },
        { label: 'TCAS', state: 'TEST' },
      ],
    },
    {
      title: 'Taxi',
      items: [
        { label: 'Max Speed (Apron)', state: '15 KTS' },
        { label: 'Max Speed (Taxiway)', state: '30 KTS' },
        { label: 'Max Speed (On Runway)', state: '50 KTS' },
        { label: 'Brakes / Gyro / Turn Coordinator', state: 'CHECK' },
      ],
    },
    {
      title: 'Before Takeoff',
      items: [
        { label: 'Parking Brake', state: 'SET' },
        { label: 'Autothrottle', state: 'ARM' },
        { label: 'Center Fuel Pumps', state: 'AS REQUIRED' },
        { label: 'Anti-Ice', state: 'AS REQUIRED' },
        { label: 'Cabin Lights', state: 'AS REQUIRED' },
        { label: 'Flight Instruments', state: 'CHECK' },
        { label: 'Engine Instruments', state: 'CHECK' },
        { label: 'Brake Temp', state: 'CHECK' },
        { label: 'Takeoff Data (V1, VR, V2)', state: 'CHECK' },
        { label: 'Nav Equipment', state: 'CHECK' },
        { label: 'Landing Lights', state: 'ON' },
        { label: 'Runway Turnoff Lights', state: 'ON' },
        { label: 'Taxi Lights', state: 'OFF' },
        { label: 'Position Lights', state: 'STROBE & STEADY' },
        { label: 'Transponder', state: 'TA/RA' },
        { label: 'TFC', state: 'PUSH ON' },
        { label: 'Clock', state: 'START' },
      ],
    },
    {
      title: 'After Takeoff',
      items: [
        { label: 'Positive Rate of Climb', state: 'GEAR UP' },
        { label: 'Auto Brake', state: 'OFF' },
        { label: 'Engine Start Switches', state: 'OFF' },
        { label: 'Gear Lever', state: 'OFF' },
        { label: 'Flaps', state: 'RAISE ON SCHEDULE' },
        { label: 'Autopilot', state: 'ON' },
        { label: 'LNAV & VNAV', state: 'ON / AS REQUIRED' },
        { label: 'Runway Turnoff Lights', state: 'OFF' },
        { label: 'Cabin Lights', state: 'AS REQUIRED' },
      ],
    },
    {
      title: 'Climb',
      items: [
        { label: 'Passing Transition Altitude: Altimeter', state: 'SET STD' },
        { label: 'Below 10,000 FT', state: 'MAX 250 KIAS' },
        { label: 'Passing 10,000 FT: Landing Lights', state: 'OFF' },
        { label: 'Passing 10,000 FT: Seat Belts', state: 'AUTO / OFF' },
        { label: 'Fuel Pumps', state: 'AS REQUIRED' },
        { label: 'Anti-Ice', state: 'AS REQUIRED' },
      ],
    },
    {
      title: 'Cruise & Descent Prep',
      items: [
        { label: 'Engine and Instruments', state: 'MONITOR' },
        { label: 'Fuel Quantity', state: 'CHECK' },
        { label: 'Lights', state: 'AS REQUIRED' },
        { label: 'Fuel Pumps', state: 'OFF WHEN EMPTY' },
        { label: 'ATIS / Airport Information', state: 'CHECK' },
        { label: 'Altimeter', state: 'CHECK' },
        { label: 'Radios', state: 'SET' },
        { label: 'MCP Altitude', state: 'RESET' },
        { label: 'FMC: APPR Speed Ref', state: 'SET' },
        { label: 'FMC: Localizer Freq', state: 'SET' },
        { label: 'FMC: ILS LOC Course', state: 'SET' },
        { label: 'FMC: Descent Forecast', state: 'SET' },
        { label: 'De-Ice', state: 'AS REQUIRED' },
        { label: 'Landing Alt', state: 'CHECK' },
        { label: 'Recall', state: 'CHECK' },
        { label: 'Radio Alt / Baro Min', state: 'SET, CHECK' },
        { label: 'Auto Brake', state: 'AS REQUIRED' },
      ],
    },
    {
      title: 'Descent',
      items: [
        { label: 'Passing Transition Altitude: Altimeter', state: 'RESET TO LOCAL' },
        { label: 'Below 10,000 FT', state: '250 KIAS' },
        { label: 'Landing Lights', state: 'ON' },
        { label: 'Seat Belts', state: 'ON' },
      ],
    },
    {
      title: 'Approach',
      items: [
        { label: 'Altimeter', state: 'CHECK' },
        { label: 'Localizer Freq', state: 'CHECK' },
        { label: 'Localizer Course', state: 'CHECK' },
        { label: 'APP', state: 'ARM' },
        { label: 'Landing Gear', state: 'DOWN, 3 GREEN' },
        { label: 'Flaps', state: '15' },
        { label: 'Speed Brake', state: 'ARM' },
        { label: '2nd Autopilot', state: 'ARM (for ILS Autoland)' },
        { label: 'Engine Start Switches', state: 'CONT' },
        { label: 'Landing Flaps', state: 'SET' },
        { label: 'Go-Around Altitude', state: 'SET' },
        { label: 'Runway Turnoff Lights', state: 'ON' },
        { label: 'Landing Gear', state: 'CHECK DOWN' },
        { label: 'Autopilot', state: 'AS REQUIRED' },
        { label: 'Auto-Thrust', state: 'AS REQUIRED' },
      ],
    },
    {
      title: 'After Touchdown',
      items: [
        { label: 'Thrust Reverse', state: 'ENGAGE' },
        { label: 'Autopilot', state: 'OFF' },
        { label: 'Auto-Thrust', state: 'OFF' },
        { label: 'At 60 KTS: Rev Thrust', state: 'IDLE' },
        { label: 'At 30 KTS: Auto-Brake', state: 'DISENGAGE' },
      ],
    },
    {
      title: 'After Landing',
      items: [
        { label: 'Transponder', state: 'ALT OFF' },
        { label: 'TFC', state: 'PUSH OFF' },
        { label: 'Flaps', state: 'RETRACT' },
        { label: 'Speed Brake', state: 'DOWN' },
        { label: 'Landing Lights', state: 'OFF' },
        { label: 'Taxi Lights', state: 'ON' },
        { label: 'Strobe Lights', state: 'STEADY' },
        { label: 'Cabin Lights', state: 'AS REQUIRED' },
        { label: 'Anti-Ice', state: 'AS REQUIRED' },
        { label: 'APU', state: 'START' },
        { label: 'Probe Heat', state: 'OFF' },
        { label: 'Engine Start Switches', state: 'OFF' },
        { label: 'Auto-Brake', state: 'OFF' },
        { label: 'Flight Directors', state: 'OFF' },
        { label: 'Lower Display Unit', state: 'ENGINE' },
        { label: 'Brake Temp', state: 'CHECK' },
      ],
    },
    {
      title: 'Taxi to Gate',
      items: [
        { label: 'Runway Turnoff Lights', state: 'OFF' },
        { label: 'APU Gen Switches (L & R)', state: 'ON' },
        { label: 'AC Voltmeter Selector (R)', state: 'APU' },
        { label: 'APU Bleed', state: 'ON' },
        { label: 'Autopilot', state: 'RESET' },
        { label: 'Turning into Gate: Taxi Lights', state: 'OFF' },
      ],
    },
    {
      title: 'Parking',
      items: [
        { label: 'Parking Brake', state: 'SET' },
        { label: 'Engine Fuel Control Levers', state: 'CUT OFF' },
        { label: 'Master Warning', state: 'DISENGAGE' },
        { label: 'Anti-Collision Lights', state: 'OFF' },
        { label: 'Wheel Chocks', state: 'SET' },
        { label: 'Ground Connections', state: 'ESTABLISH' },
        { label: 'Passenger Signs', state: 'OFF' },
        { label: 'Yaw Damper', state: 'OFF' },
        { label: 'Fuel Pumps', state: 'OFF' },
        { label: 'L Aft Fuel Pump', state: 'ON (then OFF after GPU)' },
        { label: 'Ground Power', state: 'CONNECT & ON' },
        { label: 'AC Voltmeter Selector (R)', state: 'GRND PWR' },
        { label: 'APU', state: 'OFF' },
        { label: 'Engine Start Switches', state: 'CHECK OFF' },
        { label: 'Elec Hyd Pumps', state: 'OFF' },
        { label: 'Isolation Valve', state: 'OPEN' },
        { label: 'APU Bleed', state: 'OFF' },
        { label: 'Transponder', state: '2000, STANDBY' },
        { label: 'Master Warning', state: 'OFF' },
      ],
    },
    {
      title: 'Shutdown',
      items: [
        { label: 'IRS Selectors', state: 'OFF' },
        { label: 'Window Heat', state: 'OFF' },
        { label: 'Bleeds', state: 'OFF' },
        { label: 'Packs', state: 'OFF' },
        { label: 'Recirc Fans (L & R)', state: 'OFF' },
        { label: 'Trim Air', state: 'OFF' },
        { label: 'External Lights', state: 'OFF' },
        { label: 'Ground Power', state: 'OFF' },
        { label: 'AC Voltmeter Selector (R)', state: 'STDBY PWR' },
        { label: 'Emergency Exit Lights', state: 'OFF & UNCOVERED' },
        { label: 'IFE / Pass Seat PWR', state: 'OFF' },
        { label: 'Cabin / Utility PWR', state: 'OFF' },
        { label: 'Master Warning', state: 'OFF' },
        { label: 'Cockpit Lights', state: 'OFF' },
        { label: 'Standby PWR', state: 'OFF & UNCOVERED' },
        { label: 'DC Voltmeter Selector (L)', state: 'STDBY PWR' },
        { label: 'Battery', state: 'OFF & UNCOVERED' },
      ],
    },
    {
      title: 'Go-Around / Missed Approach',
      items: [
        { label: 'Throttle', state: 'TO/GA' },
        { label: 'Flaps', state: 'SET 15' },
        { label: 'Thrust', state: 'VERIFY INCREASE / GA ROTATION' },
        { label: 'Positive Climb', state: 'GEAR UP' },
        { label: 'Above 400 FT', state: 'LNAV / HDG SEL' },
        { label: 'Flaps', state: 'RETRACT ON SCHEDULE' },
        { label: 'LVL CHG or VNAV', state: 'AS NEEDED' },
        { label: 'Landing Gear Lever', state: 'OFF' },
        { label: 'Engine Start Switches', state: 'AS NEEDED' },
        { label: 'Follow Missed Approach Chart & ATC', state: '' },
      ],
    },
  ],
};

export function getChecklistForAircraft(aircraftType: string): AircraftChecklist | null {
  const normalized = aircraftType.toUpperCase();
  if (
    normalized.includes('737') ||
    normalized.includes('B737') ||
    normalized.includes('738') ||
    normalized.includes('B738') ||
    normalized.includes('736') ||
    normalized.includes('B736') ||
    normalized.includes('733') ||
    normalized.includes('B733') ||
    normalized.includes('734') ||
    normalized.includes('B734') ||
    normalized.includes('735') ||
    normalized.includes('B735')
  ) {
    return B737_CHECKLIST;
  }
  return null;
}
