import { Renderer } from './Renderer'
import { World } from './World'
import { AgentManager, type ProviderName } from '../ai'

export class Sim {
  private renderer: Renderer
  private world: World
  private stepCallback: (() => void) | null = null
  agentManager: AgentManager

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
    this.agentManager = new AgentManager()
  }

  get rendererInstance() { return this.renderer.renderer }

  // World delegation
  addRobot() { return this.world.addRobot() }
  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number) { this.world.setMotorSpeed(robotId, side, speed) }
  setNavTarget(robotId: number, x: number, z: number) { this.world.setNavTarget(robotId, x, z) }
  clearNavTarget(robotId: number) { this.world.clearNavTarget(robotId) }
  getNavStatus(robotId: number) { return this.world.getNavStatus(robotId) }
  addCamera(robotId: number) { return this.world.addCamera(robotId) }
  snap(camId = 0) { return this.world.snap(camId) }
  addBurger(x?: number, z?: number) { return this.world.addBurger(x, z) }
  getRobotState(robotId: number) { return this.world.getRobotState(robotId) }
  getWorldState(robotId: number) { return this.world.getWorldState(robotId) }
  setStepCallback(fn: () => void) { this.stepCallback = fn }

  // Agent delegation
  createAgent(robotId: number, camId: number | null, goal: string, model: string, thinkInterval: number, enableVision: boolean) {
    return this.agentManager.createAgent(this, robotId, camId, { goal, model, thinkInterval, enableVision })
  }
  /** Extended createAgent accepting a full config object (from Python bk.AI) */
  createAgentEx(robotId: number, camId: number | null, config: Record<string, unknown>) {
    return this.agentManager.createAgentFromConfig(this, robotId, camId, config)
  }
  async agentStep(agentId: number, dt: number) {
    return this.agentManager.stepAgent(agentId, dt)
  }
  getAgentIds() { return this.agentManager.getAgentIds() }
  getAgentLogs(agentId: number) { return this.agentManager.getAgentLogs(agentId) }
  getAgentStatus(agentId: number) { return this.agentManager.getAgentStatus(agentId) }
  setApiKey(provider: string, key: string) {
    this.agentManager.setApiKey(provider as ProviderName, key)
  }
  getApiKey(provider: string): string {
    return this.agentManager.getApiKey(provider as ProviderName)
  }

  // Renderer delegation
  start() { this.renderer.start() }
  stop() { this.renderer.stop() }
  resize(w: number, h: number) { this.renderer.resize(w, h) }

  reset() {
    this.renderer.stop()
    this.world.reset()
    this.agentManager.reset()
  }

  dispose() {
    this.world.reset()
    this.agentManager.reset()
    this.renderer.dispose()
  }
}
