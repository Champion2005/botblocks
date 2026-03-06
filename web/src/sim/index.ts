import { Renderer } from './Renderer'
import { World } from './World'

export class Sim {
  private renderer: Renderer
  private world: World
  private stepCallback: (() => void) | null = null

  scene!: Renderer['scene']
  camera!: Renderer['camera']

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, dt => {
      this.world.step(dt)
      this.stepCallback?.()
    })
    this.world = new World(this.renderer.scene, this.renderer.renderer)
    this.scene = this.renderer.scene
    this.camera = this.renderer.camera
  }

  get rendererInstance() { return this.renderer.renderer }

  // World delegation
  addRobot() { return this.world.addRobot() }
  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number) { this.world.setMotorSpeed(robotId, side, speed) }
  addCamera(robotId: number) { return this.world.addCamera(robotId) }
  snap(camId = 0) { return this.world.snap(camId) }
  async addBurger(x?: number, z?: number) { return this.world.addBurger(x, z) }
  getRobotState(robotId: number) { return this.world.getRobotState(robotId) }
  setStepCallback(fn: () => void) { this.stepCallback = fn }

  // Renderer delegation
  start() { this.renderer.start() }
  stop() { this.renderer.stop() }
  resize(w: number, h: number) { this.renderer.resize(w, h) }

  reset() {
    this.renderer.stop()
    this.world.reset()
  }

  dispose() {
    this.world.reset()
    this.renderer.dispose()
  }
}
