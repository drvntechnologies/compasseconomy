import { useState } from 'react';
import { X, ExternalLink, FileText, AlertTriangle } from 'lucide-react';

interface SimBriefModalProps {
  callsign: string;
  flightNumber: string;
  origin: string;
  destination: string;
  aircraftIcao: string;
  pax: number;
  cargoKg?: number;
  oewKg?: number | null;
  mtowKg?: number | null;
  mlwKg?: number | null;
  onClose: () => void;
}

export const AIRCRAFT_TYPE_TO_SIMBRIEF: Record<string, string> = {
  '777': 'B77W',
  '777-200': 'B772',
  '777-200ER': 'B772',
  '777-200LR': 'B77L',
  '777-300': 'B773',
  '777-300ER': 'B77W',
  '767': 'B763',
  '767-300': 'B763',
  '767-300ER': 'B763',
  '767-400': 'B764',
  '767-400ER': 'B764',
  '757': 'B752',
  '757-200': 'B752',
  '757-300': 'B753',
  '787': 'B789',
  '787-8': 'B788',
  '787-9': 'B789',
  '787-10': 'B78X',
  'A330': 'A333',
  'A330-200': 'A332',
  'A330-300': 'A333',
  'A330-900': 'A339',
  'A340': 'A343',
  'A340-300': 'A343',
  'A350': 'A359',
  'A350-900': 'A359',
  'A350-1000': 'A35K',
  'A380': 'A388',
  '747': 'B744',
  '747-400': 'B744',
  '747-8': 'B748',
  '737': 'B738',
  '737-700': 'B737',
  '736': 'B736',
  '737-800': 'B738',
  '738': 'B738',
  '737-900': 'B739',
  '739': 'B739',
  '737 MAX 8': 'B38M',
  '737 MAX 9': 'B39M',
  '737 MAX 10': 'B3XM',
  'A319': 'A319',
  'A320': 'A320',
  'A320neo': 'A20N',
  'A321': 'A321',
  'A321neo': 'A21N',
  'A220': 'BCS3',
  'A220-100': 'BCS1',
  'A220-300': 'BCS3',
  'MD-80': 'MD82',
  'MD-88': 'MD88',
  'MD-90': 'MD90',
  'E190': 'E190',
  'E195': 'E195',
  'E175': 'E170',
  'E170': 'E170',
  'CRJ-700': 'CRJ7',
  'CRJ-900': 'CRJ9',
  'CRJ-200': 'CRJ2',
  'ATR-72': 'AT76',
  'ATR-42': 'AT45',
  'Dash 8': 'DH8D',
  'DHC-8': 'DH8D',
};

// Direct ICAO designator mappings (some DB entries use N-prefix instead of B-prefix)
const ICAO_DESIGNATOR_MAP: Record<string, string> = {
  'B738': 'B738',
  'B739': 'B739',
  'B38M': 'B38M',
  'B39M': 'B39M',
  'B3XM': 'B3XM',
  'B736': 'B736',
  'B737': 'B737',
  'B752': 'B752',
  'B753': 'B753',
  'B763': 'B763',
  'B764': 'B764',
  'B772': 'B772',
  'B77L': 'B77L',
  'B773': 'B773',
  'B77W': 'B77W',
  'B788': 'B788',
  'B789': 'B789',
  'B78X': 'B78X',
  'B744': 'B744',
  'B748': 'B748',
  'A319': 'A319',
  'A320': 'A320',
  'A20N': 'A20N',
  'A321': 'A321',
  'A21N': 'A21N',
  'A332': 'A332',
  'A333': 'A333',
  'A339': 'A339',
  'A343': 'A343',
  'A359': 'A359',
  'A35K': 'A35K',
  'A388': 'A388',
  'BCS1': 'BCS1',
  'BCS3': 'BCS3',
  'E170': 'E170',
  'E190': 'E190',
  'E195': 'E195',
  'CRJ2': 'CRJ2',
  'CRJ7': 'CRJ7',
  'CRJ9': 'CRJ9',
  'AT76': 'AT76',
  'AT45': 'AT45',
  'DH8D': 'DH8D',
  'MD82': 'MD82',
  'MD88': 'MD88',
  'MD90': 'MD90',
  'MD11': 'MD11',
  'MD11F': 'MD11',
  // N-prefix variants (some fleets store "N77W" instead of "B77W")
  'N77W': 'B77W',
  'N772': 'B772',
  'N77L': 'B77L',
  'N752': 'B752',
  'N753': 'B753',
  'N738': 'B738',
  'N739': 'B739',
  'N788': 'B788',
  'N789': 'B789',
};

