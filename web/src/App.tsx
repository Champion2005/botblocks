import { useEffect, useRef, useState } from 'react'
import { App, Btn, Card, Col, Grid, Md, Muted, Row } from 'b44ui'
import { loadPyodide } from 'pyodide'
import { setupPyodideFiles } from 'virtual:pyodide-files'
import Editor from './Editor'
import SimView from './SimView'
import { Sim } from './sim'

let raf: number | null = null
let loopGeneration = 0
function stopLoop() {
  loopGeneration += 1
  if(raf !== null) window.cancelAnimationFrame(raf)
  raf = null
}

function crashOnPythonError(stage: string, err: unknown): never {
  const error = err instanceof Error ? err : new Error(String(err))
  console.error(`[demo] python error during ${stage}`, error)
  stopLoop()
  window.setTimeout(() => { throw error }, 0)
  throw error
}

export default () => {
  const [code, setCode] = useState<string | null>(null)
  const simRef = useRef<Sim | null>(null)

  useEffect(() => { fetch('demo.py').then(r => r.text()).then(setCode) }, [])
  useEffect(() => () => stopLoop(), [])

  const restart = async () => {
    if (!simRef.current || !code) return
    stopLoop()
    simRef.current.stop()
    simRef.current.reset()

    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/npm/pyodide@0.29.3/' })
    await setupPyodideFiles(pyodide)
    await pyodide.runPythonAsync("import sys\nif './public' not in sys.path:\n    sys.path.insert(0, './public')")
    pyodide.registerJsModule('_bridge', simRef.current)
    await pyodide.runPythonAsync(code).catch(err => crashOnPythonError('boot', err))

    const frame = async () => {
      await pyodide.runPythonAsync('loop()')
        .catch(err => crashOnPythonError('loop()', err))
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
  }
  return <App width={1000}>
    <Row align="start"> <Md># botblocks</Md> <Muted>is a very nice robotics platform</Muted> </Row>

    <Grid cols={2} gap={4}>
      <Card p={0} gap={0}>
        <Row p={2}> <Muted grow>bot.py</Muted> <Btn click={restart} sm color="purple">restart</Btn> </Row>
        {code !== null && <Editor value={code} onChange={setCode} />}
      </Card>

      <Card p={0} gap={0}>
        <Row p={2}> <Muted grow>simulator</Muted> <Btn sm ghost>&nbsp;</Btn> </Row>
        <SimView simRef={simRef} />
      </Card>
    </Grid>

    <Grid cols={2}> {/* todo add api overview */}
      <Col>bk.SimWorld</Col> <Col>bk.SimRobot</Col> <Col>bk.Motor</Col>  <Col>bk.Camera</Col> <Col>bk.cv.YOLO</Col>
    </Grid>
  </App>
}
