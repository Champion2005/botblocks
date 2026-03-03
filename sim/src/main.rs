mod server;

use bevy::prelude::*;
use avian3d::prelude::*;
use server::SharedState;

/// Marker component identifying a robot entity.
#[derive(Component)]
struct Robot { id: String }

/// Motor speed targets (attached to the robot entity).
#[derive(Component, Clone, Copy, Default)]
struct Motors {
    left: f32,
    right: f32,
    bottom: f32,
}

/// Marker on wheel entities linking back to the robot and its slot.
#[derive(Component)]
struct Wheel { robot: Entity, slot: String }

fn main() { app_main() }

pub fn app_main() {
    let state = SharedState::default();

    #[cfg(not(target_arch = "wasm32"))]
    server::http::start_server(state.clone());

    #[cfg(target_arch = "wasm32")]
    server::wasm::init_wasm_state(state.clone());

    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            canvas: Some("#bevy-canvas".into()),
            fit_canvas_to_parent: true,
            ..default()
        }),
        ..default()
    }))
    .add_plugins(PhysicsPlugins::default())
    .insert_resource(state)
    .add_systems(Startup, setup_scene)
    .add_systems(Update, process_api_commands)
    .add_systems(Update, apply_motor_torques);

    #[cfg(not(target_arch = "wasm32"))]
    screenshot::register(&mut app);

    app.run();
}

/// Set up ground plane, light, and spectator camera.
fn setup_scene(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    asset_server: Res<AssetServer>,
) {
    // ground
    commands.spawn((
        Mesh3d(meshes.add(Circle::new(20.0))),
        MeshMaterial3d(materials.add(Color::srgb(0.55, 0.62, 0.7))),
        Transform::from_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2)),
        RigidBody::Static,
        Collider::half_space(Vec3::Y),
    ));
    // light
    commands.spawn((
        DirectionalLight { shadows_enabled: true, illuminance: 10000.0, ..default() },
        Transform::from_xyz(5.0, 10.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    // spectator camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 12.0, 12.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    // hotdog — textured plane facing the robot, randomised x position (native only)
    #[cfg(not(target_arch = "wasm32"))]
    let hotdog_x = {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos();
        ((nanos % 1000) as f32 / 1000.0 - 0.5) * 3.0 // −1.5 … +1.5
    };
    #[cfg(target_arch = "wasm32")]
    let (hotdog_x, hotdog_z) = (0.0, -3.5); // Fixed central position for web demo
    #[cfg(not(target_arch = "wasm32"))]
    let hotdog_z = -4.0;

    #[cfg(not(target_arch = "wasm32"))]
    let hotdog_mat = materials.add(StandardMaterial {
        base_color_texture: Some(asset_server.load("hotdog.png")),
        unlit: true,
        ..default()
    });
    #[cfg(target_arch = "wasm32")]
    let hotdog_mat = materials.add(Color::srgb(0.85, 0.2, 0.1));
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 1.3, 0.1))),
        MeshMaterial3d(hotdog_mat),
        Transform::from_xyz(hotdog_x, 1.0, hotdog_z),
    ));
}

use std::collections::HashMap;
use server::BotCommand;

struct RobotState {
    entity: Entity,
    motors: Motors,
}

