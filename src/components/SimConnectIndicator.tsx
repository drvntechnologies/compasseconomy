import { useState, useEffect } from 'react';
import { getIsTauri, invokeCommand } from '../lib/tauri-bridge';
import type { SimConnectStatus } from '../lib/tauri-bridge';
import { Wifi, WifiOff, Radio, AlertCircle } from 'lucide-react';

export default function SimConnectIndicator() {
  const [status, setStatus] = useState<SimConnectStatus | null>(null);
  const [isTauriApp, setIsTauriApp] = useState(false);

  useEffect(() => {
    setIsTauriApp(getIsTauri());
  }, []);

  useEffect(() => {
    if (!isTauriApp) return;

    const pollStatus = async () => {
      const raw = await invokeCommand<string>('get_simconnect_status');
      if (raw) {
        try {
          setStatus(JSON.parse(raw));
        } catch {}
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [isTauriApp]);

  if (!isTauriApp) return null;

  const handleConnect = async () => {
    await invokeCommand('start_simconnect');
  };

  const handleDisconnect = async () => {
    await invokeCommand('stop_simconnect');
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg">
        <div className="w-2 h-2 bg-slate-500 rounded-full" />
        <span className="text-xs text-slate-500">SimConnect</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status.connected ? (
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors group"
          title="Connected to MSFS - Click to disconnect"
        >
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">SimConnect</span>
          {status.tracking && (
            <Radio className="w-3 h-3 text-emerald-300 animate-pulse" />
          )}
        </button>
      ) : (
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
          title={status.error || 'Click to connect to MSFS'}
        >
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <WifiOff className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400 font-medium">Connect</span>
          {status.error && <AlertCircle className="w-3 h-3 text-amber-400" />}
        </button>
      )}
    </div>
  );
}
