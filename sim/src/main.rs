mod server;

use bevy::prelude::*;
use server::SharedState;

/// Marker component identifying a robot entity.
#[derive(Component)]
struct Robot {
    id: String,
}

/// Motor component (attached to the robot entity).
#[derive(Component)]
struct Motors {
    left: f32,
    right: f32,
}

#[bevy_main]
fn main() {
    let state = SharedState::default();
    
    #[cfg(not(target_arch = "wasm32"))]
    server::http::start_server(state.clone());

    #[cfg(target_arch = "wasm32")]
    server::wasm::init_wasm_state(state.clone());

    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            // we probably want to attach to a specific canvas on web
            canvas: Some("#bevy-canvas".into()),
            fit_canvas_to_parent: true,
            ..default()
        }),
        ..default()
    }))
    .insert_resource(state)
    .init_resource::<PendingParts>()
    .init_resource::<PendingMotorCmds>()
    .add_systems(Startup, setup_scene)
    .add_systems(Update, (process_spawns, process_part_attachments, process_motor_cmds, drive_robots));

    #[cfg(not(target_arch = "wasm32"))]
    screenshot::register(&mut app);

    app.run();
}

/// Set up ground plane, light, and spectator camera.
fn setup_scene(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // ground
    commands.spawn((
        Mesh3d(meshes.add(Circle::new(20.0))),
        MeshMaterial3d(materials.add(Color::srgb(0.55, 0.62, 0.7))),
        Transform::from_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2)),
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
}

/// Drain spawn commands from the HTTP queue and spawn robot entities.
fn process_spawns(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    state: Res<SharedState>,
) {
    let spawns: Vec<_> = {
        let mut q = state.queue.lock().unwrap();
        q.spawns.drain(..).collect()
    };
    for spawn in spawns {
        println!("Spawning robot: {}", spawn.id);
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(1.0, 0.5, 1.5))),
            MeshMaterial3d(materials.add(Color::srgb(0.9, 0.9, 0.92))),
            Transform::from_xyz(0.0, 0.25, 0.0),
            Robot { id: spawn.id },
            Motors { left: 0.0, right: 0.0 },
        ));
    }
}

/// Buffered part attachments waiting for their robot to spawn.
#[derive(Resource, Default)]
struct PendingParts(Vec<(server::PartAttachment, u32)>);

const PART_ATTACH_TIMEOUT_FRAMES: u32 = 300; // ~5 seconds at 60fps

/// Drain part attachments and spawn child meshes on the robot.
fn process_part_attachments(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    state: Res<SharedState>,
    robots: Query<(Entity, &Robot)>,
    mut pending: ResMut<PendingParts>,
) {
    {
        let mut q = state.queue.lock().unwrap();
        for p in q.part_attachments.drain(..) {
            pending.0.push((p, 0));
        }
    }
    let mut still_pending = Vec::new();
    for (part, age) in pending.0.drain(..) {
        if age >= PART_ATTACH_TIMEOUT_FRAMES {
            eprintln!("Part attachment timed out: robot={} slot={}", part.robot_id, part.slot);
            continue;
        }
        let Some((entity, _)) = robots.iter().find(|(_, r)| r.id == part.robot_id) else {
            still_pending.push((part, age + 1));
            continue;
        };
        let (mesh, material, offset, rotation) = match (part.part_type.as_str(), part.slot.as_str()) {
            ("Motor", "left") => (
                meshes.add(Cylinder::new(0.2, 0.3)),
                materials.add(Color::srgb(0.85, 0.35, 0.15)),
                Vec3::new(-0.65, 0.0, 0.0),
                Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
            ),
            ("Motor", "right") => (
                meshes.add(Cylinder::new(0.2, 0.3)),
                materials.add(Color::srgb(0.85, 0.35, 0.15)),
                Vec3::new(0.65, 0.0, 0.0),
                Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
            ),
            ("Camera", _) => (
                meshes.add(Cuboid::new(0.25, 0.2, 0.2)),
                materials.add(Color::srgb(0.15, 0.15, 0.18)),
                Vec3::new(0.0, 0.35, -0.85),
                Quat::IDENTITY,
            ),
            _ => continue,
        };
        let is_camera = part.part_type == "Camera";
        let slot_name = part.slot.clone();
        let mut child_cmd = commands.spawn((
            Mesh3d(mesh),
            MeshMaterial3d(material),
            Transform::from_translation(offset).with_rotation(rotation),
        ));
        #[cfg(not(target_arch = "wasm32"))]
        if is_camera {
            child_cmd.insert(screenshot::CameraPart { slot: slot_name });
        }
        let child = child_cmd.id();
        commands.entity(entity).add_child(child);
    }
    pending.0 = still_pending;
}

