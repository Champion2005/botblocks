use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

// ── Shared state between external interfaces and Bevy ──────────────────

#[derive(Default, Clone)]
pub struct CommandQueue {
    pub spawns: Vec<SpawnRobot>,
    pub motor_cmds: Vec<MotorCommand>,
    pub part_attachments: Vec<PartAttachment>,
}

#[derive(Clone)]
pub struct SpawnRobot {
    pub id: String,
}

#[derive(Clone)]
pub struct MotorCommand {
    pub robot_id: String,
    pub slot: String,
    pub speed: f32,
}

#[derive(Clone)]
pub struct PartAttachment {
    pub robot_id: String,
    pub slot: String,
    pub part_type: String,
}

#[cfg(not(target_arch = "wasm32"))]
pub struct CameraSnapRequest {
    pub robot_id: String,
    pub slot: String,
    pub tx: tokio::sync::oneshot::Sender<Vec<u8>>,
}

#[derive(Resource, Clone)]
pub struct SharedState {
    pub queue: Arc<Mutex<CommandQueue>>,
    pub robots: Arc<Mutex<Vec<String>>>,
    #[cfg(not(target_arch = "wasm32"))]
    pub screenshot_tx: Arc<Mutex<Vec<tokio::sync::oneshot::Sender<Vec<u8>>>>>,
    #[cfg(not(target_arch = "wasm32"))]
    pub camera_snap: Arc<Mutex<Vec<CameraSnapRequest>>>,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            queue: Arc::new(Mutex::new(CommandQueue::default())),
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
pub struct RobotCreated {
    pub id: String,
}

#[derive(Deserialize)]
pub struct AttachPart {
    pub slot: String,
    #[serde(rename = "type")]
    pub part_type: String,
}

#[derive(Deserialize)]
pub struct PartCmd {
    pub action: String,
    pub speed: Option<f32>,
}

#[derive(Serialize)]
pub struct WorldState {
    pub robots: Vec<String>,
}

// ── HTTP Native Server ─────────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub mod http {
    use super::*;
    use axum::{Router, Json, extract::State, routing::{post, get}, http::StatusCode, response::IntoResponse};
    use tokio::sync::oneshot;

    async fn create_robot(State(state): State<SharedState>) -> Json<RobotCreated> {
        let id = Uuid::new_v4().to_string();
        state.robots.lock().unwrap().push(id.clone());
        state.queue.lock().unwrap().spawns.push(SpawnRobot { id: id.clone() });
        Json(RobotCreated { id })
    }

    async fn attach_part(
        State(state): State<SharedState>,
        axum::extract::Path(robot_id): axum::extract::Path<String>,
        Json(body): Json<AttachPart>,
    ) -> Json<serde_json::Value> {
        state.queue.lock().unwrap().part_attachments.push(PartAttachment {
            robot_id,
            slot: body.slot,
            part_type: body.part_type,
        });
        Json(serde_json::json!({"ok": true}))
    }

    async fn part_command(
        State(state): State<SharedState>,
        axum::extract::Path((robot_id, slot)): axum::extract::Path<(String, String)>,
        Json(body): Json<PartCmd>,
    ) -> Json<serde_json::Value> {
        match body.action.as_str() {
            "set_speed" => {
                let speed = body.speed.unwrap_or(0.0);
                state.queue.lock().unwrap().motor_cmds.push(MotorCommand {
                    robot_id,
                    slot,
                    speed,
                });
            }
            "stop" => {
                state.queue.lock().unwrap().motor_cmds.push(MotorCommand {
                    robot_id,
                    slot,
                    speed: 0.0,
                });
            }
            _ => {}
        }
        Json(serde_json::json!({"ok": true}))
    }

    async fn world_state(State(state): State<SharedState>) -> Json<WorldState> {
        let robots = state.robots.lock().unwrap().clone();
        Json(WorldState { robots })
    }

