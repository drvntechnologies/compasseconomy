import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X } from 'lucide-react';
import type { Airport } from '../lib/types';

interface SearchableSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  airports: Airport[];
  compact?: boolean;
}

export default function SearchableSelect({ value, onChange, options, placeholder, allowEmpty, emptyLabel, airports, compact }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toUpperCase();
    return options.filter(code => code.includes(q));
  }, [options, query]);

  const py = compact ? 'py-2' : 'py-2.5';

  return (
    <div ref={ref} className="relative">
      <div
        className={`w-full px-3 ${py} bg-slate-900 border border-slate-600 rounded-lg text-sm flex items-center gap-2 cursor-pointer hover:border-slate-500 transition-colors`}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
      >
        <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        {value ? (
          <span className="text-white font-mono flex-1">{value} {airports.find(a => a.icao_code === value)?.is_hub ? '(HUB)' : ''}</span>
        ) : (
          <span className="text-slate-500 flex-1">{placeholder}</span>
        )}
        {value && (
          <button
            onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }}
            className="text-slate-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-700">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:ring-1 focus:ring-sky-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {allowEmpty && (
              <button
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-700 transition-colors"
              >
                {emptyLabel || 'None'}
              </button>
            )}
            {filtered.map(code => (
              <button
                key={code}
                onClick={() => { onChange(code); setOpen(false); setQuery(''); }}
                className={`w-full px-3 py-2 text-left text-sm font-mono flex items-center justify-between hover:bg-slate-700 transition-colors ${
                  code === value ? 'bg-sky-500/10 text-sky-400' : 'text-slate-300'
                }`}
              >
                <span>{code}</span>
                {airports.find(a => a.icao_code === code)?.is_hub && (
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">HUB</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-500 text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
