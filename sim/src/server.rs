use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

// ── Shared state between external interfaces and Bevy ──────────────────

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BotCommand {
    RobotCreate {
        #[serde(default)]
        id: Option<String>,
    },
    PartAttach { robot_id: String, slot: String, part_type: String },
    PartCmd { robot_id: String, slot: String, action: String, speed: Option<f32> },
    WorldState,
    WorldReset,
    #[cfg(not(target_arch = "wasm32"))]
    CameraSnapshot { robot_id: String, slot: String },
    #[cfg(not(target_arch = "wasm32"))]
    WorldSnapshot,
}

#[cfg(not(target_arch = "wasm32"))]
pub struct CameraSnapRequest { pub robot_id: String, pub slot: String, pub tx: tokio::sync::oneshot::Sender<Vec<u8>> }

#[derive(Resource, Clone)]
pub struct SharedState {
    pub cmds: Arc<Mutex<Vec<BotCommand>>>,
    pub robots: Arc<Mutex<Vec<String>>>,
    #[cfg(not(target_arch = "wasm32"))]
    pub screenshot_tx: Arc<Mutex<Vec<tokio::sync::oneshot::Sender<Vec<u8>>>>>,
    #[cfg(not(target_arch = "wasm32"))]
    pub camera_snap: Arc<Mutex<Vec<CameraSnapRequest>>>,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            cmds: Arc::new(Mutex::new(Vec::new())),
            robots: Arc::new(Mutex::new(Vec::new())),
            #[cfg(not(target_arch = "wasm32"))]
            screenshot_tx: Arc::new(Mutex::new(Vec::new())),
            #[cfg(not(target_arch = "wasm32"))]
            camera_snap: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

// ── Shared types ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct RobotCreated { pub id: String }

#[derive(Serialize)]
pub struct WorldState { pub robots: Vec<String> }

// ── HTTP Native Server ─────────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub mod http {
    use super::*;
    use axum::{Router, Json, extract::State, routing::post, http::StatusCode, response::IntoResponse};
    use tokio::sync::oneshot;

    async fn handle_v1(State(state): State<SharedState>, Json(cmd): Json<BotCommand>) -> impl IntoResponse {
        match cmd {
            BotCommand::CameraSnapshot { robot_id, slot } => {
                let (tx, rx) = oneshot::channel();
                state.camera_snap.lock().unwrap().push(CameraSnapRequest { robot_id, slot, tx });
                match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
                    Ok(Ok(png_bytes)) => (StatusCode::OK, [("content-type", "image/png")], png_bytes).into_response(),
                    _ => (StatusCode::INTERNAL_SERVER_ERROR, "camera snapshot failed").into_response(),
                }
            }
            BotCommand::WorldSnapshot => {
                let (tx, rx) = oneshot::channel();
                state.screenshot_tx.lock().unwrap().push(tx);
                match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
                    Ok(Ok(png_bytes)) => (StatusCode::OK, [("content-type", "image/png")], png_bytes).into_response(),
                    _ => (StatusCode::INTERNAL_SERVER_ERROR, "screenshot failed").into_response(),
                }
            }
            _ => match super::process_command(state, cmd) {
                Ok(val) => Json(val).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
    }

    pub fn start_server(state: SharedState) {
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let app = Router::new().route("/v1", post(handle_v1)).with_state(state);
                let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
                println!("botblock listening on http://localhost:3000");
                axum::serve(listener, app).await.unwrap();
            });
        });
    }
}

pub fn process_command(state: SharedState, cmd: BotCommand) -> Result<serde_json::Value, String> {
    match cmd {
        BotCommand::RobotCreate { .. } => {
            let id = Uuid::new_v4().to_string();
            state.robots.lock().unwrap().push(id.clone());
            state.cmds.lock().unwrap().push(BotCommand::RobotCreate { id: Some(id.clone()) });
            Ok(serde_json::json!({ "id": id }))
        }
        BotCommand::WorldState => Ok(serde_json::json!({ "robots": state.robots.lock().unwrap().clone() })),
        #[cfg(not(target_arch = "wasm32"))]
        BotCommand::CameraSnapshot { .. } | BotCommand::WorldSnapshot => {
            Err("Snapshots must be handled in async context".to_string())
        }
        other => {
            if let BotCommand::WorldReset = &other {
                state.robots.lock().unwrap().clear();
            }
            state.cmds.lock().unwrap().push(other);
            Ok(serde_json::json!({"ok": true}))
        }
    }
}

// ── WASM Javascript Shim ───────────────────────────────────────────────

#[cfg(target_arch = "wasm32")]
pub mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;
    use std::cell::RefCell;

    thread_local! {
        static WASM_STATE: RefCell<Option<SharedState>> = RefCell::new(None);
    }

    pub fn init_wasm_state(state: SharedState) {
        WASM_STATE.with(|s| *s.borrow_mut() = Some(state));
    }

    #[wasm_bindgen(start)]
    pub fn wasm_start() {
        crate::app_main();
    }

    fn get_state() -> Option<SharedState> {
        WASM_STATE.with(|s| s.borrow().clone())
    }

    #[wasm_bindgen]
    pub fn mock_http_request(method: &str, path: &str, body: &str) -> String {
        let Some(state) = get_state() else {
            return serde_json::json!({"error": "WASM state not initialized"}).to_string();
        };
        if method == "POST" && (path == "/v1" || path == "v1") {
            match serde_json::from_str::<BotCommand>(body) {
                Ok(cmd) => process_command(state, cmd).unwrap().to_string(),
                Err(e) => serde_json::json!({"error": e.to_string()}).to_string(),
            }
        } else {
            format!(r#"{{"error": "not found", "path": "{}", "method": "{}"}}"#, path, method)
        }
    }
}
