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
            await init('/sim_bg.wasm');
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

    <section style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem', color: '#aaa', fontFamily: 'sans-serif', lineHeight: '1.5' }}>
      <h2 style={{ color: '#eee', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>BotBlock API Reference</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}><code>SimWorld</code></h3>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>The main simulation environment.</p>
           <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
              <li style={{ marginBottom: '0.3rem' }}><code>simulator.add(robot)</code><br/>Adds a <code>SimRobot</code> instance to the active world.</li>
           </ul>
        </div>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}><code>SimRobot</code></h3>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>A simulated robot chassis.</p>
           <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
              <li style={{ marginBottom: '0.3rem' }}><code>bot.core.set(slot, part)</code><br/>Attaches a part to the chassis. Valid slots currently include <code>"left"</code> and <code>"right"</code> for the drive wheels. Returns the attached part.</li>
           </ul>
        </div>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}><code>Motor</code></h3>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>A drive motor.</p>
           <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
              <li style={{ marginBottom: '0.3rem' }}><code>motor.set_speed(speed: float)</code><br/>Sets motor target speed (-1.0 to 1.0).</li>
              <li style={{ marginBottom: '0.3rem' }}><code>motor.stop()</code><br/>Immediately stops the motor (sets speed to 0).</li>
           </ul>
        </div>
      </div>
    </section>
  </>
}
