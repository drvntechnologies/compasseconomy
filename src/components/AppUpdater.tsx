import { useState, useEffect } from 'react';
import { getIsTauri } from '../lib/tauri-bridge';
import { Download, RefreshCw, CheckCircle, X, AlertTriangle } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';

interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

export default function AppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isTauri = getIsTauri();

  useEffect(() => {
    if (!isTauri) return;
    const timer = setTimeout(() => checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, [isTauri]);

  async function checkForUpdate() {
    if (!isTauri) return;
    setStatus('checking');
    setError(null);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        setUpdateInfo({
          version: update.version,
          notes: update.body || '',
          date: update.date || null,
        });
        setStatus('available');
      } else {
        setStatus('up-to-date');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  async function downloadAndInstall() {
    if (!isTauri) return;
    setStatus('downloading');
    setProgress(0);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');

      const update = await check();
      if (!update) {
        setStatus('idle');
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });

      setStatus('ready');
      setTimeout(() => relaunch(), 2000);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  if (!isTauri || dismissed || status === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {status === 'checking' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
          <span className="text-sm text-slate-300">Checking for updates...</span>
        </div>
      )}

      {status === 'up-to-date' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-slate-300">You're up to date!</span>
        </div>
      )}

      {status === 'available' && updateInfo && (
        <div className="bg-slate-800 border border-sky-500/30 rounded-xl shadow-2xl shadow-sky-500/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-white">Update Available</span>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3 space-y-2">
            <p className="text-sm text-slate-200">
              Version <span className="font-mono font-bold text-sky-400">{updateInfo.version}</span> is ready to install.
            </p>
            {updateInfo.notes && (
              <p className="text-xs text-slate-400 line-clamp-3">{updateInfo.notes}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={downloadAndInstall}
                className="flex-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Update Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'downloading' && (
        <div className="bg-slate-800 border border-sky-500/30 rounded-xl px-4 py-4 shadow-2xl space-y-2">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-sky-400 animate-pulse" />
            <span className="text-sm font-semibold text-white">Downloading update...</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 text-right">{progress}%</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="bg-slate-800 border border-emerald-500/30 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">Update installed! Restarting...</span>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-slate-800 border border-red-500/30 rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-300">Update check failed</p>
              {error && <p className="text-xs text-slate-400 mt-1 truncate">{error}</p>}
            </div>
            <button
              onClick={() => { setStatus('idle'); setDismissed(true); }}
              className="text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
