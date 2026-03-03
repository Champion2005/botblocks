import * as THREE from 'three'

const GROUND = 20

export class Renderer {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  private running = false
  private lastTime = 0
  private onStep: (dt: number) => void

  constructor(canvas: HTMLCanvasElement, onStep: (dt: number) => void) {
    this.onStep = onStep

    this.scene.background = new THREE.Color(0xbcc6cc)
    this.camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
    this.camera.position.set(0, 5, 6)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = true

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND, GROUND),
      new THREE.MeshStandardMaterial({ color: 0x9ca8b0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    this.scene.add(new THREE.GridHelper(GROUND, GROUND, 0x889098, 0x889098))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(5, 10, 7)
    sun.castShadow = true
    this.scene.add(sun)
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = () => {
      if (!this.running) return
      const now = performance.now()
      this.onStep((now - this.lastTime) / 1000)
      this.lastTime = now
      this.renderer.render(this.scene, this.camera)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.renderer.dispose()
  }
}
