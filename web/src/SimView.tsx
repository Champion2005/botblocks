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

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }}>
    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
  </div>
}
