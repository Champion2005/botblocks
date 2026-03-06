import { useEffect, useRef } from 'react'
import { Sim } from './sim'

export default function SimView({ simRef }: { simRef: React.MutableRefObject<Sim | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    const sim = new Sim(canvas)
    simRef.current = sim
    sim.rendererInstance.render(sim.scene, sim.camera)

    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      canvas.width = width
      canvas.height = height
      sim.resize(width, height)
      sim.rendererInstance.render(sim.scene, sim.camera)
    })
    obs.observe(container)

    return () => {
      obs.disconnect()
      sim.stop()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative' }}>
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    <div style={{
      position: 'absolute',
      bottom: 8,
      right: 8,
      background: 'rgba(0,0,0,0.55)',
      color: '#ddd',
      fontSize: 11,
      padding: '4px 8px',
      borderRadius: 4,
      lineHeight: 1.5,
      pointerEvents: 'none',
      userSelect: 'none',
      fontFamily: 'monospace',
    }}>
      <span style={{ color: '#fff', fontWeight: 600 }}>Camera:</span>{' '}
      Left-click drag: rotate · W/S fwd/back · A/D left/right · Q/E down/up
    </div>
  </div>
}
