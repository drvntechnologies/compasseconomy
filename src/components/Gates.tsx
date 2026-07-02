import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Gate, Airport, GateType, LeaseType, Aircraft } from '../lib/types';
import { DoorOpen, Plus, Trash2, Filter, AlertCircle, Plane } from 'lucide-react';

interface GatesProps {
  airports: Airport[];
  isAdmin: boolean;
}

const GATE_TYPE_LABELS: Record<GateType, string> = {
  heavy: 'Heavy',
  medium: 'Medium',
  small: 'Small',
  ramp: 'Ramp',
};

const LEASE_TYPE_LABELS: Record<LeaseType, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  per_hour: 'Per Hour',
};

export default function Gates({ airports, isAdmin }: GatesProps) {
  const [gates, setGates] = useState<Gate[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAirport, setFilterAirport] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newGate, setNewGate] = useState({
    airport_icao: '',
    gate_number: '',
    gate_type: 'medium' as GateType,
    lease_type: 'full_time' as LeaseType,
    monthly_price: '',
    hourly_price: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const airportCodes = useMemo(() => airports.map(a => a.icao_code).sort(), [airports]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [gatesRes, acRes] = await Promise.all([
      supabase.from('gates').select('*').order('airport_icao').order('gate_number'),
      supabase.from('aircraft').select('*'),
    ]);
    if (gatesRes.data) setGates(gatesRes.data);
    if (acRes.data) setAircraft(acRes.data);
    setLoading(false);
  }

  async function addGate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newGate.airport_icao || !newGate.gate_number) {
      setFormError('Airport and gate number are required.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('gates').insert({
      airport_icao: newGate.airport_icao.toUpperCase().trim(),
      gate_number: newGate.gate_number.trim(),
      gate_type: newGate.gate_type,
      lease_type: newGate.lease_type,
      monthly_price: newGate.monthly_price ? parseFloat(newGate.monthly_price) : null,
      hourly_price: newGate.hourly_price ? parseFloat(newGate.hourly_price) : null,
      status: 'open',
    });
    if (error) {
      setFormError(error.message);
    } else {
      setNewGate({ airport_icao: '', gate_number: '', gate_type: 'medium', lease_type: 'full_time', monthly_price: '', hourly_price: '' });
      setShowAddForm(false);
      fetchData();
    }
    setSubmitting(false);
  }

  async function deleteGate(id: string) {
    await supabase.from('gates').delete().eq('id', id);
    fetchData();
  }

  async function releaseGate(id: string) {
    await supabase.from('gates').update({
      status: 'open',
      assigned_aircraft_id: null,
      assigned_booking_id: null,
      occupied_since: null,
    }).eq('id', id);
    fetchData();
  }

  const filteredGates = useMemo(() => {
    if (!filterAirport) return gates;
    return gates.filter(g => g.airport_icao === filterAirport.toUpperCase());
  }, [gates, filterAirport]);

  const gatesByAirport = useMemo(() => {
    const map: Record<string, Gate[]> = {};
    filteredGates.forEach(g => {
      if (!map[g.airport_icao]) map[g.airport_icao] = [];
      map[g.airport_icao].push(g);
    });
    return map;
  }, [filteredGates]);

  const openCount = gates.filter(g => g.status === 'open').length;
  const occupiedCount = gates.filter(g => g.status === 'occupied').length;

  function getAircraftTail(acId: string | null): string {
    if (!acId) return '-';
    const ac = aircraft.find(a => a.id === acId);
    return ac ? ac.tail_number : '-';
  }

  function formatPrice(gate: Gate): string {
    if (gate.lease_type === 'per_hour' && gate.hourly_price != null) {
      return `$${gate.hourly_price}/hr`;
    }
    if (gate.monthly_price != null) {
      return `$${gate.monthly_price}/mo`;
    }
    return '-';
  }

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">Total Gates</p>
          <p className="text-2xl font-bold text-white">{gates.length}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">Open</p>
          <p className="text-2xl font-bold text-emerald-400">{openCount}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">Occupied</p>
          <p className="text-2xl font-bold text-amber-400">{occupiedCount}</p>
        </div>
      </div>

      {/* Filters and actions */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterAirport}
            onChange={e => setFilterAirport(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
          >
            <option value="">All airports</option>
            {airportCodes.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          <span className="text-xs text-slate-500 ml-auto">{filteredGates.length} gates</span>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" /> Add Gate
            </button>
          )}
        </div>
      </div>

      {/* Add gate form (admin only) */}
      {isAdmin && showAddForm && (
        <form onSubmit={addGate} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Add Gate</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            <select
              value={newGate.airport_icao}
              onChange={e => setNewGate({ ...newGate, airport_icao: e.target.value })}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">Airport...</option>
              {airportCodes.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
            <input
              type="text"
              value={newGate.gate_number}
              onChange={e => setNewGate({ ...newGate, gate_number: e.target.value })}
              placeholder="Gate # (e.g. A1)"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <select
              value={newGate.gate_type}
              onChange={e => setNewGate({ ...newGate, gate_type: e.target.value as GateType })}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
            >
              {Object.entries(GATE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={newGate.lease_type}
              onChange={e => setNewGate({ ...newGate, lease_type: e.target.value as LeaseType })}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500/40"
            >
              {Object.entries(LEASE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              value={newGate.monthly_price}
              onChange={e => setNewGate({ ...newGate, monthly_price: e.target.value })}
              placeholder="Monthly $"
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500/40"
            />
            <input
              type="number"
              step="0.01"
              value={newGate.hourly_price}
              onChange={e => setNewGate({ ...newGate, hourly_price: e.target.value })}
              placeholder="Hourly $"
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

      {/* Gates grouped by airport */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : Object.keys(gatesByAirport).length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center text-slate-500">
          <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No gates configured</p>
          {isAdmin && <p className="text-xs mt-1">Add gates for your airports above</p>}
        </div>
      ) : (
        Object.entries(gatesByAirport).map(([airport, airportGates]) => (
          <div key={airport} className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-3">
              <span className="text-white font-mono font-bold text-lg">{airport}</span>
              <span className="text-xs text-slate-400">
                {airportGates.filter(g => g.status === 'open').length} open / {airportGates.length} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/30 border-b border-slate-700/50">
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Gate</th>
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Lease</th>
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Price</th>
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Aircraft</th>
                    {isAdmin && <th className="px-4 py-2.5 text-right text-slate-400 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {airportGates.map(gate => (
                    <tr key={gate.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-2.5 text-white font-mono font-semibold">{gate.gate_number}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          gate.gate_type === 'heavy' ? 'bg-red-500/10 text-red-300' :
                          gate.gate_type === 'medium' ? 'bg-sky-500/10 text-sky-300' :
                          gate.gate_type === 'small' ? 'bg-teal-500/10 text-teal-300' :
                          'bg-slate-600/50 text-slate-300'
                        }`}>
                          {GATE_TYPE_LABELS[gate.gate_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs">{LEASE_TYPE_LABELS[gate.lease_type]}</td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs">{formatPrice(gate)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          gate.status === 'open'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {gate.status === 'open' ? 'Open' : 'Occupied'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {gate.assigned_aircraft_id ? (
                          <span className="flex items-center gap-1 text-xs text-sky-300 font-mono">
                            <Plane className="w-3 h-3" />
                            {getAircraftTail(gate.assigned_aircraft_id)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {gate.status === 'occupied' && (
                              <button
                                onClick={() => releaseGate(gate.id)}
                                className="px-2 py-1 text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-400/10 rounded transition-all"
                                title="Release gate"
                              >
                                Release
                              </button>
                            )}
                            <button
                              onClick={() => deleteGate(gate.id)}
                              disabled={gate.status === 'occupied'}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete gate"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
