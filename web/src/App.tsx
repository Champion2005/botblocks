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
  const [keyProvider, setKeyProvider] = useState<ProviderName>('openrouter')
  const [keyValue, setKeyValue] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'sim' | 'editor'>('sim')
  const hasAnyKey = ['openai', 'anthropic', 'openrouter'].some(
    p => !!localStorage.getItem('botblocks_apikey_' + p)
  )
  const [activeDemo, setActiveDemo] = useState(hasAnyKey ? 'demo_ai' : 'demo')

  const DEMOS: { key: string; file: string; label: string }[] = [
    { key: 'demo', file: 'demo.py', label: 'Basic' },
    { key: 'demo_ai', file: 'demo_ai.py', label: 'AI' },
    { key: 'demo_custom_ai', file: 'demo_custom_ai.py', label: 'Custom AI' },
  ]

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

  const loadDemo = (key: string) => {
    const demo = DEMOS.find(d => d.key === key)
    if (!demo) return
    setActiveDemo(key)
    fetch(demo.file).then(r => r.text()).then(setCode)
  }

  useEffect(() => {
    const hasKey = ['openai', 'anthropic', 'openrouter'].some(
      p => !!localStorage.getItem('botblocks_apikey_' + p)
    )
    const defaultDemo = hasKey ? 'demo_ai.py' : 'demo.py'
    fetch(defaultDemo).then(r => r.text()).then(setCode)
  }, [])
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
    <div className="bb-hero">
      <Row> <D cn='text-3xl font-bold'> botblocks</D> <Muted cn='text-md'>is a very nice robotics platform</Muted> </Row>

      <Card>
        <Muted cn='text-sm'>
          This is a fork of <a href="https://github.com/B44ken/botblocks" target="_blank" rel="noopener noreferrer" className="underline text-purple-400">B44ken/botblocks</a>.
          {' '}My additions: an <b>AI agent system</b> — robots can be given LLM-powered brains via <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline text-purple-400">OpenRouter</a> that observe the world, reason via tool-calling loops, and act autonomously.
          {' '}Includes built-in tools (navigation, vision, motor control), custom tool support, camera controls in the sim, and a live AI activity log.
          {' '}<a href="https://github.com/Champion2005/botblocks/tree/main/web/docs" target="_blank" rel="noopener noreferrer" className="underline text-purple-400">Read the docs →</a>
        </Muted>
      </Card>

      <Row gap={2} p={0}>
        <Muted>AI Key:</Muted>
        <Select value={keyProvider} onChange={e => loadKey(e.target.value as ProviderName)}>
          {/* <option value="openai">OpenAI</option> */}
          {/* <option value="anthropic">Anthropic</option> */}
          <option value="openrouter">OpenRouter</option>
        </Select>
        <Input type="password" placeholder="sk-..." value={keyValue}
          onChange={e => { setKeyValue(e.target.value); setKeySaved(false) }} grow />
        <Btn sm color={keySaved ? 'blue' : 'purple'} click={saveKey}>{keySaved ? 'saved' : 'save'}</Btn>
      </Row>

      <Card p={0} gap={0} cn="bb-main-card">
        <Row p={2} gap={2}>
          <Btn sm color={activeTab === 'sim' ? 'blue' : undefined}
            ghost={activeTab !== 'sim'} click={() => setActiveTab('sim')}>Simulator</Btn>
          <Btn sm color={activeTab === 'editor' ? 'blue' : undefined}
            ghost={activeTab !== 'editor'} click={() => setActiveTab('editor')}>Editor</Btn>
          <div style={{ flex: 1 }} />
          {activeTab === 'editor' && DEMOS.map(d => (
            <Btn key={d.key} sm color={activeDemo === d.key ? 'blue' : undefined}
              ghost={activeDemo !== d.key} click={() => loadDemo(d.key)}>{d.label}</Btn>
          ))}
          <Btn click={restart} sm color="purple">restart</Btn>
        </Row>
        <div className="bb-tab-content">
          <div style={{ display: activeTab === 'sim' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <SimView simRef={simRef} />
            <AiLog simRef={simRef} />
          </div>
          {activeTab === 'editor' && code !== null && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <Editor value={code} onChange={setCode} />
            </div>
          )}
        </div>
      </Card>
    </div>

    <Md># python api</Md>
    <Grid cols={2}>
      <Col gap={0}> <b>bk.Robot(template)</b> Create a differential-drive robot (e.g. 'SimpleCar'). Use bot.attach(name, component) to add sensors.</Col>
      <Col gap={0}> <b>bk.Camera()</b> 320×240 RGBA camera. Attach with bot.attach('cam', bk.Camera()), snap with bot['cam'].snap().</Col>
      <Col gap={0}> <b>bk.Simulator(objects)</b> Initialize the sim world with a list of robots and objects.</Col>
      <Col gap={0}> <b>bk.Burger(x, z)</b> Spawn a burger target. Random position if omitted. Useful for navigation testing.</Col>
      <Col gap={0}> <b>bk.cv.YOLO()</b> YOLO object detection. Call yolo(frame).find('burger') to locate objects in camera frames.</Col>
      <Col gap={0}> <b>bot.turn(amount)</b> Differential steering. -1.0 (right) to 1.0 (left).</Col>
    </Grid>

    <Md># ai system</Md>
    <Grid cols={2}>
      <Col gap={0}> <b>bk.AI(robot, goal, model, ...)</b> Give a robot an LLM brain. Supports OpenAI, Anthropic, and OpenRouter. Model auto-selects provider.</Col>
      <Col gap={0}> <b>Built-in tools</b> move_to, look, look_image, turn, drive, stop, get_position, wait, done — called autonomously by the LLM.</Col>
      <Col gap={0}> <b>bk.Tool(name, desc, params, handler)</b> Define custom tools the LLM can call. Handler receives a context object with robot state and sim access.</Col>
      <Col gap={0}> <b>Lifecycle hooks</b> on_observe, on_before_step, on_after_think, on_tool_call, on_done, stop_condition — customize agent behavior at each stage.</Col>
      <Col gap={0}> <b>Agent loop</b> observe → think (LLM call) → tool calls → wait/done. Runs on a configurable interval (thinkInterval).</Col>
      <Col gap={0}> <b>Vision mode</b> Enable with enable_vision=True. Agent captures camera frames and sends them to the LLM alongside text observations.</Col>
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
