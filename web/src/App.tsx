import { useEffect, useRef, useState } from 'react'
import { App, Btn, Card, Col, D, Grid, Input, Md, Muted, Row, Select } from 'b44ui'
import type { ProviderName } from './ai'
import { loadPyodide } from 'pyodide'
import { setupPyodideFiles } from 'virtual:pyodide-files'
import Editor from './Editor'
import SimView from './SimView'
import AiLog from './AiLog'
import { Sim } from './sim'

let raf: number | null = null
let loopGeneration = 0
function stopLoop() {
  loopGeneration += 1
  if (raf !== null) window.cancelAnimationFrame(raf)
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
  const restartRef = useRef<() => void>(() => { })
  const [keyProvider, setKeyProvider] = useState<ProviderName>('openai')
  const [keyValue, setKeyValue] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)

  const saveKey = () => {
    if (!simRef.current) return
    simRef.current.setApiKey(keyProvider, keyValue)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 1500)
  }
  const loadKey = (p: ProviderName) => {
    setKeyProvider(p)
    setKeyValue(simRef.current?.getApiKey(p) ?? localStorage.getItem('botblocks_apikey_' + p) ?? '')
    setKeySaved(false)
  }

  useEffect(() => { fetch('demo_ai.py').then(r => r.text()).then(setCode) }, [])
  useEffect(() => () => stopLoop(), [])
  useEffect(() => { if (code && simRef.current) restartRef.current() }, [code])

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
  restartRef.current = restart
  return <App width={1200}>
    <Row> <D cn='text-3xl font-bold'> botblocks</D> <Muted cn='text-md'>is a very nice robotics platform</Muted> </Row>

    <Row gap={2} p={0}>
      <Muted>AI Key:</Muted>
      <Select value={keyProvider} onChange={e => loadKey(e.target.value as ProviderName)}>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="openrouter">OpenRouter</option>
      </Select>
      <Input type="password" placeholder="sk-..." value={keyValue}
        onChange={e => { setKeyValue(e.target.value); setKeySaved(false) }} grow />
      <Btn sm color={keySaved ? 'blue' : 'purple'} click={saveKey}>{keySaved ? 'saved' : 'save'}</Btn>
    </Row>

    <div className="bb-layout">
      {/* Editor panel — collapsible, 1/3 width */}
      <div className={`bb-editor-panel ${editorOpen ? 'bb-editor-open' : 'bb-editor-collapsed'}`}>
        <Card p={0} gap={0} cn="h-full">
          <Row p={2}>
            <Btn sm ghost click={() => setEditorOpen(!editorOpen)}>
              {editorOpen ? '▾' : '▸'}
            </Btn>
            <Muted grow>bot.py</Muted>
            <Btn click={restart} sm color="purple">restart</Btn>
          </Row>
          {editorOpen && code !== null && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <Editor value={code} onChange={setCode} />
            </div>
          )}
        </Card>
      </div>

      {/* Simulation panel — takes remaining space */}
      <div className="bb-sim-panel">
        <Card p={0} gap={0}>
          <Row p={2}> <Muted grow>simulator</Muted> </Row>
          <SimView simRef={simRef} />
          <AiLog simRef={simRef} />
        </Card>
      </div>
    </div>

    <Md># overview</Md>
    <Grid cols={2}> {/* todo add api overview */}
      <Col gap={0}> <b>bk.SimWorld(objects)</b> The simulator. Takes in objects, or use SimWorld.add(object)</Col>
      <Col gap={0}> <b>bk.SimRobot(template)</b> Define an extensible robot, optionally from a template. </Col>
      <Col gap={0}> <b>bk.Motor(robot, name)</b> Basic motor block.</Col>
      <Col gap={0}> <b>bk.Camera(robot)</b> Basic camera block.</Col>
      <Col gap={0}> <b>bk.cv.YOLO(frame)</b> YOLO is an object detection model, one of many supported.</Col>
      <Col gap={0}> <b>bk.Burger(x, y)</b> Place a burger somewhere for testing, random by default.</Col>
      <Col gap={0}> <b>bk.AI(robot, goal)</b> Give a robot an LLM brain. Supports OpenAI, Anthropic, and OpenRouter models.</Col>
    </Grid>

    <Md>
      {`# but why?
- \\- other robotics platforms (like ROS...) are annoying to set up
- \\- many researchers avoid simulation entierly because it's too much of a hassle
- \\- there's little standardization: no guarantee your sim robot will even work in real life
- \\- modern features like AI should be first-class citizens
- \\- clearly, we need a platform to make this stuff easy, while offering standard blocks for common tasks...`}
    </Md>
  </App>
}
