import * as THREE from 'three'

const GROUND = 20
const MOVE_SPEED = 5 // units per second
const MOUSE_SENSITIVITY = 0.003 // radians per pixel

export class Renderer {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  private running = false
  private lastTime = 0
  private onStep: (dt: number) => void
  private keys = new Set<string>()
  private canvas: HTMLCanvasElement
  private dragging = false
  private euler = new THREE.Euler(0, 0, 0, 'YXZ') // yaw-pitch order

  constructor(canvas: HTMLCanvasElement, onStep: (dt: number) => void) {
    this.onStep = onStep
    this.canvas = canvas

    this.scene.background = new THREE.Color(0xbcc6cc)
    this.camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
    this.camera.position.set(0, 5, 6)
    this.camera.lookAt(0, 0, 0)
    // Initialize euler from current camera orientation
    this.euler.setFromQuaternion(this.camera.quaternion)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = true

    canvas.tabIndex = 0
    canvas.style.outline = 'none'
    canvas.addEventListener('keydown', this.onKeyDown)
    canvas.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('blur', this.onBlur)
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('mouseleave', this.onMouseUp)
    canvas.addEventListener('contextmenu', e => e.preventDefault())

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

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase())
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
  }
  private onBlur = () => {
    this.keys.clear()
    this.dragging = false
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) { // left click
      this.dragging = true
      this.keys.add('__mouse__')
    }
  }
  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return
    this.euler.y -= e.movementX * MOUSE_SENSITIVITY
    this.euler.x -= e.movementY * MOUSE_SENSITIVITY
    // Clamp pitch to avoid flipping
    this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x))
    this.camera.quaternion.setFromEuler(this.euler)
  }
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.dragging = false
      this.keys.delete('__mouse__')
    }
  }

  private updateCamera(dt: number) {
    const dist = MOVE_SPEED * dt
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    if (this.keys.has('w')) this.camera.position.addScaledVector(forward, dist)
    if (this.keys.has('s')) this.camera.position.addScaledVector(forward, -dist)
    if (this.keys.has('a')) this.camera.position.addScaledVector(right, -dist)
    if (this.keys.has('d')) this.camera.position.addScaledVector(right, dist)
    if (this.keys.has('e')) this.camera.position.y += dist
    if (this.keys.has('q')) this.camera.position.y -= dist
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = () => {
      if (!this.running) return
      const now = performance.now()
      const dt = (now - this.lastTime) / 1000
      this.onStep(dt)
      this.updateCamera(dt)
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
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    this.canvas.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('blur', this.onBlur)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseup', this.onMouseUp)
    this.canvas.removeEventListener('mouseleave', this.onMouseUp)
    this.renderer.dispose()
  }
}
