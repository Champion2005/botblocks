import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Robot } from './Robot'
import { Vision } from './Vision'

let nextRobotId = 1
let nextCamId = 1

export class World {
  robots = new Map<number, Robot>()
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

  async addBurger() {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync('burger.glb')
    const model = gltf.scene
    model.position.set(3 + Math.random() * 2 - 1, 0, Math.random() * 2 - 1)
    model.traverse(n => { if (n instanceof THREE.Mesh) n.castShadow = true })
    this.scene.add(model)
    return model
  }

  step(dt: number) {
    for (const robot of this.robots.values()) robot.step(dt)
  }

  reset() {
    for (const robot of this.robots.values()) this.scene.remove(robot.group)
    this.robots.clear()
    this.vision.reset()
    nextRobotId = 1
    nextCamId = 1
  }
}