/// Drains command queue in-order, using shadow state to apply ECS modifications immediately.
fn process_api_commands(
    mut commands: Commands,
    state: Res<SharedState>,
    mut robots: Local<HashMap<String, RobotState>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let cmds: Vec<_> = {
        let mut q = state.cmds.lock().unwrap();
        q.drain(..).collect()
    };

    for cmd in cmds {
        match cmd {
            BotCommand::RobotCreate { id } => {
                let id = id.expect("ID must be generated before getting here");
                println!("Spawning robot: {}", id);
                let motors = Motors::default();
                let entity = commands.spawn((
                    Mesh3d(meshes.add(Cuboid::new(1.0, 0.5, 1.5))),
                    MeshMaterial3d(materials.add(Color::srgb(0.9, 0.9, 0.92))),
                    Transform::from_xyz(0.0, 0.5, 0.0),
                    Robot { id: id.clone() },
                    motors,
                    RigidBody::Dynamic,
                    Collider::cuboid(1.0, 0.5, 1.5),
                    GravityScale(0.0),
                )).id();
                robots.insert(id, RobotState { entity, motors });
            }
            BotCommand::PartAttach { robot_id, slot, part_type } => {
                let Some(rstate) = robots.get(&robot_id) else {
                    bevy::log::warn!("Tried to attach part to unknown robot {}", robot_id);
                    continue;
                };
                if part_type == "Motor" {
                    // Wheel config: (offset from robot, joint axis in local space)
                    let (offset, joint_axis) = match slot.as_str() {
                        "left"   => (Vec3::new(-0.65, 0.0, 0.0), Vec3::X),
                        "right"  => (Vec3::new( 0.65, 0.0, 0.0), Vec3::X),
                        "bottom" => (Vec3::new( 0.0,  0.0, 1.0), Vec3::Z),
                        _ => continue,
                    };
                    let wheel_pos = Vec3::new(0.0, 0.5, 0.0) + offset;
                    let wheel = commands.spawn((
                        Mesh3d(meshes.add(Cylinder::new(0.2, 0.3))),
                        MeshMaterial3d(materials.add(Color::srgb(0.85, 0.35, 0.15))),
                        Transform::from_translation(wheel_pos),
                        RigidBody::Dynamic,
                        Collider::cylinder(0.2, 0.3),
                        GravityScale(0.0),
                        Wheel { robot: rstate.entity, slot: slot.clone() },
                    )).id();
                    // Spawn the joint as a separate entity referencing both bodies
                    commands.spawn(
                        RevoluteJoint::new(rstate.entity, wheel)
                            .with_local_anchor1(offset)
                            .with_local_anchor2(Vec3::ZERO)
                            .with_hinge_axis(joint_axis),
                    );
                } else if part_type == "Camera" {
                    let slot_name = slot.clone();
                    let offset = Vec3::new(0.0, 0.35, -0.85);
                    let mut child_cmd = commands.spawn((
                        Mesh3d(meshes.add(Cuboid::new(0.25, 0.2, 0.2))),
                        MeshMaterial3d(materials.add(Color::srgb(0.15, 0.15, 0.18))),
                        Transform::from_translation(offset),
                    ));
                    #[cfg(not(target_arch = "wasm32"))]
                    child_cmd.insert(screenshot::CameraPart { slot: slot_name });
                    let child = child_cmd.id();
                    commands.entity(rstate.entity).add_child(child);
                }
            }
            BotCommand::PartCmd { robot_id, slot, action, speed } => {
                let Some(state) = robots.get_mut(&robot_id) else {
                    bevy::log::warn!("Motor command for unknown robot: {}", robot_id);
                    continue;
                };
                let speed = speed.unwrap_or(0.0);
                match action.as_str() {
                    "set_speed" => match slot.as_str() {
                        "left" => state.motors.left = speed,
                        "right" => state.motors.right = speed,
                        "bottom" => state.motors.bottom = speed,
                        _ => {}
                    },
                    "stop" => match slot.as_str() {
                        "left" => state.motors.left = 0.0,
                        "right" => state.motors.right = 0.0,
                        "bottom" => state.motors.bottom = 0.0,
                        _ => {}
                    },
                    _ => {}
                }
                // Overwrite the actual ECS component
                commands.entity(state.entity).insert(state.motors);
            }
            BotCommand::WorldReset => {
                println!("Resetting simulation state");
                for state in robots.values() {
                    commands.entity(state.entity).despawn();
                }
                robots.clear();
            }
            _ => {}
        }
    }
}

fn apply_motor_torques(mut robots: Query<(&Motors, &mut AngularVelocity, &mut LinearVelocity), With<Robot>>) {
    for (motors, mut ang_vel, mut lin_vel) in &mut robots {
        ang_vel.0 = Vec3::new(0.0, -motors.bottom, 0.0);
        lin_vel.0 = Vec3::ZERO;
    }
}

// ── Screenshot systems (native only) ──────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
mod screenshot {
    use super::*;
    use bevy::camera::RenderTarget;
    use bevy::render::view::screenshot::{Screenshot, ScreenshotCaptured};
    use bevy::tasks::AsyncComputeTaskPool;

    /// Marker for camera part children, storing the slot name.
    #[derive(Component)]
    pub struct CameraPart { pub slot: String, }

    /// Queued world screenshot requests waiting for a frame to render.
    #[derive(Resource, Default)]
    struct PendingWorldScreenshots { entries: Vec<PendingShot>, }

    struct PendingShot { frames_remaining: u32, tx: tokio::sync::oneshot::Sender<Vec<u8>> }

    /// Queued camera snap requests waiting for their offscreen render.
    #[derive(Resource, Default)]
    struct PendingCameraSnaps { entries: Vec<PendingCameraShot>, }

    struct PendingCameraShot {
        frames_remaining: u32,
        tx: tokio::sync::oneshot::Sender<Vec<u8>>,
        camera_entity: Entity,
        image_handle: Handle<Image>,
    }

    fn encode_and_send(image: bevy::image::Image, tx: tokio::sync::oneshot::Sender<Vec<u8>>) {
        AsyncComputeTaskPool::get().spawn(async move {
            let Ok(dyn_img) = image.try_into_dynamic() else {
                let _ = tx.send(Vec::new());
                return;
            };
            let mut buf = std::io::Cursor::new(Vec::new());
            dyn_img.write_to(&mut buf, image::ImageFormat::Png).expect("failed to write img");
            let _ = tx.send(buf.into_inner());
        }).detach();
    }

