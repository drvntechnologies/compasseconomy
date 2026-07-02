import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Aircraft, Airport, Gate, SizeCategory } from '../lib/types';
import { AIRCRAFT_SIZE_MAP } from '../lib/types';
import { Plane, Plus, Trash2, Filter, Wrench, CheckCircle, AlertCircle, DoorOpen, X, Pencil } from 'lucide-react';

interface FleetProps {
  airports: Airport[];
  isAdmin: boolean;
}

const SIZE_LABELS: Record<SizeCategory, string> = {
  heavy: 'Heavy',
  medium: 'Medium',
  small: 'Small',
  ramp: 'Ramp/GA',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  available: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Available' },
  reserved: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Reserved' },
  in_flight: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'In Flight' },
  maintenance: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Maintenance' },
};

export default function Fleet({ airports, isAdmin }: FleetProps) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAirport, setFilterAirport] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newAircraft, setNewAircraft] = useState({
    tail_number: '',
    aircraft_type: '',
    size_category: 'medium' as SizeCategory,
    max_pax: 0,
    current_airport_icao: '',
    hourly_cost_usd: '',
    monthly_lease_usd: '',
    assigned_gate_id: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [availableGates, setAvailableGates] = useState<Gate[]>([]);

  const [gateAssignAircraftId, setGateAssignAircraftId] = useState<string | null>(null);
  const [gatePickerOptions, setGatePickerOptions] = useState<Gate[]>([]);
  const [gatePickerLoading, setGatePickerLoading] = useState(false);
  const [aircraftGates, setAircraftGates] = useState<Record<string, Gate | null>>({});

  // Edit state
  const [editingAircraft, setEditingAircraft] = useState<Aircraft | null>(null);
  const [editForm, setEditForm] = useState({
    tail_number: '',
    aircraft_type: '',
    size_category: 'medium' as SizeCategory,
    max_pax: 0,
    current_airport_icao: '',
    hourly_cost_usd: '',
    monthly_lease_usd: '',
  });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const airportCodes = useMemo(() => airports.map(a => a.icao_code).sort(), [airports]);
  const aircraftTypes = useMemo(() => [...new Set(aircraft.map(a => a.aircraft_type))].sort(), [aircraft]);

  useEffect(() => {
    fetchAircraft();
  }, []);

  async function fetchAircraft() {
    setLoading(true);
    const { data } = await supabase
      .from('aircraft')
      .select('*')
      .order('tail_number', { ascending: true });
    if (data) {
      setAircraft(data);
      fetchAircraftGates(data);
    }
    setLoading(false);
  }

  async function fetchGatesForAirport(icao: string) {
    if (!icao) { setAvailableGates([]); return; }
    const { data } = await supabase
      .from('gates')
      .select('*')
      .eq('airport_icao', icao)
      .eq('status', 'open')
      .order('gate_number', { ascending: true });
    setAvailableGates(data || []);
  }

  async function fetchAircraftGates(aircraftList: Aircraft[]) {
    const ids = aircraftList.map(a => a.id);
    if (ids.length === 0) return;
    const { data } = await supabase
      .from('gates')
      .select('*')
      .in('assigned_aircraft_id', ids);
    const map: Record<string, Gate | null> = {};
    if (data) {
      for (const g of data) {
        if (g.assigned_aircraft_id) map[g.assigned_aircraft_id] = g;
      }
    }
    setAircraftGates(map);
  }

  async function openGatePicker(ac: Aircraft) {
    setGateAssignAircraftId(ac.id);
    setGatePickerLoading(true);
    const { data } = await supabase
      .from('gates')
      .select('*')
      .eq('airport_icao', ac.current_airport_icao)
      .eq('status', 'open')
      .order('gate_number', { ascending: true });
    setGatePickerOptions(data || []);
    setGatePickerLoading(false);
  }

  async function assignGateToAircraft(aircraftId: string, gateId: string) {
    // First unassign any current gate for this aircraft
    const currentGate = aircraftGates[aircraftId];
    if (currentGate) {
      await supabase.from('gates').update({
        status: 'open',
        assigned_aircraft_id: null,
        occupied_since: null,
      }).eq('id', currentGate.id);
    }
    // Assign the new gate
    await supabase.from('gates').update({
      status: 'occupied',
      assigned_aircraft_id: aircraftId,
      occupied_since: new Date().toISOString(),
    }).eq('id', gateId);
    setGateAssignAircraftId(null);
    fetchAircraft();
  }

  async function unassignGate(aircraftId: string) {
    const currentGate = aircraftGates[aircraftId];
    if (currentGate) {
      await supabase.from('gates').update({
        status: 'open',
        assigned_aircraft_id: null,
        occupied_since: null,
      }).eq('id', currentGate.id);
    }
    setGateAssignAircraftId(null);
    fetchAircraft();
  }

  async function addAircraft(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newAircraft.tail_number || !newAircraft.aircraft_type || !newAircraft.current_airport_icao || newAircraft.max_pax <= 0) {
      setFormError('All fields are required.');
      return;
    }
    setSubmitting(true);
    const { data: inserted, error } = await supabase.from('aircraft').insert({
      tail_number: newAircraft.tail_number.toUpperCase().trim(),
      aircraft_type: newAircraft.aircraft_type.trim(),
      size_category: newAircraft.size_category,
      max_pax: newAircraft.max_pax,
      current_airport_icao: newAircraft.current_airport_icao.toUpperCase().trim(),
      status: 'available',
      hourly_cost_usd: newAircraft.hourly_cost_usd ? parseFloat(newAircraft.hourly_cost_usd) : 0,
      monthly_lease_usd: newAircraft.monthly_lease_usd ? parseFloat(newAircraft.monthly_lease_usd) : 0,
    }).select().single();
    if (error) {
      setFormError(error.message);
    } else {
      if (newAircraft.assigned_gate_id && inserted) {
        await supabase.from('gates').update({
          status: 'occupied',
          assigned_aircraft_id: inserted.id,
          occupied_since: new Date().toISOString(),
        }).eq('id', newAircraft.assigned_gate_id);
      }
      setNewAircraft({ tail_number: '', aircraft_type: '', size_category: 'medium', max_pax: 0, current_airport_icao: '', hourly_cost_usd: '', monthly_lease_usd: '', assigned_gate_id: '' });
      setAvailableGates([]);
      setShowAddForm(false);
      fetchAircraft();
    }
    setSubmitting(false);
  }

  async function deleteAircraft(id: string) {
    await supabase.from('aircraft').delete().eq('id', id);
    fetchAircraft();
  }

  async function toggleMaintenance(ac: Aircraft) {
    const newStatus = ac.status === 'maintenance' ? 'available' : 'maintenance';
    await supabase.from('aircraft').update({ status: newStatus }).eq('id', ac.id);
    fetchAircraft();
  }

  function openEditModal(ac: Aircraft) {
    setEditingAircraft(ac);
    setEditForm({
      tail_number: ac.tail_number,
      aircraft_type: ac.aircraft_type,
      size_category: ac.size_category,
      max_pax: ac.max_pax,
      current_airport_icao: ac.current_airport_icao,
      hourly_cost_usd: ac.hourly_cost_usd.toString(),
      monthly_lease_usd: ac.monthly_lease_usd.toString(),
    });
    setEditError('');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAircraft) return;
    setEditError('');

    if (!editForm.tail_number || !editForm.aircraft_type || !editForm.current_airport_icao || editForm.max_pax <= 0) {
      setEditError('Tail number, type, location, and max PAX are required.');
      return;
    }

    setEditSubmitting(true);
    const { error } = await supabase.from('aircraft').update({
      tail_number: editForm.tail_number.toUpperCase().trim(),
      aircraft_type: editForm.aircraft_type.trim(),
      size_category: editForm.size_category,
      max_pax: editForm.max_pax,
      current_airport_icao: editForm.current_airport_icao.toUpperCase().trim(),
      hourly_cost_usd: editForm.hourly_cost_usd ? parseFloat(editForm.hourly_cost_usd) : 0,
      monthly_lease_usd: editForm.monthly_lease_usd ? parseFloat(editForm.monthly_lease_usd) : 0,
    }).eq('id', editingAircraft.id);

    if (error) {
      setEditError(error.message);
    } else {
      setEditingAircraft(null);
      fetchAircraft();
    }
    setEditSubmitting(false);
  }

  function handleTypeChange(type: string) {
    setNewAircraft(prev => ({
      ...prev,
      aircraft_type: type,
      size_category: AIRCRAFT_SIZE_MAP[type] || prev.size_category,
    }));
  }

  const filteredAircraft = useMemo(() => {
    return aircraft.filter(ac => {
      if (filterAirport && ac.current_airport_icao !== filterAirport.toUpperCase()) return false;
      if (filterType && ac.aircraft_type !== filterType) return false;
      if (filterStatus && ac.status !== filterStatus) return false;
      return true;
    });
  }, [aircraft, filterAirport, filterType, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts = { available: 0, reserved: 0, in_flight: 0, maintenance: 0 };
    aircraft.forEach(ac => { counts[ac.status]++; });
    return counts;
  }, [aircraft]);

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => {
          const style = STATUS_STYLES[status];
          return (
            <div key={status} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 font-medium mb-1">{style.label}</p>
              <p className={`text-2xl font-bold ${style.text}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Filters and actions */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filterAirport}
            onChange={e => setFilterAirport(e.target.value)}
            placeholder="Airport..."
            className="w-28 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
          >
            <option value="">All types</option>
            {aircraftTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="in_flight">In Flight</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <span className="text-xs text-slate-500 ml-auto">{filteredAircraft.length} aircraft</span>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" /> Add Aircraft
            </button>
          )}
        </div>
      </div>

      {/* Add aircraft form (admin only) */}
      {isAdmin && showAddForm && (
        <form onSubmit={addAircraft} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Add Aircraft</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              value={newAircraft.tail_number}
              onChange={e => setNewAircraft({ ...newAircraft, tail_number: e.target.value })}
              placeholder="Tail # (e.g. N737CA)"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <input
              type="text"
              value={newAircraft.aircraft_type}
              onChange={e => handleTypeChange(e.target.value)}
              placeholder="Type (e.g. 737-800)"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <select
              value={newAircraft.size_category}
              onChange={e => setNewAircraft({ ...newAircraft, size_category: e.target.value as SizeCategory })}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
            >
              {Object.entries(SIZE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              value={newAircraft.max_pax || ''}
              onChange={e => setNewAircraft({ ...newAircraft, max_pax: parseInt(e.target.value) || 0 })}
              placeholder="Max PAX"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <select
              value={newAircraft.current_airport_icao}
              onChange={e => {
                const icao = e.target.value;
                setNewAircraft({ ...newAircraft, current_airport_icao: icao, assigned_gate_id: '' });
                fetchGatesForAirport(icao);
              }}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">Location...</option>
              {airportCodes.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
            <select
              value={newAircraft.assigned_gate_id}
              onChange={e => setNewAircraft({ ...newAircraft, assigned_gate_id: e.target.value })}
              disabled={!newAircraft.current_airport_icao || availableGates.length === 0}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 disabled:opacity-40"
            >
              <option value="">Gate (optional)</option>
              {availableGates.map(g => <option key={g.id} value={g.id}>{g.gate_number} ({g.gate_type})</option>)}
            </select>
            <input
              type="number"
              step="0.01"
              value={newAircraft.hourly_cost_usd}
              onChange={e => setNewAircraft({ ...newAircraft, hourly_cost_usd: e.target.value })}
              placeholder="Hourly cost ($)"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <input
              type="number"
              step="0.01"
              value={newAircraft.monthly_lease_usd}
              onChange={e => setNewAircraft({ ...newAircraft, monthly_lease_usd: e.target.value })}
              placeholder="Monthly lease ($)"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4 inline mr-1" />Create
            </button>
          </div>
          {formError && (
            <p className="mt-3 text-red-400 text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />{formError}
            </p>
          )}
        </form>
      )}

      {/* Aircraft table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filteredAircraft.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Plane className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No aircraft found</p>
            {isAdmin && <p className="text-xs mt-1">Add aircraft to your fleet above</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Tail #</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Type</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Size</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Max PAX</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Location</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Gate</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-3 text-right text-slate-400 font-medium">$/hr</th>}
                  {isAdmin && <th className="px-4 py-3 text-right text-slate-400 font-medium">Lease/mo</th>}
                  {isAdmin && <th className="px-4 py-3 text-right text-slate-400 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredAircraft.map(ac => {
                  const statusStyle = STATUS_STYLES[ac.status];
                  return (
                    <tr key={ac.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-white font-mono font-semibold">{ac.tail_number}</td>
                      <td className="px-4 py-3 text-slate-300">{ac.aircraft_type}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                          {SIZE_LABELS[ac.size_category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{ac.max_pax}</td>
                      <td className="px-4 py-3 text-white font-mono">{ac.current_airport_icao}</td>
                      <td className="px-4 py-3 relative">
                        {gateAssignAircraftId === ac.id ? (
                          <div className="flex items-center gap-1">
                            {gatePickerLoading ? (
                              <span className="text-xs text-slate-500">Loading...</span>
                            ) : gatePickerOptions.length === 0 ? (
                              <span className="text-xs text-slate-500">No open gates</span>
                            ) : (
                              <select
                                autoFocus
                                onChange={e => {
                                  if (e.target.value) assignGateToAircraft(ac.id, e.target.value);
                                }}
                                className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-xs focus:ring-2 focus:ring-sky-500/40"
                              >
                                <option value="">Select gate...</option>
                                {gatePickerOptions.map(g => (
                                  <option key={g.id} value={g.id}>{g.gate_number} ({g.gate_type})</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => setGateAssignAircraftId(null)}
                              className="p-0.5 text-slate-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : aircraftGates[ac.id] ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              {aircraftGates[ac.id]!.gate_number}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => unassignGate(ac.id)}
                                className="p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                title="Unassign gate"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          isAdmin ? (
                            <button
                              onClick={() => openGatePicker(ac)}
                              disabled={ac.status === 'in_flight'}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Assign gate"
                            >
                              <DoorOpen className="w-3.5 h-3.5" />
                              <span>Assign</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">--</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                          {ac.status === 'available' && <CheckCircle className="w-3 h-3" />}
                          {ac.status === 'maintenance' && <Wrench className="w-3 h-3" />}
                          {ac.status === 'in_flight' && <Plane className="w-3 h-3" />}
                          {statusStyle.label}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">
                          ${ac.hourly_cost_usd.toLocaleString()}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">
                          ${ac.monthly_lease_usd.toLocaleString()}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(ac)}
                              disabled={ac.status === 'in_flight'}
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Edit aircraft"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleMaintenance(ac)}
                              disabled={ac.status === 'reserved' || ac.status === 'in_flight'}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title={ac.status === 'maintenance' ? 'Return to service' : 'Set maintenance'}
                            >
                              <Wrench className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteAircraft(ac.id)}
                              disabled={ac.status !== 'available' && ac.status !== 'maintenance'}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete aircraft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Edit Aircraft Modal */}
      {editingAircraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold">Edit Aircraft</h2>
                  <p className="text-slate-400 text-xs">{editingAircraft.tail_number}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingAircraft(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Tail Number</label>
                  <input
                    type="text"
                    value={editForm.tail_number}
                    onChange={e => setEditForm({ ...editForm, tail_number: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Aircraft Type</label>
                  <input
                    type="text"
                    value={editForm.aircraft_type}
                    onChange={e => {
                      const type = e.target.value;
                      setEditForm(prev => ({
                        ...prev,
                        aircraft_type: type,
                        size_category: AIRCRAFT_SIZE_MAP[type] || prev.size_category,
                      }));
                    }}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Size Category</label>
                  <select
                    value={editForm.size_category}
                    onChange={e => setEditForm({ ...editForm, size_category: e.target.value as SizeCategory })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  >
                    {Object.entries(SIZE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Max PAX</label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.max_pax || ''}
                    onChange={e => setEditForm({ ...editForm, max_pax: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Location (ICAO)</label>
                  <select
                    value={editForm.current_airport_icao}
                    onChange={e => setEditForm({ ...editForm, current_airport_icao: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  >
                    <option value="">Select...</option>
                    {airportCodes.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Hourly Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editForm.hourly_cost_usd}
                    onChange={e => setEditForm({ ...editForm, hourly_cost_usd: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Monthly Lease ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editForm.monthly_lease_usd}
                    onChange={e => setEditForm({ ...editForm, monthly_lease_usd: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                  />
                </div>
              </div>

              {editError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {editError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-600 text-white font-semibold text-sm rounded-lg transition-all"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAircraft(null)}
                  className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
