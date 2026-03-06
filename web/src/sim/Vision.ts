import * as THREE from 'three'
import { Robot } from './Robot'

const CAM_W = 320, CAM_H = 240
const CAM_OFFSET = { forward: 0.45, height: 0.45 }

type CamEntry = { robotId: number; camera: THREE.PerspectiveCamera }

export class Vision {
  private cams = new Map<number, CamEntry>()
  private renderTarget = new THREE.WebGLRenderTarget(CAM_W, CAM_H)
  private pixelBuf = new Uint8Array(CAM_W * CAM_H * 4)

  addCamera(camId: number, robotId: number) {
    const camera = new THREE.PerspectiveCamera(60, CAM_W / CAM_H, 0.1, 50)
    this.cams.set(camId, { robotId, camera })
  }

  snap(
    camId: number,
    robots: Map<number, Robot>,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ): { width: number; height: number; data: Uint8Array } | undefined {
    const entry = this.cams.get(camId)
    if (!entry) return undefined

    const robot = robots.get(entry.robotId)
    if (!robot) return undefined

    const s = robot.state
    const cam = entry.camera
    cam.position.set(
      s.x + CAM_OFFSET.forward * Math.cos(s.heading),
      CAM_OFFSET.height,
      s.z + CAM_OFFSET.forward * Math.sin(s.heading),
    )
    cam.lookAt(
      s.x + 2 * Math.cos(s.heading),
      CAM_OFFSET.height * 0.8,
      s.z + 2 * Math.sin(s.heading),
    )

    renderer.setRenderTarget(this.renderTarget)
    renderer.render(scene, cam)
    renderer.setRenderTarget(null)

    renderer.readRenderTargetPixels(this.renderTarget, 0, 0, CAM_W, CAM_H, this.pixelBuf)
    return { width: CAM_W, height: CAM_H, data: new Uint8Array(this.pixelBuf) }
  }

  reset() {
    this.cams.clear()
  }

  dispose() {
    this.renderTarget.dispose()
    this.cams.clear()
  }
}
