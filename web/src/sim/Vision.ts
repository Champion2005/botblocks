import * as THREE from 'three'
import { pipeline, RawImage, type ObjectDetectionPipeline } from '@huggingface/transformers'
import { Robot } from './Robot'

const CAM_W = 320, CAM_H = 240
const CAM_OFFSET = { forward: 0.45, height: 0.45 }

type CamEntry = { robotId: number; camera: THREE.PerspectiveCamera }
type Detection = { label: string; score: number; x: number; y: number; w: number; h: number }

export class Vision {
  private cams = new Map<number, CamEntry>()
  private renderTarget = new THREE.WebGLRenderTarget(CAM_W, CAM_H)
  private pixelBuf = new Uint8Array(CAM_W * CAM_H * 4)
  private detector: ObjectDetectionPipeline | null = null
  private loading: Promise<void> | null = null

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

  async initYOLO(model = 'Xenova/yolos-tiny') {
    if (this.detector || this.loading) return
    this.loading = (async () => {
      this.detector = await pipeline('object-detection', model) as ObjectDetectionPipeline
    })()
    await this.loading
  }

  private inferring = false

  runYOLO(img: { width: number; height: number; data: Uint8Array }, callback: (results: Detection[]) => void) {
    if (!this.detector || this.inferring) return
    this.inferring = true
    this.YOLO(img).then(results => {
      this.inferring = false
      callback(results)
    }).catch(() => { this.inferring = false })
  }

  async YOLO(img: { width: number; height: number; data: Uint8Array }): Promise<Detection[]> {
    if (!this.detector) return []

    // WebGL pixel buffer is RGBA bottom-to-top; RawImage expects top-to-bottom RGB
    const flipped = new Uint8ClampedArray(img.width * img.height * 3)
    for (let y = 0; y < img.height; y++) {
      const srcRow = (img.height - 1 - y) * img.width * 4
      const dstRow = y * img.width * 3
      for (let x = 0; x < img.width; x++) {
        flipped[dstRow + x * 3] = img.data[srcRow + x * 4]
        flipped[dstRow + x * 3 + 1] = img.data[srcRow + x * 4 + 1]
        flipped[dstRow + x * 3 + 2] = img.data[srcRow + x * 4 + 2]
      }
    }

    const raw = new RawImage(flipped, img.width, img.height, 3)
    const results = await this.detector(raw, { threshold: 0.5, percentage: true })
    const output = Array.isArray(results) ? results : [results]

    return output.flat().map(d => ({
      label: d.label,
      score: d.score,
      x: (d.box.xmin + d.box.xmax) / 2,
      y: (d.box.ymin + d.box.ymax) / 2,
      w: d.box.xmax - d.box.xmin,
      h: d.box.ymax - d.box.ymin,
    }))
  }

  reset() {
    this.cams.clear()
  }

  dispose() {
    this.renderTarget.dispose()
    this.cams.clear()
    this.detector = null
  }
}
