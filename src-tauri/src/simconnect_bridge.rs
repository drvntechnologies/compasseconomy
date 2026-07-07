use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(windows)]
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telemetry {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_ft: i32,
    pub ground_speed_kts: i32,
    pub heading_deg: i32,
    pub vs_fpm: i32,
    pub fuel_lbs: f64,
    pub on_ground: bool,
    pub sim_rate: f64,
    pub gear_handle: bool,
}

impl Default for Telemetry {
    fn default() -> Self {
        Self {
            latitude: 0.0,
            longitude: 0.0,
            altitude_ft: 0,
            ground_speed_kts: 0,
            heading_deg: 0,
            vs_fpm: 0,
            fuel_lbs: 0.0,
            on_ground: true,
            sim_rate: 1.0,
            gear_handle: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FlightPhase {
    Preflight,
    TaxiOut,
    Takeoff,
    Climb,
    Cruise,
    Descent,
    Approach,
    Landed,
    TaxiIn,
    Parked,
}

impl FlightPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            FlightPhase::Preflight => "preflight",
            FlightPhase::TaxiOut => "taxi_out",
            FlightPhase::Takeoff => "takeoff",
            FlightPhase::Climb => "climb",
            FlightPhase::Cruise => "cruise",
            FlightPhase::Descent => "descent",
            FlightPhase::Approach => "approach",
            FlightPhase::Landed => "landed",
            FlightPhase::TaxiIn => "taxi_in",
            FlightPhase::Parked => "parked",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimConnectStatus {
    pub connected: bool,
    pub tracking: bool,
    pub phase: String,
    pub last_report_at: Option<String>,
    pub error: Option<String>,
}

pub struct SimState {
    connected: Arc<AtomicBool>,
    tracking: bool,
    current_telemetry: Telemetry,
    current_phase: FlightPhase,
    was_airborne: bool,
    parked_timer: Option<std::time::Instant>,
    supabase_url: Option<String>,
    supabase_token: Option<String>,
    last_report_at: Option<String>,
    error: Option<String>,
    poll_thread: Option<std::thread::JoinHandle<()>>,
}

impl SimState {
    pub fn new() -> Self {
        Self {
            connected: Arc::new(AtomicBool::new(false)),
            tracking: false,
            current_telemetry: Telemetry::default(),
            current_phase: FlightPhase::Preflight,
            was_airborne: false,
            parked_timer: None,
            supabase_url: None,
            supabase_token: None,
            last_report_at: None,
            error: None,
            poll_thread: None,
        }
    }

    pub fn status(&self) -> SimConnectStatus {
        SimConnectStatus {
            connected: self.connected.load(Ordering::Relaxed),
            tracking: self.tracking,
            phase: self.current_phase.as_str().to_string(),
            last_report_at: self.last_report_at.clone(),
            error: self.error.clone(),
        }
    }

    pub fn telemetry(&self) -> &Telemetry {
        &self.current_telemetry
    }

    pub fn start_tracking(&mut self, supabase_url: String, supabase_token: String) {
        self.supabase_url = Some(supabase_url);
        self.supabase_token = Some(supabase_token);
        self.tracking = true;
        self.current_phase = FlightPhase::Preflight;
        self.was_airborne = false;
        self.parked_timer = None;
    }

    pub fn update_token(&mut self, token: String) {
        self.supabase_token = Some(token);
    }

    pub fn stop_tracking(&mut self) {
        self.tracking = false;
        self.supabase_url = None;
        self.supabase_token = None;
    }

    pub fn connect(&mut self, app: &tauri::AppHandle, shared: Arc<Mutex<SimState>>) -> Result<(), String> {
        #[cfg(windows)]
        {
            if self.connected.load(Ordering::Relaxed) {
                return Ok(());
            }

            self.connected.store(true, Ordering::Relaxed);
            self.error = None;

            let connected_flag = Arc::clone(&self.connected);
            let app_handle = app.clone();

            let thread = std::thread::spawn(move || {
                simconnect_poll_loop(app_handle, shared, connected_flag);
            });
            self.poll_thread = Some(thread);

            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = (app, shared);
            self.error = Some("SimConnect is only available on Windows with MSFS running".to_string());
            Err("SimConnect requires Windows + MSFS".to_string())
        }
    }

    pub fn disconnect(&mut self) {
        self.connected.store(false, Ordering::Relaxed);
        self.tracking = false;
        self.poll_thread = None;
    }
}

#[cfg(windows)]
use simconnect_sdk::{Notification, SimConnect, SimConnectObject};

#[cfg(windows)]
#[derive(Debug, Clone, SimConnectObject)]
#[simconnect(period = "second")]
#[allow(dead_code)]
struct AircraftData {
    #[simconnect(name = "PLANE LATITUDE", unit = "degrees")]
    latitude: f64,
    #[simconnect(name = "PLANE LONGITUDE", unit = "degrees")]
    longitude: f64,
    #[simconnect(name = "PLANE ALTITUDE", unit = "feet")]
    altitude: f64,
    #[simconnect(name = "GROUND VELOCITY", unit = "knots")]
    ground_speed: f64,
    #[simconnect(name = "PLANE HEADING DEGREES MAGNETIC", unit = "degrees")]
    heading: f64,
    #[simconnect(name = "VERTICAL SPEED", unit = "feet per minute")]
    vertical_speed: f64,
    #[simconnect(name = "FUEL TOTAL QUANTITY WEIGHT", unit = "pounds")]
    fuel_weight: f64,
    #[simconnect(name = "SIM ON GROUND")]
    on_ground: bool,
    #[simconnect(name = "SIMULATION RATE", unit = "number")]
    sim_rate: f64,
    #[simconnect(name = "GEAR HANDLE POSITION")]
    gear_handle: bool,
}

#[cfg(windows)]
fn simconnect_poll_loop(
    app: tauri::AppHandle,
    state: Arc<Mutex<SimState>>,
    connected: Arc<AtomicBool>,
) {
    use std::time::{Duration, Instant};

    let mut client = match SimConnect::new("CompassAtlantic-ACARS") {
        Ok(c) => c,
        Err(e) => {
            connected.store(false, Ordering::Relaxed);
            if let Ok(mut s) = state.lock() {
                s.error = Some(format!("SimConnect open failed: {}", e));
            }
            return;
        }
    };

    let mut registered = false;
    let report_interval = Duration::from_secs(15);
    let mut last_report = Instant::now() - report_interval;
    let mut phase = FlightPhase::Preflight;
    let mut was_airborne = false;
    let mut parked_timer: Option<Instant> = None;

    loop {
        if !connected.load(Ordering::Relaxed) {
            break;
        }

        match client.get_next_dispatch() {
            Ok(Some(Notification::Open)) => {
                if let Err(e) = client.register_object::<AircraftData>() {
                    connected.store(false, Ordering::Relaxed);
                    if let Ok(mut s) = state.lock() {
                        s.error = Some(format!("Failed to register data: {}", e));
                    }
                    return;
                }
                registered = true;
            }
            Ok(Some(Notification::Object(data))) => {
                if !registered {
                    std::thread::sleep(Duration::from_millis(16));
                    continue;
                }
                if let Ok(ad) = AircraftData::try_from(&data) {
                    let telemetry = Telemetry {
                        latitude: ad.latitude,
                        longitude: ad.longitude,
                        altitude_ft: ad.altitude as i32,
                        ground_speed_kts: ad.ground_speed as i32,
                        heading_deg: ad.heading as i32,
                        vs_fpm: ad.vertical_speed as i32,
                        fuel_lbs: ad.fuel_weight,
                        on_ground: ad.on_ground,
                        sim_rate: ad.sim_rate,
                        gear_handle: ad.gear_handle,
                    };

                    phase = detect_phase_from(&telemetry, &phase, &mut was_airborne, &mut parked_timer);

                    let _ = app.emit("simconnect-telemetry", &telemetry);
                    let _ = app.emit("simconnect-phase", phase.as_str());

                    if let Ok(mut s) = state.lock() {
                        s.current_telemetry = telemetry;
                        s.current_phase = phase.clone();
                        s.was_airborne = was_airborne;
                        s.parked_timer = parked_timer;
                    }

                    if last_report.elapsed() >= report_interval {
                        send_position_report(&state);
                        last_report = Instant::now();
                    }
                }
            }
            Ok(Some(Notification::Quit)) => {
                connected.store(false, Ordering::Relaxed);
                if let Ok(mut s) = state.lock() {
                    s.error = Some("MSFS closed the connection".to_string());
                }
                return;
            }
            Ok(_) => {}
            Err(e) => {
                connected.store(false, Ordering::Relaxed);
                if let Ok(mut s) = state.lock() {
                    s.error = Some(format!("SimConnect error: {}", e));
                }
                return;
            }
        }

        std::thread::sleep(Duration::from_millis(16));
    }
}

#[cfg(windows)]
fn detect_phase_from(
    t: &Telemetry,
    current: &FlightPhase,
    was_airborne: &mut bool,
    parked_timer: &mut Option<std::time::Instant>,
) -> FlightPhase {
    if t.on_ground {
        if *was_airborne {
            if t.ground_speed_kts < 5 {
                if let Some(timer) = parked_timer {
                    if timer.elapsed().as_secs() >= 30 {
                        FlightPhase::Parked
                    } else {
                        FlightPhase::TaxiIn
                    }
                } else {
                    *parked_timer = Some(std::time::Instant::now());
                    FlightPhase::TaxiIn
                }
            } else {
                *parked_timer = None;
                FlightPhase::TaxiIn
            }
        } else if t.ground_speed_kts > 5 {
            FlightPhase::TaxiOut
        } else {
            FlightPhase::Preflight
        }
    } else {
        *was_airborne = true;
        *parked_timer = None;

        if *current == FlightPhase::TaxiOut || *current == FlightPhase::Preflight {
            FlightPhase::Takeoff
        } else if t.vs_fpm > 500 {
            FlightPhase::Climb
        } else if t.vs_fpm < -500 {
            if t.altitude_ft < 3000 && t.gear_handle {
                FlightPhase::Approach
            } else {
                FlightPhase::Descent
            }
        } else if t.altitude_ft > 10000 && t.vs_fpm.abs() < 300 {
            FlightPhase::Cruise
        } else {
            current.clone()
        }
    }
}

#[cfg(windows)]
fn send_position_report(state: &Arc<Mutex<SimState>>) {
    let (url, token, payload) = {
        let s = match state.lock() {
            Ok(s) => s,
            Err(_) => return,
        };
        if !s.tracking {
            return;
        }
        let url = match &s.supabase_url {
            Some(u) => u.clone(),
            None => return,
        };
        let token = match &s.supabase_token {
            Some(t) => t.clone(),
            None => return,
        };
        let t = &s.current_telemetry;
        let payload = serde_json::json!({
            "latitude": t.latitude,
            "longitude": t.longitude,
            "altitude_ft": t.altitude_ft,
            "ground_speed_kts": t.ground_speed_kts,
            "heading_deg": t.heading_deg,
            "vs_fpm": t.vs_fpm,
            "fuel_lbs": t.fuel_lbs,
            "sim_rate": t.sim_rate,
            "phase": s.current_phase.as_str(),
            "on_ground": t.on_ground,
        });
        (url, token, payload)
    };

    let endpoint = format!("{}/functions/v1/report-acars-position", url);
    let client = reqwest::blocking::Client::new();
    match client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
    {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(mut s) = state.lock() {
                    s.last_report_at = Some(chrono::Utc::now().to_rfc3339());
                }
            }
        }
        Err(e) => {
            eprintln!("Position report error: {}", e);
        }
    }
}
