export interface SimConnectStatus {
  connected: boolean;
  tracking: boolean;
  phase: string;
  last_report_at: string | null;
  error: string | null;
}

export interface SimTelemetry {
  latitude: number;
  longitude: number;
  altitude_ft: number;
  ground_speed_kts: number;
  heading_deg: number;
  vs_fpm: number;
  fuel_lbs: number;
  on_ground: boolean;
  sim_rate: number;
  gear_handle: boolean;
  eng1_combustion: boolean;
  eng2_combustion: boolean;
  light_nav: boolean;
  light_beacon: boolean;
  light_landing: boolean;
  light_taxi: boolean;
  light_strobe: boolean;
  light_logo: boolean;
  light_wing: boolean;
  light_recognition: boolean;
  eng1_combustion: boolean;
  eng2_combustion: boolean;
export interface FlightEvent {
  event: string;
  value: number | null;
  detail: string | null;
}

  light_nav: boolean;
  light_beacon: boolean;
  light_landing: boolean;
  light_taxi: boolean;
  light_strobe: boolean;
  light_logo: boolean;
  light_wing: boolean;
  light_recognition: boolean;
}

export interface FlightEvent {
  event: string;
  value: number | null;
  detail: string | null;
}

let isTauri = false;
try {
  isTauri = !!(window as any).__TAURI_INTERNALS__;
} catch {}

export function getIsTauri(): boolean {
  return isTauri;
}

export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.error(`Tauri invoke failed (${cmd}):`, e);
    return null;
  }
}

export async function listenEvent<T>(event: string, handler: (payload: T) => void): Promise<(() => void) | null> {
  if (!isTauri) return null;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<T>(event, (e) => handler(e.payload));
    return unlisten;
  } catch {
    return null;
  }
}
