import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Robot } from './Robot'
import { Vision } from './Vision'

let nextRobotId = 1
let nextCamId = 1
let nextObjId = 1

export interface SceneObject {
  id: number
  type: string
  model: THREE.Object3D
  x: number
  z: number
}

export interface WorldState {
  robot: { x: number; z: number; heading: number; leftMotor: number; rightMotor: number }
  objects: { id: number; type: string; x: number; z: number; distance: number; angle: number }[]
  otherRobots: { id: number; distance: number; angle: number }[]
}

export class World {
  robots = new Map<number, Robot>()
  objects = new Map<number, SceneObject>()
  navTargets = new Map<number, { x: number; z: number }>()
  vision: Vision
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer
    this.vision = new Vision()
  }

  addRobot() {
    const id = nextRobotId++
    const robot = new Robot(id)
    this.robots.set(id, robot)
    this.scene.add(robot.group)
    return id
  }

  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number) {
    this.robots.get(robotId)?.setMotorSpeed(side, speed)
  }

  addCamera(robotId: number) {
    const id = nextCamId++
    this.vision.addCamera(id, robotId)
    return id
  }

  snap(camId: number) {
    return this.vision.snap(camId, this.robots, this.renderer, this.scene)
  }

  addBurger(x = 3, z = 0) {
    const objId = nextObjId++
    // Register object immediately so agents can detect it
    const placeholder = new THREE.Group()
    placeholder.position.set(x, 0, z)
    this.scene.add(placeholder)
    this.objects.set(objId, { id: objId, type: 'burger', model: placeholder, x, z })

    // Load the 3D model asynchronously and swap it in
    const loader = new GLTFLoader()
    loader.loadAsync('burger.glb').then(gltf => {
      const model = gltf.scene
      model.scale.set(0.25, 0.25, 0.25)
      model.position.set(x, 0, z)
      model.traverse(n => { if (n instanceof THREE.Mesh) n.castShadow = true })
      this.scene.remove(placeholder)
      this.scene.add(model)
      const obj = this.objects.get(objId)
      if (obj) obj.model = model
    })
    return objId
  }

  getRobotState(robotId: number) {
    const r = this.robots.get(robotId)
    return r ? { x: r.state.x, z: r.state.z, heading: r.state.heading } : null
  }

  getWorldState(robotId: number): WorldState | null {
    const r = this.robots.get(robotId)
    if (!r) return null
    const { x, z, heading } = r.state

    const objects = [...this.objects.values()].map(obj => {
      const dx = obj.x - x, dz = obj.z - z
      const distance = Math.sqrt(dx * dx + dz * dz)
      let angle = Math.atan2(dz, dx) - heading
      angle = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
      return { id: obj.id, type: obj.type, x: +obj.x.toFixed(2), z: +obj.z.toFixed(2), distance: +distance.toFixed(2), angle: +angle.toFixed(2) }
    })

    const otherRobots = [...this.robots.values()]
      .filter(other => other.state.id !== robotId)
      .map(other => {
        const dx = other.state.x - x, dz = other.state.z - z
        const distance = Math.sqrt(dx * dx + dz * dz)
        let angle = Math.atan2(dz, dx) - heading
        angle = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
        return { id: other.state.id, distance: +distance.toFixed(2), angle: +angle.toFixed(2) }
      })

    return { robot: { x: +x.toFixed(2), z: +z.toFixed(2), heading: +heading.toFixed(2), leftMotor: +r.state.left.toFixed(2), rightMotor: +r.state.right.toFixed(2) }, objects, otherRobots }
  }

  step(dt: number) {
    // Run continuous navigation controllers
    for (const [robotId, target] of this.navTargets) {
      const r = this.robots.get(robotId)
      if (!r) { this.navTargets.delete(robotId); continue }
      const dx = target.x - r.state.x
      const dz = target.z - r.state.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 0.3) {
        r.setMotorSpeed('left', 0)
        r.setMotorSpeed('right', 0)
        this.navTargets.delete(robotId)
        continue
      }
      const targetAngle = Math.atan2(dz, dx)
      let err = targetAngle - r.state.heading
      err = ((err + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

      // Two-phase: rotate in place if angle is large, else drive with proportional steer
      if (Math.abs(err) > 0.4) {
        // Rotate in place
        const turnSpeed = 0.8 * Math.sign(err)
        r.setMotorSpeed('left', -turnSpeed)
        r.setMotorSpeed('right', turnSpeed)
      } else {
        const speed = Math.min(1.5, dist) // slow down when close
        const steer = Math.max(-0.5, Math.min(0.5, err * 1.5))
        r.setMotorSpeed('left', speed * (1 - steer))
        r.setMotorSpeed('right', speed * (1 + steer))
      }
    }
    for (const robot of this.robots.values()) robot.step(dt)
  }

  setNavTarget(robotId: number, x: number, z: number) {
    this.navTargets.set(robotId, { x, z })
  }

  clearNavTarget(robotId: number) {
    this.navTargets.delete(robotId)
    const r = this.robots.get(robotId)
    if (r) { r.setMotorSpeed('left', 0); r.setMotorSpeed('right', 0) }
  }

  getNavStatus(robotId: number): { active: boolean; target?: { x: number; z: number }; distance?: number } {
    const target = this.navTargets.get(robotId)
    if (!target) return { active: false }
    const r = this.robots.get(robotId)
    if (!r) return { active: false }
    const dx = target.x - r.state.x, dz = target.z - r.state.z
    return { active: true, target, distance: Math.sqrt(dx * dx + dz * dz) }
  }

  reset() {
    for (const robot of this.robots.values()) this.scene.remove(robot.group)
    for (const obj of this.objects.values()) this.scene.remove(obj.model)
    this.robots.clear()
    this.objects.clear()
    this.navTargets.clear()
    this.vision.reset()
    nextRobotId = 1
    nextCamId = 1
    nextObjId = 1
  }
}
