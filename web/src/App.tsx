import { useState, useEffect, useRef } from 'react';
import CodeEditor from '@uiw/react-textarea-code-editor';
import blockPySource from './block.py?raw';
import init, { mock_http_request } from '../public/sim';
import { WebYOLO } from './webYOLO';

const defaultCode = `import blockbots as bk

simulator = bk.SimWorld()
bot = bk.SimRobot()
yolo = bk.cv.YOLO(url='hf.co/yolo')

camera = bot.set('front', bk.Camera())
turret = bot.set('bottom', bk.Motor())
simulator.add(bot)

while bot.ok():
    box = yolo.find('hot dog', camera.snap())
    v = box.x - 0.5 if box else 0
    turret.set_speed(v)
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
            if(location.href.includes('boratto.ca'))
                await init('https://raw.githubusercontent.com/B44ken/botblock/refs/heads/main/web/public/sim_bg.wasm');
            else await init('/sim_bg.wasm');
            (window as any).wasm_mock_http_request = (method: string, path: string, body: string) => {
                console.log("[mock_http] req:", method, path, body);
                const res = mock_http_request(method, path, body);
                console.log("[mock_http] res:", res);
                return res;
            };
            (window as any).WebYOLO = WebYOLO;
            
            const pyodide = await (window as any).loadPyodide();
            pyodide.FS.mkdir('/home/pyodide/blockbots');
            pyodide.FS.writeFile('/home/pyodide/blockbots/__init__.py', blockPySource);
            pyodideRef.current = pyodide;
            console.log("Pyodide Ready");
        } catch (e: any) {
            console.error(e);
        }
    }
    load();
  }, []);

  useEffect(() => {
    if (run)
        pyodideRef.current?.runPythonAsync(code).catch(console.error);
  }, [run, code]);

  return <>
    <header style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>botblocks</h1> <p className="subtitle">is a very nice robotics platform</p>
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

    <section style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{marginBottom: '0'}}>botblocks API reference</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', fontFamily: 'monospace' }}>
          <code>
            <h3>blockbots.SimWorld</h3>
            # add a robot <br />
            SimWorld.add(robot) 
          </code>
          <code>
            <h3>blockbots.SimRobot</h3>
            # add a part and specify where <br />
            SimRobot.add(Motor(), 'left')
          </code>
          <code>
            <h3>blockbots.Motor</h3>
            # set speed <br />
            Motor.set_speed(1.0)
          </code>
          <code>
            <h3>blockbots.Camera</h3>
            # snap a picture and save <br />
            Camera.snap('savepath.png')
          </code>
          <code>
            <h3>blockbots.cv.YOLO</h3>
            # (down)load a model and run it <br />
            yolo = YOLO(url='hf.co/yolo') <br />
            xywh = y.find(image, 'anything')
          </code>
      </div>
    </section>
  </>
}
