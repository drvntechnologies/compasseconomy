use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

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
    connected: bool,
    tracking: bool,
    current_telemetry: Telemetry,
    current_phase: FlightPhase,
    was_airborne: bool,
    parked_timer: Option<std::time::Instant>,
    supabase_url: Option<String>,
    supabase_token: Option<String>,
    last_report_at: Option<String>,
    error: Option<String>,
    poll_handle: Option<tokio::task::JoinHandle<()>>,
}

impl SimState {
    pub fn new() -> Self {
        Self {
            connected: false,
            tracking: false,
            current_telemetry: Telemetry::default(),
            current_phase: FlightPhase::Preflight,
            was_airborne: false,
            parked_timer: None,
            supabase_url: None,
            supabase_token: None,
            last_report_at: None,
            error: None,
            poll_handle: None,
        }
    }

    pub fn status(&self) -> SimConnectStatus {
        SimConnectStatus {
            connected: self.connected,
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

    pub fn stop_tracking(&mut self) {
        self.tracking = false;
        self.supabase_url = None;
        self.supabase_token = None;
    }

    pub fn detect_phase(&mut self) {
        let t = &self.current_telemetry;

        let new_phase = if t.on_ground {
            if self.was_airborne {
                if t.ground_speed_kts < 5 {
                    if let Some(timer) = self.parked_timer {
                        if timer.elapsed().as_secs() >= 30 {
                            FlightPhase::Parked
                        } else {
                            FlightPhase::TaxiIn
                        }
                    } else {
                        self.parked_timer = Some(std::time::Instant::now());
                        FlightPhase::TaxiIn
                    }
                } else {
                    self.parked_timer = None;
                    FlightPhase::TaxiIn
                }
            } else {
                if t.ground_speed_kts > 5 {
                    FlightPhase::TaxiOut
                } else {
                    FlightPhase::Preflight
                }
            }
        } else {
            self.was_airborne = true;
            self.parked_timer = None;

            if self.current_phase == FlightPhase::TaxiOut || self.current_phase == FlightPhase::Preflight {
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
                self.current_phase.clone()
            }
        };

        self.current_phase = new_phase;
    }

    pub fn connect(&mut self, _app: &tauri::AppHandle, _shared: Arc<Mutex<SimState>>) -> Result<(), String> {
        #[cfg(windows)]
        {
            let app = _app;
            let shared = _shared;

            if self.connected {
                return Ok(());
            }

            if let Some(handle) = self.poll_handle.take() {
                handle.abort();
            }

            self.connected = true;
            self.error = None;

            let app_handle = app.clone();
            let handle = tokio::spawn(async move {
                simconnect_poll_loop(app_handle, shared).await;
            });
            self.poll_handle = Some(handle);

            Ok(())
        }
        #[cfg(not(windows))]
        {
            self.error = Some("SimConnect is only available on Windows with MSFS running".to_string());
            Err("SimConnect requires Windows + MSFS".to_string())
        }
    }

    pub fn disconnect(&mut self) {
        self.connected = false;
        self.tracking = false;
        if let Some(handle) = self.poll_handle.take() {
            handle.abort();
        }
    }

    pub async fn report_position(&mut self) -> Result<(), String> {
        if !self.tracking {
            return Ok(());
        }

        let url = self.supabase_url.as_ref().ok_or("No Supabase URL configured")?;
        let token = self.supabase_token.as_ref().ok_or("No auth token")?;

        let endpoint = format!("{}/functions/v1/report-acars-position", url);
        let t = &self.current_telemetry;

        let payload = serde_json::json!({
            "latitude": t.latitude,
            "longitude": t.longitude,
            "altitude_ft": t.altitude_ft,
            "ground_speed_kts": t.ground_speed_kts,
            "heading_deg": t.heading_deg,
            "vs_fpm": t.vs_fpm,
            "fuel_lbs": t.fuel_lbs,
            "sim_rate": t.sim_rate,
            "phase": self.current_phase.as_str(),
            "on_ground": t.on_ground,
        });

        let client = reqwest::Client::new();
        let resp = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            self.last_report_at = Some(chrono::Utc::now().to_rfc3339());
            Ok(())
        } else {
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Position report failed: {}", body))
        }
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
async fn simconnect_poll_loop(app: tauri::AppHandle, state: Arc<Mutex<SimState>>) {
    use std::time::{Duration, Instant};

    let state_clone = Arc::clone(&state);
    let result = tokio::task::spawn_blocking(move || {
        let mut client = match SimConnect::new("CompassAtlantic-ACARS") {
            Ok(c) => c,
            Err(e) => {
                return Err(format!("SimConnect open failed: {}", e));
            }
        };

        let mut registered = false;
        let mut last_report = Instant::now();
        let report_interval = Duration::from_secs(120);

        loop {
            let still_connected = {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(async { state_clone.lock().await.connected })
            };
            if !still_connected {
                break;
            }

            match client.get_next_dispatch() {
                Ok(Some(Notification::Open)) => {
                    if let Err(e) = client.register_object::<AircraftData>() {
                        return Err(format!("Failed to register data: {}", e));
                    }
                    registered = true;
                }
                Ok(Some(Notification::Object(data))) => {
                    if !registered {
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

                        let rt = tokio::runtime::Handle::current();
                        let phase_str = rt.block_on(async {
                            let mut s = state_clone.lock().await;
                            s.current_telemetry = telemetry.clone();
                            s.detect_phase();
                            s.current_phase.as_str().to_string()
                        });

                        let _ = app.emit("simconnect-telemetry", &telemetry);
                        let _ = app.emit("simconnect-phase", &phase_str);

                        if last_report.elapsed() >= report_interval {
                            let rt = tokio::runtime::Handle::current();
                            rt.block_on(async {
                                let mut s = state_clone.lock().await;
                                if let Err(e) = s.report_position().await {
                                    eprintln!("Position report error: {}", e);
                                }
                            });
                            last_report = Instant::now();
                        }
                    }
                }
                Ok(Some(Notification::Quit)) => {
                    return Err("MSFS closed the connection".to_string());
                }
                Ok(_) => {}
                Err(e) => {
                    return Err(format!("SimConnect error: {}", e));
                }
            }

            std::thread::sleep(Duration::from_millis(16));
        }

        Ok(())
    })
    .await;

    let mut s = state.lock().await;
    s.connected = false;
    match result {
        Ok(Err(e)) => {
            s.error = Some(e);
        }
        Err(e) => {
            s.error = Some(format!("Poll task panicked: {}", e));
        }
        _ => {}
    }
}
