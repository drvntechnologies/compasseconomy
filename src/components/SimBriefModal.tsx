import { useState } from 'react';
import { X, ExternalLink, FileText, AlertTriangle } from 'lucide-react';

interface SimBriefModalProps {
  callsign: string;
  flightNumber: string;
  origin: string;
  destination: string;
  aircraftIcao: string;
  pax: number;
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

export function getSimBriefType(aircraftType: string): string {
  const direct = AIRCRAFT_TYPE_TO_SIMBRIEF[aircraftType];
  if (direct) return direct;

  const normalized = aircraftType.trim();
  for (const [key, value] of Object.entries(AIRCRAFT_TYPE_TO_SIMBRIEF)) {
    if (normalized.toLowerCase().includes(key.toLowerCase())) return value;
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
}): string {
  const base = 'https://www.simbrief.com/system/dispatch.php';
  const query = new URLSearchParams({
    airline: params.airline,
    fltnum: params.flightNumber,
    type: params.aircraftIcao,
    orig: params.origin,
    dest: params.destination,
    pax: String(params.pax),
  });
  return `${base}?${query.toString()}`;
}

export default function SimBriefModal({
  callsign,
  flightNumber,
  origin,
  destination,
  aircraftIcao,
  pax,
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
                {origin} -&gt; {destination} | {aircraftIcao} | {pax} PAX
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