    /// Drain world screenshot requests from shared state.
    fn drain_world_screenshot_requests(
        state: Res<SharedState>,
        mut pending: ResMut<PendingWorldScreenshots>,
    ) {
        let txs: Vec<_> = state.screenshot_tx.lock().unwrap().drain(..).collect();
        for tx in txs {
            pending.entries.push(PendingShot { frames_remaining: 2, tx });
        }
    }

    /// Process pending world screenshots: count down frames, then capture.
    fn process_world_screenshots(
        mut commands: Commands,
        mut pending: ResMut<PendingWorldScreenshots>,
    ) {
        let mut still_pending = Vec::new();
        for mut entry in pending.entries.drain(..) {
            if entry.frames_remaining > 0 {
                entry.frames_remaining -= 1;
                still_pending.push(entry);
                continue;
            }
            let tx = std::sync::Mutex::new(Some(entry.tx));
            commands
                .spawn(Screenshot::primary_window())
                .observe(move |event: On<ScreenshotCaptured>| {
                    let Some(tx) = tx.lock().unwrap().take() else { return };
                    encode_and_send(event.image.clone(), tx);
                });
        }
        pending.entries = still_pending;
    }

    /// Drain camera snap requests: spawn offscreen cameras.
    fn drain_camera_snap_requests(
        mut commands: Commands,
        state: Res<SharedState>,
        mut pending: ResMut<PendingCameraSnaps>,
        mut images: ResMut<Assets<Image>>,
        robots: Query<(&Robot, &GlobalTransform, &Children)>,
        camera_parts: Query<(&CameraPart, &Transform)>,
    ) {
        let reqs: Vec<_> = state.camera_snap.lock().unwrap().drain(..).collect();
        for req in reqs {
            // Find robot
            let Some((_, robot_gtf, children)) = robots.iter().find(|(r, _, _)| r.id == req.robot_id) else {
                let _ = req.tx.send(Vec::new());
                continue;
            };

            // Find camera part child
            let mut cam_local_tf = None;
            for child in children.iter() {
                if let Ok((cp, tf)) = camera_parts.get(child) {
                    if cp.slot == req.slot {
                        cam_local_tf = Some(*tf);
                        break;
                    }
                }
            }
            let Some(local_tf) = cam_local_tf else {
                let _ = req.tx.send(Vec::new());
                continue;
            };

            // Compute world-space camera transform
            let robot_tf = robot_gtf.compute_transform();
            let cam_world_pos = robot_tf.transform_point(local_tf.translation);
            let look_target = cam_world_pos + robot_tf.forward() * 5.0;
            let cam_transform = Transform::from_translation(cam_world_pos + Vec3::Y * 0.5)
                .looking_at(look_target, Vec3::Y);

            // Create offscreen render target
            let render_image = Image::new_target_texture(
                1280, 720,
                bevy::render::render_resource::TextureFormat::Rgba8Unorm,
                Some(bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb),
            );
            let image_handle = images.add(render_image);

            // Spawn offscreen camera
            let camera_entity = commands.spawn((
                Camera3d::default(),
                Camera {
                    order: -1,
                    clear_color: ClearColorConfig::Custom(Color::srgb(0.2, 0.2, 0.2)),
                    ..default()
                },
                RenderTarget::Image(image_handle.clone().into()),
                cam_transform,
            )).id();

            pending.entries.push(PendingCameraShot {
                frames_remaining: 3, // need extra frame for offscreen render
                tx: req.tx,
                camera_entity,
                image_handle,
            });
        }
    }

    /// Process pending camera snaps: count down, screenshot, then despawn camera in callback.
    fn process_camera_snaps(
        mut commands: Commands,
        mut pending: ResMut<PendingCameraSnaps>,
    ) {
        let mut still_pending = Vec::new();
        for mut entry in pending.entries.drain(..) {
            if entry.frames_remaining > 0 {
                entry.frames_remaining -= 1;
                still_pending.push(entry);
                continue;
            }
            let tx = std::sync::Mutex::new(Some(entry.tx));
            let cam_entity = entry.camera_entity;
            commands
                .spawn(Screenshot::image(entry.image_handle))
                .observe(move |event: On<ScreenshotCaptured>, mut commands: Commands| {
                    if let Some(tx) = tx.lock().unwrap().take() {
                        encode_and_send(event.image.clone(), tx);
                    }
                    commands.entity(cam_entity).despawn();
                });
        }
        pending.entries = still_pending;
    }

    /// Plugin-like setup: call from main to register resources and systems.
    pub fn register(app: &mut App) {
        app.init_resource::<PendingWorldScreenshots>()
            .init_resource::<PendingCameraSnaps>()
            .add_systems(Update, (
                drain_world_screenshot_requests,
                process_world_screenshots,
                drain_camera_snap_requests,
                process_camera_snaps,
            ));
    }
}