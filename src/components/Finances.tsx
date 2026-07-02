import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { AirlineFinancials, FinancialTransaction, MonthlyBillingLog, Aircraft, Gate, TransactionType } from '../lib/types';
import { DollarSign, TrendingUp, Calendar, Filter, AlertCircle, CheckCircle, Banknote, Plane, DoorOpen, Wrench } from 'lucide-react';

interface FinancesProps {
  isAdmin: boolean;
}

const TYPE_STYLES: Record<TransactionType, { bg: string; text: string; label: string; icon: typeof DollarSign }> = {
  ticket_revenue: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Ticket Revenue', icon: TrendingUp },
  engine_cost: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Engine Cost', icon: Plane },
  gate_fee: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Gate Fee', icon: DoorOpen },
  aircraft_lease: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Aircraft Lease', icon: Wrench },
  adjustment: { bg: 'bg-slate-500/10', text: 'text-slate-400', label: 'Adjustment', icon: Banknote },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export default function Finances({ isAdmin }: FinancesProps) {
  const [financials, setFinancials] = useState<AirlineFinancials | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [billingLogs, setBillingLogs] = useState<MonthlyBillingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [processingMonthly, setProcessingMonthly] = useState(false);
  const [monthlyError, setMonthlyError] = useState('');
  const [monthlySuccess, setMonthlySuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [finRes, txRes, billRes] = await Promise.all([
      supabase.from('airline_financials').select('*').eq('id', 1).maybeSingle(),
      supabase.from('financial_transactions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('monthly_billing_log').select('*').order('billing_month', { ascending: false }),
    ]);
    if (finRes.data) setFinancials(finRes.data);
    if (txRes.data) setTransactions(txRes.data);
    if (billRes.data) setBillingLogs(billRes.data);
    setLoading(false);
  }

  async function processMonthlyBilling() {
    setProcessingMonthly(true);
    setMonthlyError('');
    setMonthlySuccess('');

    const now = new Date();
    const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Check if already billed
    const existing = billingLogs.find(b => b.billing_month === billingMonth);
    if (existing) {
      setMonthlyError(`Month ${billingMonth} has already been processed.`);
      setProcessingMonthly(false);
      return;
    }

    // Get all gates with monthly prices
    const { data: gates } = await supabase.from('gates').select('*');
    // Get all aircraft with lease costs
    const { data: aircraft } = await supabase.from('aircraft').select('*');

    if (!gates || !aircraft) {
      setMonthlyError('Failed to fetch gates/aircraft data.');
      setProcessingMonthly(false);
      return;
    }

    // Calculate gate fees
    let gateFees = 0;
    const gateTransactions: { amount: number; description: string; reference_id: string }[] = [];

    for (const gate of gates as Gate[]) {
      let fee = 0;
      if (gate.lease_type === 'full_time' && gate.monthly_price) {
        fee = gate.monthly_price;
      } else if (gate.lease_type === 'part_time' && gate.monthly_price) {
        fee = gate.monthly_price;
      }
      // per_hour gates are billed based on occupancy - skip for monthly batch (they're real-time)
      if (fee > 0) {
        gateFees += fee;
        gateTransactions.push({
          amount: -fee,
          description: `Gate ${gate.gate_number} at ${gate.airport_icao} (${gate.lease_type}) - ${billingMonth}`,
          reference_id: gate.id,
        });
      }
    }

    // Calculate aircraft lease fees
    let leaseFees = 0;
    const leaseTransactions: { amount: number; description: string; reference_id: string }[] = [];

    for (const ac of aircraft as Aircraft[]) {
      if (ac.monthly_lease_usd > 0) {
        leaseFees += ac.monthly_lease_usd;
        leaseTransactions.push({
          amount: -ac.monthly_lease_usd,
          description: `Lease: ${ac.tail_number} (${ac.aircraft_type}) - ${billingMonth}`,
          reference_id: ac.id,
        });
      }
    }

    const totalDebit = gateFees + leaseFees;

    if (totalDebit === 0) {
      setMonthlyError('No recurring fees to process (no gate fees or aircraft leases configured).');
      setProcessingMonthly(false);
      return;
    }

    // Insert all gate fee transactions
    for (const tx of gateTransactions) {
      await supabase.from('financial_transactions').insert({
        type: 'gate_fee',
        amount: tx.amount,
        description: tx.description,
        reference_id: tx.reference_id,
      });
    }

    // Insert all lease transactions
    for (const tx of leaseTransactions) {
      await supabase.from('financial_transactions').insert({
        type: 'aircraft_lease',
        amount: tx.amount,
        description: tx.description,
        reference_id: tx.reference_id,
      });
    }

    // Update balance
    const currentBalance = financials?.balance_usd ?? 0;
    const newBalance = currentBalance - totalDebit;
    await supabase.from('airline_financials').update({
      balance_usd: newBalance,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    // Log billing
    await supabase.from('monthly_billing_log').insert({
      billing_month: billingMonth,
      gate_fees_total: gateFees,
      lease_fees_total: leaseFees,
    });

    setMonthlySuccess(`Processed ${billingMonth}: ${formatCurrency(gateFees)} gate fees + ${formatCurrency(leaseFees)} aircraft leases = ${formatCurrency(totalDebit)} total deducted.`);
    setProcessingMonthly(false);
    fetchData();
  }

  const filteredTransactions = useMemo(() => {
    if (!filterType) return transactions;
    return transactions.filter(t => t.type === filterType);
  }, [transactions, filterType]);

  const thisMonthStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthTx = transactions.filter(t => t.created_at >= monthStart);
    const revenue = monthTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const costs = monthTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { revenue, costs, net: revenue - costs, count: monthTx.length };
  }, [transactions]);

  const allTimeStats = useMemo(() => {
    const revenue = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const costs = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { revenue, costs };
  }, [transactions]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance hero */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Airline Balance</p>
        </div>
        <p className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
          {formatCurrency(financials?.balance_usd ?? 0)}
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Last updated: {financials?.updated_at ? new Date(financials.updated_at).toLocaleString() : 'Never'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">This Month Revenue</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(thisMonthStats.revenue)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">This Month Costs</p>
          <p className="text-xl font-bold text-red-400">{formatCurrency(thisMonthStats.costs)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">All-Time Revenue</p>
          <p className="text-xl font-bold text-emerald-300">{formatCurrency(allTimeStats.revenue)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-1">All-Time Costs</p>
          <p className="text-xl font-bold text-red-300">{formatCurrency(allTimeStats.costs)}</p>
        </div>
      </div>

      {/* Monthly billing (admin) */}
      {isAdmin && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-white font-semibold">Monthly Billing</h3>
                <p className="text-slate-400 text-xs">Process gate fees and aircraft leases for the current month</p>
              </div>
            </div>
            <button
              onClick={processMonthlyBilling}
              disabled={processingMonthly}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-all w-full sm:w-auto"
            >
              {processingMonthly ? 'Processing...' : 'Process Monthly Costs'}
            </button>
          </div>
          {monthlyError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />{monthlyError}
            </div>
          )}
          {monthlySuccess && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" />{monthlySuccess}
            </div>
          )}
          {billingLogs.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-xs text-slate-500 font-medium mb-2">Billing History</p>
              {billingLogs.slice(0, 6).map(log => (
                <div key={log.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-700/50 last:border-0">
                  <span className="text-white font-mono">{log.billing_month}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-amber-400">Gates: {formatCurrency(log.gate_fees_total)}</span>
                    <span className="text-sky-400">Leases: {formatCurrency(log.lease_fees_total)}</span>
                    <span className="text-red-400 font-medium">Total: {formatCurrency(log.gate_fees_total + log.lease_fees_total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transaction ledger */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Banknote className="w-5 h-5 text-slate-400" />
            <h3 className="text-white font-semibold">Transaction Ledger</h3>
            <span className="text-xs text-slate-500">{filteredTransactions.length} entries</span>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-xs focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">All types</option>
              <option value="ticket_revenue">Ticket Revenue</option>
              <option value="engine_cost">Engine Cost</option>
              <option value="gate_fee">Gate Fee</option>
              <option value="aircraft_lease">Aircraft Lease</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Banknote className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
            <p className="text-xs mt-1">Revenue and costs will appear here as flights are completed</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30 max-h-[500px] overflow-y-auto">
            {filteredTransactions.map(tx => {
              const style = TYPE_STYLES[tx.type];
              const Icon = style.icon;
              const isCredit = tx.amount > 0;
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-700/10 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                    <Icon className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{tx.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className={`text-sm font-mono font-semibold shrink-0 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isCredit ? '+' : ''}{formatCurrencyFull(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