export function getSimBriefType(aircraftType: string): string {
  const trimmed = aircraftType.trim().toUpperCase();

  // 1. Check if the value is already a valid ICAO designator
  if (ICAO_DESIGNATOR_MAP[trimmed]) {
    return ICAO_DESIGNATOR_MAP[trimmed];
  }

  // 2. Check common-name mapping
  const fromName = AIRCRAFT_TYPE_TO_SIMBRIEF[aircraftType];
  if (fromName) return fromName;

  // 3. Fuzzy match: sort keys longest-first so "777-300ER" matches before "777"
  const sorted = Object.entries(AIRCRAFT_TYPE_TO_SIMBRIEF)
    .sort(([a], [b]) => b.length - a.length);
  const normalized = trimmed.toLowerCase();
  for (const [key, value] of sorted) {
    if (normalized.includes(key.toLowerCase())) return value;
  }

  // 4. Last resort: if it looks like a valid 3-4 char ICAO code, pass it through
  if (/^[A-Z0-9]{3,4}$/.test(trimmed)) {
    return trimmed;
  }

  return 'B738';
}

export function buildSimBriefUrl(params: {
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  aircraftIcao: string;
  pax: number;
  cargoKg?: number;
  oewKg?: number | null;
  mtowKg?: number | null;
  mlwKg?: number | null;
}): string {
  const base = 'https://www.simbrief.com/system/dispatch.php';
  const queryObj: Record<string, string> = {
    airline: params.airline,
    fltnum: params.flightNumber,
    type: params.aircraftIcao,
    orig: params.origin,
    dest: params.destination,
    pax: String(params.pax),
  };

  // Pass cargo weight in thousands of kg (SimBrief cargo param format)
  if (params.cargoKg && params.cargoKg > 0) {
    queryObj.cargo = (params.cargoKg / 1000).toFixed(1);
  }

  // Pass aircraft weight limits via acdata JSON so SimBrief validates MTOW
  if (params.oewKg || params.mtowKg || params.mlwKg) {
    const acdata: Record<string, number> = {};
    if (params.oewKg) acdata.oew = params.oewKg / 1000;
    if (params.mtowKg) acdata.mtow = params.mtowKg / 1000;
    if (params.mlwKg) acdata.mlw = params.mlwKg / 1000;
    queryObj.acdata = JSON.stringify(acdata);
  }

  queryObj.units = 'KGS';
  const query = new URLSearchParams(queryObj);
  return `${base}?${query.toString()}`;
}

export default function SimBriefModal({
  callsign,
  flightNumber,
  origin,
  destination,
  aircraftIcao,
  pax,
  cargoKg,
  oewKg,
  mtowKg,
  mlwKg,
  onClose,
}: SimBriefModalProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const simbriefUrl = buildSimBriefUrl({
    airline: callsign,
    flightNumber,
    origin,
    destination,
    aircraftIcao,
    pax,
    cargoKg,
    oewKg,
    mtowKg,
    mlwKg,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sky-500/10 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">
                SimBrief Dispatch - CPZ{flightNumber}
              </h3>
              <p className="text-slate-400 text-xs">
                {origin} -&gt; {destination} | {aircraftIcao} | {pax} PAX{cargoKg ? ` | ${(cargoKg / 1000).toFixed(1)}t cargo` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={simbriefUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Externally
            </a>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="px-5 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300/80">
            Log into your SimBrief account if prompted. After generating, your OFP will be available in the ACARS flight tracker.
          </p>
        </div>

        {/* iframe */}
        <div className="flex-1 relative bg-slate-900">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
                <p className="text-slate-400 text-sm">Loading SimBrief Dispatch...</p>
              </div>
            </div>
          )}
          <iframe
            src={simbriefUrl}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            title="SimBrief Dispatch"
          />
        </div>
      </div>
    </div>
  );
}
