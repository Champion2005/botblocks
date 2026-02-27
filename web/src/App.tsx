import { useState, useEffect, useRef } from 'react';
import CodeEditor from '@uiw/react-textarea-code-editor';
import blockPySource from './block.py?raw';
import init, { mock_http_request } from '../public/sim';

const defaultCode = `import block

simulator = block.SimWorld()
bot = block.SimRobot()

left = bot.core.set("left", block.Motor())
right = bot.core.set("right", block.Motor())

simulator.add(bot)

left.set_speed(1.0)
right.set_speed(0.5)
`;

export default function App() {
  const [code, setCode] = useState(defaultCode)
  const [run, setRun] = useState(false)
  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    let initialized = false;
    async function load() {
        if (initialized) return;
        initialized = true;

        try {
            await init('https://raw.githubusercontent.com/B44ken/botblock/refs/heads/main/web/public/sim_bg.wasm');
            (window as any).wasm_mock_http_request = mock_http_request;
            
            const pyodide = await (window as any).loadPyodide();
            pyodide.FS.writeFile('/home/pyodide/block.py', blockPySource);
            pyodideRef.current = pyodide;
            console.log("Pyodide Ready");
        } catch (e: any) {
            console.error(e);
        }
    }
    load();
  }, []);

  useEffect(() => {
    if (run && pyodideRef.current) {
        pyodideRef.current.runPythonAsync(code).catch(console.error);
    }
  }, [run, code]);

  return <>
    <header>
      <h1>botblock</h1> <p className="subtitle">is a very nice robotics platform</p>
    </header>

    <main className="workspace">
      <div className="editor-container">
        <div className="panel-header">
          <div className="dots"> <div /> <div /> <div /> </div>
          <div className="panel-title">bot.py</div>
          <button
            onClick={() => setRun(!run)}
            style={{
              background: run ? '#f44336' : '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 'bold',
            }}
          > {run ? 'Stop' : 'Run'} </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <CodeEditor
            value={code}
            language="python"
            onChange={(e) => setCode(e.target.value)}
            padding={15}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: '14px',
              backgroundColor: 'transparent',
              minHeight: '100%',
            }}
          />
        </div>
      </div>

      <div className="window-container">
        <div className="panel-header">
          <div className="dots"> <div /> <div /> <div /> </div>
          <div className="panel-title">sim renderer</div>
        </div>
        <div className="window-content" style={{ position: 'relative' }}>
          <canvas id="bevy-canvas" style={{ opacity: run ? 1 : 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}></canvas>
        </div>
      </div>
    </main>

    <section style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{marginBottom: '0'}}>botblock API reference</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', fontFamily: 'monospace' }}>
          <code>
            <h3>block.SimWorld</h3>
            # add a robot <br />
            SimWorld.add(robot) 
          </code>
          <code>
            <h3>block.SimRobot</h3>
            # attach a motor: core has left/right slots <br />
            SimRobot.core.set('left', Motor())
          </code>
          <code>
            <h3>block.Motor</h3>
            # set speed <br />
            Motor.set_speed(1.0)
          </code>
          <code>
            <h3>block.Camera</h3>
            # snap a picture and save <br />
            Mamera.snap('savepath.png')
          </code>
      </div>
    </section>
  </>
}
