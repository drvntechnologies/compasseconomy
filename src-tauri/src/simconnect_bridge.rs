use serde::{Deserialize, Serialize};
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

    /// Detect flight phase from current telemetry
    pub fn detect_phase(&mut self) {
        let t = &self.current_telemetry;

        let new_phase = if t.on_ground {
            if self.was_airborne {
                // We were flying, now on ground = landed
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
                // Never been airborne
                if t.ground_speed_kts > 5 {
                    FlightPhase::TaxiOut
                } else {
                    FlightPhase::Preflight
                }
            }
        } else {
            // Airborne
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
                // Maintain current phase if no clear transition
                self.current_phase.clone()
            }
        };

        self.current_phase = new_phase;
    }

    /// Connect to SimConnect (Windows only - stubbed on other platforms)
    pub fn connect(&mut self, _app: &tauri::AppHandle) -> Result<(), String> {
        #[cfg(windows)]
        {
            self.connected = true;
            self.error = None;
            // On Windows, the actual SimConnect connection loop would be
            // spawned here using simconnect-sdk. The loop polls every 2 seconds,
            // updates self.current_telemetry, calls detect_phase(), and emits
            // "simconnect-telemetry" events to the frontend.
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
    }

    /// Called every 2 seconds when connected - updates telemetry from SimConnect
    #[cfg(windows)]
    pub fn poll_simconnect(&mut self, app: &tauri::AppHandle) {
        // In the real implementation, this reads SimVars via simconnect-sdk:
        // - PLANE LATITUDE / PLANE LONGITUDE
        // - PLANE ALTITUDE (feet)
        // - GROUND VELOCITY (knots)
        // - PLANE HEADING DEGREES MAGNETIC
        // - VERTICAL SPEED (ft/min)
        // - FUEL TOTAL QUANTITY WEIGHT (pounds)
        // - SIM ON GROUND (boolean)
        // - SIMULATION RATE
        // - GEAR HANDLE POSITION

        self.detect_phase();

        // Emit telemetry event to frontend
        let _ = app.emit("simconnect-telemetry", &self.current_telemetry);
        let _ = app.emit("simconnect-phase", self.current_phase.as_str());
    }

    /// Called every 120 seconds to report position to Supabase
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
