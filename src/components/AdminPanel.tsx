import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Airport, Route } from '../lib/types';
import { Upload, Plus, Trash2, MapPin, ToggleLeft, ToggleRight, Plane, AlertCircle, Users, BarChart3, Power, Filter, RefreshCw, Download, Database } from 'lucide-react';
import UserManagement from './UserManagement';
import Analytics from './Analytics';

interface AdminPanelProps {
  airports: Airport[];
  routes: Route[];
  onRefresh: () => void;
}

type TabId = 'airports' | 'routes' | 'upload' | 'users' | 'analytics' | 'export';

export default function AdminPanel({ airports, routes, onRefresh }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('airports');
  const [newIcao, setNewIcao] = useState('');
  const [newIsHub, setNewIsHub] = useState(false);
  const [newMinPax, setNewMinPax] = useState(300);
  const [newMaxPax, setNewMaxPax] = useState(500);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);

  // Route management state
  const [routeFilter, setRouteFilter] = useState('');
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ flight_number: '', departure_icao: '', arrival_icao: '', duration_minutes: 0, airframes: '', flight_type: 'pax', cargo_price_per_kg: 0.45 });
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState('');
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  async function addAirport(e: React.FormEvent) {
    e.preventDefault();
    if (!newIcao.trim()) return;
    setLoading(true);
    setUploadError('');
    const { error } = await supabase.from('airports').insert({
      icao_code: newIcao.toUpperCase().trim(),
      is_hub: newIsHub,
      min_daily_pax: newIsHub ? 3000 : newMinPax,
      max_daily_pax: newIsHub ? 5000 : newMaxPax,
      min_daily_cargo_kg: newIsHub ? 40000 : 8000,
      max_daily_cargo_kg: newIsHub ? 120000 : 35000,
    });
    if (error) {
      setUploadError(error.message);
    } else {
      setNewIcao('');
      setNewIsHub(false);
      setNewMinPax(300);
      setNewMaxPax(500);
      onRefresh();
    }
    setLoading(false);
  }

  async function toggleHub(airport: Airport) {
    const newIsHub = !airport.is_hub;
    await supabase.from('airports').update({
      is_hub: newIsHub,
      min_daily_pax: newIsHub ? 3000 : 300,
      max_daily_pax: newIsHub ? 5000 : 500,
    }).eq('id', airport.id);
    onRefresh();
  }

  async function updateAirportPax(id: string, minPax: number, maxPax: number) {
    await supabase.from('airports').update({ min_daily_pax: minPax, max_daily_pax: maxPax }).eq('id', id);
    onRefresh();
  }

  async function updateAirportCargo(id: string, minCargo: number, maxCargo: number) {
    await supabase.from('airports').update({ min_daily_cargo_kg: minCargo, max_daily_cargo_kg: maxCargo }).eq('id', id);
    onRefresh();
  }

  async function deleteAirport(id: string) {
    await supabase.from('airports').delete().eq('id', id);
    onRefresh();
  }

  async function regenerateDemand() {
    setRegenerating(true);
    setRegenMessage('');
    const { error } = await supabase.rpc('generate_daily_demand');
    if (error) {
      setRegenMessage(`Error: ${error.message}`);
    } else {
      setRegenMessage('Demand regenerated successfully for today.');
    }
    setRegenerating(false);
  }

  async function deleteRoute(id: string) {
    await supabase.from('routes').delete().eq('id', id);
    onRefresh();
  }

  async function toggleRouteActive(route: Route) {
    await supabase.from('routes').update({ is_active: !route.is_active }).eq('id', route.id);
    onRefresh();
  }

  async function updateTicketPrice(routeId: string, price: number) {
    if (price < 0 || isNaN(price)) return;
    await supabase.from('routes').update({ ticket_price_usd: price }).eq('id', routeId);
    onRefresh();
  }

  async function bulkToggleRoutes(airport: string, active: boolean) {
    await supabase.from('routes').update({ is_active: active })
      .or(`departure_icao.eq.${airport},arrival_icao.eq.${airport}`);
    onRefresh();
  }

  async function addRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoute.flight_number || !newRoute.departure_icao || !newRoute.arrival_icao) return;
    setLoading(true);
    const { error } = await supabase.from('routes').insert({
      flight_number: newRoute.flight_number.trim(),
      departure_icao: newRoute.departure_icao.toUpperCase().trim(),
      arrival_icao: newRoute.arrival_icao.toUpperCase().trim(),
      duration_minutes: newRoute.duration_minutes || 60,
      airframes: newRoute.airframes || null,
      is_active: true,
      flight_type: newRoute.flight_type || 'pax',
      cargo_price_per_kg: newRoute.cargo_price_per_kg || 0.45,
    });
    if (error) {
      setUploadError(error.message);
    } else {
      setNewRoute({ flight_number: '', departure_icao: '', arrival_icao: '', duration_minutes: 0, airframes: '', flight_type: 'pax', cargo_price_per_kg: 0.45 });
      setShowAddRoute(false);
      onRefresh();
    }
    setLoading(false);
  }

  const parseAndUploadCSV = useCallback(async (content: string) => {
    setUploadStatus('Parsing CSV...');
    setUploadError('');

    const lines = content.split('\n').filter(l => !l.startsWith('#') && l.trim() !== '');
    if (lines.length < 2) {
      setUploadError('No valid data found in CSV');
      return;
    }

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = lines.slice(1);

    const airportCodes = new Set<string>();
    const hubCodes = new Set<string>();
    const routeData: Array<{
      flight_number: string;
      departure_icao: string;
      arrival_icao: string;
      flight_type: string;
      duration_minutes: number;
      days_of_week: Record<string, boolean>;
      airframes: string;
      is_active: boolean;
    }> = [];

    for (const row of rows) {
      const values = parseCSVRow(row);
      if (values.length < header.length - 1) continue;

      const record: Record<string, string> = {};
      header.forEach((h, i) => {
        record[h] = values[i]?.trim() || '';
      });

      const dep = record['dep']?.toUpperCase();
      const arr = record['arr']?.toUpperCase();
      if (!dep || !arr) continue;

      airportCodes.add(dep);
      airportCodes.add(arr);

      routeData.push({
        flight_number: record['number'] || '',
        departure_icao: dep,
        arrival_icao: arr,
        flight_type: record['type'] || 'pax',
        duration_minutes: parseInt(record['duration']) || 0,
        days_of_week: {
          mon: record['mon'] === 'true',
          tue: record['tue'] === 'true',
          wed: record['wed'] === 'true',
          thu: record['thu'] === 'true',
          fri: record['fri'] === 'true',
          sat: record['sat'] === 'true',
          sun: record['sun'] === 'true',
        },
        airframes: record['airframes'] || '',
        is_active: record['active'] === 'true',
      });
    }

    const airportFrequency: Record<string, number> = {};
    routeData.forEach(r => {
      airportFrequency[r.departure_icao] = (airportFrequency[r.departure_icao] || 0) + 1;
      airportFrequency[r.arrival_icao] = (airportFrequency[r.arrival_icao] || 0) + 1;
    });
    Object.entries(airportFrequency).forEach(([code, count]) => {
      if (count >= 10) hubCodes.add(code);
    });

    setUploadStatus(`Found ${airportCodes.size} airports, ${routeData.length} routes. Uploading airports...`);

    const airportInserts = Array.from(airportCodes).map(code => ({
      icao_code: code,
      is_hub: hubCodes.has(code),
      min_daily_pax: hubCodes.has(code) ? 3000 : 300,
      max_daily_pax: hubCodes.has(code) ? 5000 : 500,
    }));

    for (const apt of airportInserts) {
      const { error } = await supabase.from('airports').upsert(apt, { onConflict: 'icao_code' });
      if (error) {
        setUploadError(`Airport error (${apt.icao_code}): ${error.message}`);
        return;
      }
    }

    setUploadStatus(`Airports uploaded. Clearing old routes and uploading ${routeData.length} new routes...`);

    await supabase.from('routes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const batchSize = 20;
    for (let i = 0; i < routeData.length; i += batchSize) {
      const batch = routeData.slice(i, i + batchSize);
      const { error } = await supabase.from('routes').insert(batch);
      if (error) {
        setUploadError(`Route batch error: ${error.message}`);
        return;
      }
    }

    setUploadStatus(`Upload complete! ${airportCodes.size} airports and ${routeData.length} routes imported.`);
    onRefresh();
  }, [onRefresh]);

  function parseCSVRow(row: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of row) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function toCSV(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const headerLine = headers.map(escapeCsvValue).join(',');
    const dataLines = rows.map(row => headers.map(h => escapeCsvValue(row[h])).join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportTable(key: string, table: string, filename: string) {
    setExportingKey(key);
    setExportError('');
    try {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        setExportError(`No ${table} records found to export.`);
        return;
      }
      downloadCSV(toCSV(data as Record<string, unknown>[]), filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingKey(null);
    }
  }

  function exportLocalData(key: string, rows: Record<string, unknown>[], filename: string) {
    setExportingKey(key);
    setExportError('');
    try {
      if (rows.length === 0) {
        setExportError('No records to export.');
        return;
      }
      downloadCSV(toCSV(rows), filename);
    } finally {
      setExportingKey(null);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      parseAndUploadCSV(content);
    };
    reader.readAsText(file);
  }

  // Filter routes
  const filteredRoutes = routeFilter
    ? routes.filter(r =>
        r.flight_number.includes(routeFilter.toUpperCase()) ||
        r.departure_icao.includes(routeFilter.toUpperCase()) ||
        r.arrival_icao.includes(routeFilter.toUpperCase())
      )
    : routes;

  const activeRouteCount = routes.filter(r => r.is_active).length;
  const inactiveRouteCount = routes.length - activeRouteCount;

  const tabs: Array<{ id: TabId; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'airports', label: 'Airports', icon: MapPin },
    { id: 'routes', label: 'Routes', icon: Plane },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'upload', label: 'CSV Upload', icon: Upload },
    { id: 'export', label: 'Export', icon: Download },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'airports' && (
        <div className="space-y-4">
          <form onSubmit={addAirport} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="text-white font-semibold mb-4">Add Airport</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                value={newIcao}
                onChange={(e) => setNewIcao(e.target.value)}
                placeholder="ICAO Code"
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
              <input
                type="number"
                value={newMinPax}
                onChange={(e) => setNewMinPax(Number(e.target.value))}
                placeholder="Min PAX"
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
              <input
                type="number"
                value={newMaxPax}
                onChange={(e) => setNewMaxPax(Number(e.target.value))}
                placeholder="Max PAX"
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsHub}
                  onChange={(e) => {
                    setNewIsHub(e.target.checked);
                    if (e.target.checked) { setNewMinPax(3000); setNewMaxPax(5000); }
                    else { setNewMinPax(300); setNewMaxPax(500); }
                  }}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                />
                <span className="text-sm text-slate-300">Hub</span>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4 inline mr-1" />Add
              </button>
            </div>
            {uploadError && activeTab === 'airports' && (
              <p className="mt-3 text-red-400 text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />{uploadError}
              </p>
            )}
          </form>

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">ICAO</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Min PAX/Day</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Max PAX/Day</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Min Cargo/Day (kg)</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Max Cargo/Day (kg)</th>
                    <th className="px-4 py-3 text-right text-slate-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {airports.map(airport => (
                    <tr key={airport.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-white font-mono font-semibold">{airport.icao_code}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleHub(airport)} className="flex items-center gap-2 group">
                          {airport.is_hub ? (
                            <ToggleRight className="w-5 h-5 text-sky-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-500" />
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            airport.is_hub ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-600/50 text-slate-400'
                          }`}>
                            {airport.is_hub ? 'HUB' : 'SPOKE'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          defaultValue={airport.min_daily_pax}
                          onBlur={(e) => updateAirportPax(airport.id, Number(e.target.value), airport.max_daily_pax)}
                          className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          defaultValue={airport.max_daily_pax}
                          onBlur={(e) => updateAirportPax(airport.id, airport.min_daily_pax, Number(e.target.value))}
                          className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          defaultValue={airport.min_daily_cargo_kg}
                          onBlur={(e) => updateAirportCargo(airport.id, Number(e.target.value), airport.max_daily_cargo_kg)}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          defaultValue={airport.max_daily_cargo_kg}
                          onBlur={(e) => updateAirportCargo(airport.id, airport.min_daily_cargo_kg, Number(e.target.value))}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteAirport(airport.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {airports.length === 0 && (
              <div className="p-8 text-center text-slate-500">No airports configured. Upload a CSV or add manually.</div>
            )}
          </div>

          {/* Regenerate Demand */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">Regenerate Passenger Demand</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Re-runs the daily demand generation immediately. Clears un-booked waiting PAX and creates fresh pools based on current routes.
                </p>
              </div>
              <button
                onClick={regenerateDemand}
                disabled={regenerating}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-all shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? 'Generating...' : 'Regenerate Now'}
              </button>
            </div>
            {regenMessage && (
              <p className={`mt-3 text-sm ${regenMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {regenMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="space-y-4">
          {/* Route Controls */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Filter className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={routeFilter}
                  onChange={e => setRouteFilter(e.target.value)}
                  placeholder="Filter by flight #, airport..."
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded">{activeRouteCount} active</span>
                <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded">{inactiveRouteCount} inactive</span>
              </div>
              <button
                onClick={() => setShowAddRoute(!showAddRoute)}
                className="flex items-center gap-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" /> Add Route
              </button>
            </div>

            {/* Bulk actions */}
            {routeFilter && airports.some(a => a.icao_code.includes(routeFilter.toUpperCase())) && (
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2">
                <span className="text-xs text-slate-400">Bulk for {routeFilter.toUpperCase()}:</span>
                <button
                  onClick={() => bulkToggleRoutes(routeFilter.toUpperCase(), true)}
                  className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30 transition-colors"
                >
                  Enable all
                </button>
                <button
                  onClick={() => bulkToggleRoutes(routeFilter.toUpperCase(), false)}
                  className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
                >
                  Disable all
                </button>
              </div>
            )}
          </div>

          {/* Add Route Form */}
          {showAddRoute && (
            <form onSubmit={addRoute} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h3 className="text-white font-semibold mb-4">Add Route</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <input
                  type="text"
                  value={newRoute.flight_number}
                  onChange={e => setNewRoute({ ...newRoute, flight_number: e.target.value })}
                  placeholder="Flight # (e.g. 101)"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  value={newRoute.departure_icao}
                  onChange={e => setNewRoute({ ...newRoute, departure_icao: e.target.value })}
                  placeholder="Departure ICAO"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  value={newRoute.arrival_icao}
                  onChange={e => setNewRoute({ ...newRoute, arrival_icao: e.target.value })}
                  placeholder="Arrival ICAO"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  value={newRoute.duration_minutes || ''}
                  onChange={e => setNewRoute({ ...newRoute, duration_minutes: Number(e.target.value) })}
                  placeholder="Duration (min)"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  value={newRoute.airframes}
                  onChange={e => setNewRoute({ ...newRoute, airframes: e.target.value })}
                  placeholder="Airframe (optional)"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <select
                  value={newRoute.flight_type}
                  onChange={e => setNewRoute({ ...newRoute, flight_type: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500"
                >
                  <option value="pax">PAX</option>
                  <option value="cargo">Cargo</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={newRoute.cargo_price_per_kg || ''}
                  onChange={e => setNewRoute({ ...newRoute, cargo_price_per_kg: Number(e.target.value) })}
                  placeholder="$/kg (0.45)"
                  className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500 w-28"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 inline mr-1" />Create
                </button>
              </div>
              {uploadError && activeTab === 'routes' && (
                <p className="mt-3 text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />{uploadError}
                </p>
              )}
            </form>
          )}

          {/* Route Table */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Flight #</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">From</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">To</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Duration</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Airframe</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Ticket $</th>
                    <th className="px-4 py-3 text-left text-slate-400 font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-slate-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredRoutes.map(route => (
                    <tr key={route.id} className={`transition-colors ${route.is_active ? 'hover:bg-slate-700/30' : 'opacity-60 hover:bg-slate-700/20'}`}>
                      <td className="px-4 py-2 text-white font-mono">CPZ{route.flight_number}</td>
                      <td className="px-4 py-2 text-slate-300 font-mono">{route.departure_icao}</td>
                      <td className="px-4 py-2 text-slate-300 font-mono">{route.arrival_icao}</td>
                      <td className="px-4 py-2 text-slate-400">{route.duration_minutes}m</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{route.airframes || 'Any'}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          defaultValue={route.ticket_price_usd}
                          onBlur={e => updateTicketPrice(route.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono focus:ring-2 focus:ring-sky-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => toggleRouteActive(route)}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                            route.is_active
                              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                              : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {route.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteRoute(route.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRoutes.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                {routeFilter ? 'No routes match filter.' : 'No routes loaded. Upload a CSV schedule.'}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && <UserManagement />}

      {activeTab === 'analytics' && <Analytics airports={airports} routes={routes} />}

      {activeTab === 'upload' && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-white font-semibold mb-2">Upload Schedule CSV</h3>
          <p className="text-slate-400 text-sm mb-6">
            Upload your Newsky schedule export. Airports appearing in 10+ routes will be marked as hubs.
            All existing routes will be replaced.
          </p>

          <label className="block cursor-pointer">
            <div className="border-2 border-dashed border-slate-600 rounded-xl p-10 text-center hover:border-sky-500 hover:bg-sky-500/5 transition-all">
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">Click to upload CSV file</p>
              <p className="text-slate-500 text-sm mt-1">Supports Newsky schedule exports</p>
            </div>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          {uploadStatus && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-sm">
              {uploadStatus}
            </div>
          )}
          {uploadError && activeTab === 'upload' && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {uploadError}
            </div>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-5 h-5 text-sky-400" />
              <h3 className="text-white font-semibold">Export Data to CSV</h3>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Download a CSV snapshot of your airline data. Files are generated from the live Supabase tables.
            </p>

            {exportError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />{exportError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => exportLocalData('airports', airports as unknown as Record<string, unknown>[], `airports_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'airports'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <MapPin className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Airports</div>
                  <div className="text-slate-500 text-xs">{airports.length} records</div>
                </div>
                {exportingKey === 'airports' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportLocalData('routes', routes as unknown as Record<string, unknown>[], `routes_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'routes'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <Plane className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Routes</div>
                  <div className="text-slate-500 text-xs">{routes.length} records</div>
                </div>
                {exportingKey === 'routes' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('gates', 'gates', `gates_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'gates'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Gates</div>
                  <div className="text-slate-500 text-xs">Leased &amp; assigned gates</div>
                </div>
                {exportingKey === 'gates' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('aircraft', 'aircraft', `fleet_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'aircraft'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <Plane className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Fleet / Aircraft</div>
                  <div className="text-slate-500 text-xs">All airframes</div>
                </div>
                {exportingKey === 'aircraft' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('bookings', 'flight_bookings', `flight_bookings_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'bookings'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <Users className="w-5 h-5 text-violet-300 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Flight Bookings</div>
                  <div className="text-slate-500 text-xs">Passenger &amp; cargo bookings</div>
                </div>
                {exportingKey === 'bookings' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('transactions', 'financial_transactions', `financial_transactions_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'transactions'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <BarChart3 className="w-5 h-5 text-emerald-300 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">Financial Transactions</div>
                  <div className="text-slate-500 text-xs">Revenue &amp; expenses ledger</div>
                </div>
                {exportingKey === 'transactions' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('notams', 'notams', `notams_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'notams'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">NOTAMs</div>
                  <div className="text-slate-500 text-xs">Active notices</div>
                </div>
                {exportingKey === 'notams' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>

              <button
                onClick={() => exportTable('profiles', 'profiles', `users_${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={exportingKey === 'profiles'}
                className="flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/40 border border-slate-700 rounded-lg text-left transition-all disabled:opacity-50"
              >
                <Users className="w-5 h-5 text-sky-300 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">User Profiles</div>
                  <div className="text-slate-500 text-xs">Pilots &amp; roles</div>
                </div>
                {exportingKey === 'profiles' ? <RefreshCw className="w-4 h-4 ml-auto animate-spin text-slate-400" /> : <Download className="w-4 h-4 ml-auto text-slate-400" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
