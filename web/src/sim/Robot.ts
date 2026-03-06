import * as THREE from 'three'

const WHEEL_R = 0.15
const ROBOT_SZ = { w: 0.8, h: 0.3, d: 0.5 }

export type RobotState = {
  id: number
  left: number
  right: number
  heading: number
  x: number
  z: number
}

export function makeRobotGroup() {
  const g = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(ROBOT_SZ.w, ROBOT_SZ.h, ROBOT_SZ.d),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }),
  )
  body.position.y = ROBOT_SZ.h
  body.castShadow = true
  g.add(body)

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.08, 12)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xe87020 })
  for (const z of [0.3, -0.3]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.z = Math.PI / 2
    w.rotation.y = Math.PI / 2  
    w.position.set(0.15, 0.15, z)
    g.add(w)
  }

  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4488cc }),
  )
  front.position.set(ROBOT_SZ.w / 2, ROBOT_SZ.h + 0.05, 0)
  g.add(front)

  return g
}

export class Robot {
  state: RobotState
  group: THREE.Group

  constructor(id: number) {
    this.group = makeRobotGroup()
    this.state = { id, left: 0, right: 0, heading: 0, x: 0, z: 0 }
  }

  setMotorSpeed(side: 'left' | 'right', speed: number) {
    if (side === 'left') this.state.left = speed
    else this.state.right = speed
  }

  step(dt: number) {
    const s = this.state
    const v = (s.left + s.right) / 2
    const omega = s.right - s.left
    s.heading += omega * dt
    // Normalize heading to [-π, π]
    s.heading = ((s.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
    s.x += v * Math.cos(s.heading) * dt
    s.z += v * Math.sin(s.heading) * dt
    this.group.position.set(s.x, 0, s.z)
    this.group.rotation.y = -s.heading
  }
}
