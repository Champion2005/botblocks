import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Robot } from './Robot'
import { Vision } from './Vision'

const DT_CAP = 0.05

function dispose(obj: THREE.Object3D) {
  obj.traverse((c: any) => {
    if (c.geometry) c.geometry.dispose?.()
    if (c.material)
      Array.isArray(c.material)
        ? c.material.forEach((m: any) => m.dispose?.())
        : c.material.dispose?.()
  })
}

export class World {
  private robots = new Map<number, Robot>()
  private objects = new Map<number, THREE.Object3D>()
  private loader = new GLTFLoader()
  private nextId = 1
  vision = new Vision()

  private renderer: THREE.WebGLRenderer | null = null

  constructor(private scene: THREE.Scene) {}

  setRenderer(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
  }

  addRobot() {
    const id = this.nextId++
    const robot = new Robot(id)
    this.scene.add(robot.group)
    this.robots.set(id, robot)
    return id
  }

  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number) {
    this.robots.get(robotId)?.setMotorSpeed(side, speed)
  }

  addCamera(robotId: number) {
    const id = this.nextId++
    this.vision.addCamera(id, robotId)
    return id
  }

  snap(camId = 0) {
    if (!this.renderer) return undefined
    return this.vision.snap(camId, this.robots, this.renderer, this.scene)
  }

  async initYOLO(model?: string) {
    await this.vision.initYOLO(model)
  }

  async YOLO(img?: any) {
    return this.vision.YOLO(img)
  }

  runYOLO(img: any, callback: (results: any) => void) {
    this.vision.runYOLO(img, callback)
  }

  async addBurger() {
    const x = 4 * Math.random(), z = 4 * Math.random()
    try {
      const gltf = await new Promise<any>((res, rej) =>
        this.loader.load('/burger.glb', res, undefined, rej),
      )
      const node = gltf.scene.clone(true)
      node.scale.setScalar(0.3)
      node.position.set(x, 0, z)
      this.scene.add(node)
      const id = this.nextId++
      this.objects.set(id, node)
      return id
    } catch (e) {
      console.warn('burger load failed', e)
      return undefined
    }
  }

  step(dt: number) {
    const t = Math.min(dt, DT_CAP)
    for (const r of this.robots.values()) r.step(t)
  }

  reset() {
    for (const r of this.robots.values()) {
      this.scene.remove(r.group)
      dispose(r.group)
    }
    for (const obj of this.objects.values()) {
      this.scene.remove(obj)
      dispose(obj)
    }
    this.robots.clear()
    this.objects.clear()
    this.vision.reset()
    this.nextId = 1
  }
}