/// Buffered motor commands waiting for their robot to spawn.
#[derive(Resource, Default)]
struct PendingMotorCmds(Vec<(server::MotorCommand, u32)>);

/// Drain motor commands and apply them to the matching robot.
fn process_motor_cmds(
    state: Res<SharedState>, 
    mut query: Query<(&Robot, &mut Motors)>,
    mut pending: ResMut<PendingMotorCmds>,
) {
    {
        let mut q = state.queue.lock().unwrap();
        for cmd in q.motor_cmds.drain(..) {
            pending.0.push((cmd, 0));
        }
    }
    let mut still_pending = Vec::new();
    for (cmd, age) in pending.0.drain(..) {
        if age >= PART_ATTACH_TIMEOUT_FRAMES {
            bevy::log::warn!("Motor command timed out for unknown robot: {}", cmd.robot_id);
            continue;
        }
        let mut found = false;
        for (robot, mut motors) in &mut query {
            if robot.id == cmd.robot_id {
                match cmd.slot.as_str() {
                    "left" => motors.left = cmd.speed,
                    "right" => motors.right = cmd.speed,
                    _ => {}
                }
                found = true;
            }
        }
        if !found {
            still_pending.push((cmd, age + 1));
        }
    }
    pending.0 = still_pending;
}

/// Simple differential drive: two motors → forward speed + turning.
fn drive_robots(time: Res<Time>, mut query: Query<(&Motors, &mut Transform)>) {
    for (motors, mut tf) in &mut query {
        let forward = (motors.left + motors.right) / 2.0;
        let turn = (motors.right - motors.left) * 1.5;

        let dt = time.delta_secs();
        tf.rotate_y(turn * dt);
        let dir = tf.forward();
        tf.translation += dir * forward * 3.0 * dt;
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
    pub struct CameraPart {
        pub slot: String,
    }

    /// Queued world screenshot requests waiting for a frame to render.
    #[derive(Resource, Default)]
    struct PendingWorldScreenshots {
        entries: Vec<PendingShot>,
    }

    struct PendingShot {
        frames_remaining: u32,
        tx: tokio::sync::oneshot::Sender<Vec<u8>>,
    }

    /// Queued camera snap requests waiting for their offscreen render.
    #[derive(Resource, Default)]
    struct PendingCameraSnaps {
        entries: Vec<PendingCameraShot>,
    }

    struct PendingCameraShot {
        frames_remaining: u32,
        tx: tokio::sync::oneshot::Sender<Vec<u8>>,
        camera_entity: Entity,
        image_handle: Handle<Image>,
    }

    fn encode_and_send(image: Image, tx: tokio::sync::oneshot::Sender<Vec<u8>>) {
        let pool = AsyncComputeTaskPool::get();
        pool.spawn(async move {
            match image.try_into_dynamic() {
                Ok(dyn_img) => {
                    let mut buf = std::io::Cursor::new(Vec::new());
                    if dyn_img
                        .write_to(&mut buf, image::ImageFormat::Png)
                        .is_ok()
                    {
                        let _ = tx.send(buf.into_inner());
                    }
                }
                Err(e) => {
                    eprintln!("Screenshot encode error: {e:?}");
                }
            }
        })
        .detach();
    }

    /// Drain world screenshot requests from shared state.
    fn drain_world_screenshot_requests(
        state: Res<SharedState>,
        mut pending: ResMut<PendingWorldScreenshots>,
    ) {
        let txs: Vec<_> = state.screenshot_tx.lock().unwrap().drain(..).collect();
        for tx in txs {
            pending.entries.push(PendingShot {
                frames_remaining: 2,
                tx,
            });
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

    /// Process pending camera snaps: count down, capture offscreen, despawn camera.
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
                .observe(move |event: On<ScreenshotCaptured>| {
                    let Some(tx) = tx.lock().unwrap().take() else { return };
                    encode_and_send(event.image.clone(), tx);
                });
            commands.entity(cam_entity).despawn();
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