    async fn camera_snapshot(
        State(state): State<SharedState>,
        axum::extract::Path((robot_id, slot)): axum::extract::Path<(String, String)>,
    ) -> impl IntoResponse {
        let (tx, rx) = oneshot::channel();
        state.camera_snap.lock().unwrap().push(CameraSnapRequest { robot_id, slot, tx });
        match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
            Ok(Ok(png_bytes)) => (StatusCode::OK, [("content-type", "image/png")], png_bytes).into_response(),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "camera snapshot failed").into_response(),
        }
    }

    async fn world_snapshot(State(state): State<SharedState>) -> impl IntoResponse {
        let (tx, rx) = oneshot::channel();
        state.screenshot_tx.lock().unwrap().push(tx);
        match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
            Ok(Ok(png_bytes)) => (StatusCode::OK, [("content-type", "image/png")], png_bytes).into_response(),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "screenshot failed").into_response(),
        }
    }

    pub fn start_server(state: SharedState) {
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let app = Router::new()
                    .route("/robots", post(create_robot))
                    .route("/robots/{id}/parts", post(attach_part))
                    .route("/robots/{id}/parts/{slot}/cmd", post(part_command))
                    .route("/robots/{id}/parts/{slot}/camera", get(camera_snapshot))
                    .route("/world/state", get(world_state))
                    .route("/world/snapshot", get(world_snapshot))
                    .with_state(state);

                let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
                println!("🤖 BotBlock sim listening on http://localhost:3000");
                axum::serve(listener, app).await.unwrap();
            });
        });
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
        WASM_STATE.with(|s| {
            *s.borrow_mut() = Some(state);
        });
    }

    fn get_state() -> SharedState {
        WASM_STATE.with(|s| {
            s.borrow().clone().expect("WASM_STATE not initialized")
        })
    }

    #[wasm_bindgen]
    pub fn mock_http_request(method: &str, path: &str, body: &str) -> String {
        let state = get_state();
        let path = path.trim_start_matches('/');
        let segments: Vec<&str> = path.split('/').collect();

        match (method, segments.as_slice()) {
            ("POST", ["robots"]) => {
                let id = Uuid::new_v4().to_string();
                state.robots.lock().unwrap().push(id.clone());
                state.queue.lock().unwrap().spawns.push(SpawnRobot { id: id.clone() });
                serde_json::to_string(&RobotCreated { id }).unwrap()
            },
            ("POST", ["robots", id, "parts"]) => {
                if let Ok(attach) = serde_json::from_str::<AttachPart>(body) {
                    state.queue.lock().unwrap().part_attachments.push(PartAttachment {
                        robot_id: id.to_string(),
                        slot: attach.slot,
                        part_type: attach.part_type,
                    });
                    r#"{"ok": true}"#.to_string()
                } else {
                    r#"{"error": "invalid body"}"#.to_string()
                }
            },
            ("POST", ["robots", id, "parts", slot, "cmd"]) => {
                if let Ok(cmd) = serde_json::from_str::<PartCmd>(body) {
                    let mut q = state.queue.lock().unwrap();
                    match cmd.action.as_str() {
                        "set_speed" => {
                            q.motor_cmds.push(MotorCommand {
                                robot_id: id.to_string(),
                                slot: slot.to_string(),
                                speed: cmd.speed.unwrap_or(0.0),
                            });
                        },
                        "stop" => {
                            q.motor_cmds.push(MotorCommand {
                                robot_id: id.to_string(),
                                slot: slot.to_string(),
                                speed: 0.0,
                            });
                        },
                        _ => {}
                    }
                    r#"{"ok": true}"#.to_string()
                } else {
                    r#"{"error": "invalid body"}"#.to_string()
                }
            },
            ("GET", ["world", "state"]) => {
                let robots = state.robots.lock().unwrap().clone();
                serde_json::to_string(&WorldState { robots }).unwrap()
            },
            _ => {
                r#"{"error": "not found"}"#.to_string()
            }
        }
    }
}