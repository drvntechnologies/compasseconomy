#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod simconnect_bridge;

use simconnect_bridge::SimState;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[tauri::command]
async fn get_simconnect_status(state: tauri::State<'_, Arc<Mutex<SimState>>>) -> Result<String, String> {
    let sim = state.lock().await;
    Ok(serde_json::to_string(&sim.status()).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn start_simconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<SimState>>>,
) -> Result<(), String> {
    let mut sim = state.lock().await;
    sim.connect(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_simconnect(state: tauri::State<'_, Arc<Mutex<SimState>>>) -> Result<(), String> {
    let mut sim = state.lock().await;
    sim.disconnect();
    Ok(())
}

#[tauri::command]
async fn start_flight_tracking(
    state: tauri::State<'_, Arc<Mutex<SimState>>>,
    supabase_url: String,
    supabase_token: String,
) -> Result<(), String> {
    let mut sim = state.lock().await;
    sim.start_tracking(supabase_url, supabase_token);
    Ok(())
}

#[tauri::command]
async fn stop_flight_tracking(state: tauri::State<'_, Arc<Mutex<SimState>>>) -> Result<(), String> {
    let mut sim = state.lock().await;
    sim.stop_tracking();
    Ok(())
}

#[tauri::command]
async fn get_current_telemetry(
    state: tauri::State<'_, Arc<Mutex<SimState>>>,
) -> Result<String, String> {
    let sim = state.lock().await;
    Ok(serde_json::to_string(&sim.telemetry()).map_err(|e| e.to_string())?)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(Mutex::new(SimState::new())))
        .invoke_handler(tauri::generate_handler![
            get_simconnect_status,
            start_simconnect,
            stop_simconnect,
            start_flight_tracking,
            stop_flight_tracking,
            get_current_telemetry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
