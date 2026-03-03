import { useEffect, useRef, useState } from 'react'
import { App, Btn, Card, Col, Grid, Md, Muted, Row } from 'b44ui'
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript'
import Editor from './Editor'
import SimView from './SimView'
import { Sim } from './sim'

let mpPromise: ReturnType<typeof loadMicroPython> | null = null
function getMicroPython() {
  if (!mpPromise) mpPromise = loadMicroPython({ url: '/micropython.wasm' })
  return mpPromise
}

function makeBridge(sim: Sim) {
  return {
    addRobot: () => sim.addRobot(),
    addBurger: () => sim.addBurger(),
    addCamera: (robotId: number) => sim.addCamera(robotId),
    setMotorSpeed: (robotId: number, side: 'left' | 'right', speed: number) => sim.setMotorSpeed(robotId, side, speed),
    snap: (camId: number) => sim.snap(camId),
    initYOLO: (model?: string) => sim.initYOLO(model),
    runYOLO: (img: any, cb: any) => sim.runYOLO(img, cb),
    start: () => sim.start(),
    stop: () => sim.stop(),
    ok: () => new Promise<boolean>(r => setTimeout(() => r(true), 0)),
  }
}

export default () => {
  const [code, setCode] = useState<string | null>(null)
  const simRef = useRef<Sim | null>(null)

  useEffect(() => { fetch('demo.py').then(r => r.text()).then(setCode) }, [])

  const restart = async () => {
    if (!simRef.current || !code) return
    simRef.current.stop()
    simRef.current.reset()

    const mp = await getMicroPython()
    const bridge = makeBridge(simRef.current)

    mp.registerJsModule('_bridge', bridge)

    const botblocks = await fetch('/botblocks.py').then(r => r.text())
    try { mp.FS.mkdir('/lib') } catch {}
    mp.FS.writeFile('/lib/botblocks.py', botblocks)

    await mp.runPythonAsync(code).catch((err: any) => console.error(err))
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
