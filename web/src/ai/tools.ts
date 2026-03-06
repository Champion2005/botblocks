import type { Sim } from '../sim'
import type { ToolDef } from './providers'

export interface AgentTool {
  def: ToolDef
  execute(args: Record<string, unknown>, sim: Sim, robotId: number, camId: number | null): string
}

/** A custom tool defined in Python, callable via a JS proxy callback. */
export interface CustomToolDef {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
  /** JS-callable proxy function: (contextObj, argsObj) => string | object */
  handler: (ctx: Record<string, unknown>, args: Record<string, unknown>) => unknown
}

function formatWorldState(sim: Sim, robotId: number): string {
  const ws = sim.getWorldState(robotId)
  if (!ws) return 'Error: robot not found'
  const { leftMotor, rightMotor } = ws.robot
  const speed = (leftMotor + rightMotor) / 2
  const moving = Math.abs(leftMotor) > 0.01 || Math.abs(rightMotor) > 0.01
  const nav = sim.getNavStatus(robotId)
  let motionDesc: string
  if (nav.active) {
    motionDesc = `Navigating to (${nav.target!.x}, ${nav.target!.z}), ${nav.distance!.toFixed(2)}m remaining`
  } else if (moving) {
    motionDesc = `Moving (motors: left=${leftMotor}, right=${rightMotor})`
  } else {
    motionDesc = 'Stopped'
  }
  const lines: string[] = [
    `Your position: x=${ws.robot.x}, z=${ws.robot.z}, heading=${ws.robot.heading} rad`,
    `Motion: ${motionDesc}`,
  ]
  if (ws.objects.length === 0) lines.push('No objects detected nearby.')
  for (const obj of ws.objects) {
    const dir = obj.angle > 0.1 ? 'to your left' : obj.angle < -0.1 ? 'to your right' : 'straight ahead'
    lines.push(`${obj.type} (id=${obj.id}): position=(${obj.x}, ${obj.z}), distance=${obj.distance}m, angle=${obj.angle} rad (${dir})`)
  }
  for (const r of ws.otherRobots) {
    const dir = r.angle > 0.1 ? 'to your left' : r.angle < -0.1 ? 'to your right' : 'straight ahead'
    lines.push(`robot (id=${r.id}): distance=${r.distance}m, angle=${r.angle} rad (${dir})`)
  }
  return lines.join('\n')
}

export const BUILTIN_TOOLS: AgentTool[] = [
  {
    def: {
      name: 'move_to',
      description: 'Navigate the robot to a target (x, z) coordinate using continuous autopilot. The robot will steer itself automatically each frame until it arrives within 0.3m, then stop. Returns immediately with an ETA. The agent will wait automatically. Call "look" afterward to check progress.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate' },
          z: { type: 'number', description: 'Target Z coordinate' },
        },
        required: ['x', 'z'],
      },
    },
    execute(args, sim, robotId) {
      const state = sim.getRobotState(robotId)
      if (!state) return 'Error: robot not found'
      const tx = Number(args.x) || 0
      const tz = Number(args.z) || 0
      const dx = tx - state.x
      const dz = tz - state.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist < 0.3) {
        return `Already at target! Distance: ${dist.toFixed(2)}m.`
      }

      sim.setNavTarget(robotId, tx, tz)
      const eta = Math.ceil(dist / 1.2) + 1 // rough ETA with margin
      return `__WAIT__${eta}`
    },
  },
  {
    def: {
      name: 'look',
      description: 'Observe the world. Returns your position, heading, and all visible objects with their distance and relative angle.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    execute(_args, sim, robotId) {
      return formatWorldState(sim, robotId)
    },
  },
  {
    def: {
      name: 'look_image',
      description: 'Capture a camera image from the robot\'s perspective. Returns a description noting the image is attached. Only available when vision is enabled.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    execute(_args, sim, _robotId, camId) {
      if (camId == null) return 'Error: no camera attached to this robot'
      const frame = sim.snap(camId)
      if (!frame) return 'Error: camera capture failed'
      return '__IMAGE_ATTACHED__'
    },
  },
  {
    def: {
      name: 'turn',
      description: 'Turn the robot. Positive amount turns left, negative turns right. Range: -1.0 to 1.0. The robot will keep turning at this rate until you change it.',
      parameters: {
        type: 'object',
        properties: { amount: { type: 'number', description: 'Turn amount from -1.0 (hard right) to 1.0 (hard left)' } },
        required: ['amount'],
      },
    },
    execute(args, sim, robotId) {
      const amount = Number(args.amount) || 0
      const clamped = Math.max(-1, Math.min(1, amount))
      sim.setMotorSpeed(robotId, 'left', 1.0 - clamped)
      sim.setMotorSpeed(robotId, 'right', 1.0 + clamped)
      return `Turning with amount=${clamped}. Robot will continue turning until next command.`
    },
  },
  {
    def: {
      name: 'drive',
      description: 'Set left and right motor speeds directly. Each value ranges from -2.0 to 2.0. Positive = forward.',
      parameters: {
        type: 'object',
        properties: {
          left: { type: 'number', description: 'Left motor speed (-2.0 to 2.0)' },
          right: { type: 'number', description: 'Right motor speed (-2.0 to 2.0)' },
        },
        required: ['left', 'right'],
      },
    },
    execute(args, sim, robotId) {
      const left = Math.max(-2, Math.min(2, Number(args.left) || 0))
      const right = Math.max(-2, Math.min(2, Number(args.right) || 0))
      sim.setMotorSpeed(robotId, 'left', left)
      sim.setMotorSpeed(robotId, 'right', right)
      return `Motors set: left=${left}, right=${right}`
    },
  },
  {
    def: {
      name: 'stop',
      description: 'Stop the robot by setting both motors to 0.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    execute(_args, sim, robotId) {
      sim.setMotorSpeed(robotId, 'left', 0)
      sim.setMotorSpeed(robotId, 'right', 0)
      return 'Robot stopped.'
    },
  },
  {
    def: {
      name: 'get_position',
      description: 'Get the robot\'s current position (x, z) and heading in radians.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    execute(_args, sim, robotId) {
      const s = sim.getRobotState(robotId)
      if (!s) return 'Error: robot not found'
      return `x=${s.x.toFixed(2)}, z=${s.z.toFixed(2)}, heading=${s.heading.toFixed(2)} rad`
    },
  },
  {
    def: {
      name: 'wait',
      description: 'Do nothing for a number of seconds. The robot continues its current motion during this time.',
      parameters: {
        type: 'object',
        properties: { seconds: { type: 'number', description: 'How many seconds to wait (0.5 to 10)' } },
        required: ['seconds'],
      },
    },
    execute(args) {
      const seconds = Math.max(0.5, Math.min(10, Number(args.seconds) || 1))
      return `__WAIT__${seconds}`
    },
  },
  {
    def: {
      name: 'done',
      description: 'Call this when the goal has been achieved. The agent will stop thinking.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Why you believe the goal is achieved' } },
        required: ['reason'],
      },
    },
    execute(args) {
      return `__DONE__${args.reason ?? 'Goal achieved'}`
    },
  },
]
