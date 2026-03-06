import { useEffect, useRef, useState } from 'react'
import { Card, D, Muted, Row } from 'b44ui'
import type { Sim } from './sim'
import type { LogEntry } from './ai'

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-green-500',
  thinking: 'bg-amber-500 animate-pulse',
  waiting: 'bg-blue-500',
  done: 'bg-gray-500',
}

function StatusBadge({ status }: { status: string }) {
  return <Row gap={2} p={0}>
    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-400'}`} />
    <Muted cn="text-xs font-mono">{status}</Muted>
  </Row>
}

function truncate(s: string, max = 80): string {
  const first = s.split('\n')[0]
  if (first.length <= max) return first
  return first.slice(0, max) + '…'
}

function formatArgs(argsJson: string): string {
  try {
    const obj = JSON.parse(argsJson)
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(', ')
  } catch { return argsJson }
}

function formatResult(result: string): string {
  if (result.startsWith('__WAIT__')) return `wait ${result.slice(8)}s`
  if (result.startsWith('__DONE__')) return `done: ${result.slice(8)}`
  return result
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)

  if (entry.type === 'status') {
    return <div className="flex items-center gap-2 py-0.5 text-xs text-gray-400 font-mono">
      <span className="text-gray-500">⏵</span>
      <span>status → <b>{entry.status}</b></span>
    </div>
  }

  if (entry.type === 'thinking') {
    const short = truncate(entry.content)
    const isLong = entry.content.length > 80 || entry.content.includes('\n')
    return <div className="py-0.5">
      <div className="flex items-start gap-2 text-xs cursor-pointer" onClick={() => isLong && setExpanded(!expanded)}>
        <span className="text-amber-400 mt-px">💭</span>
        <span className="text-gray-200 font-mono">
          {expanded ? <pre className="whitespace-pre-wrap m-0">{entry.content}</pre> : short}
        </span>
        {isLong && <span className="text-gray-500 ml-auto shrink-0">{expanded ? '▾' : '▸'}</span>}
      </div>
    </div>
  }

  if (entry.type === 'tool-call') {
    const argsStr = formatArgs(entry.args)
    const resultStr = formatResult(entry.result)
    const isLong = entry.result.length > 60 || entry.result.includes('\n')
    return <div className="py-0.5">
      <div className="flex items-start gap-2 text-xs cursor-pointer" onClick={() => isLong && setExpanded(!expanded)}>
        <span className="text-purple-400 mt-px">⚡</span>
        <span className="font-mono">
          <span className="text-purple-300">{entry.name}</span>
          <span className="text-gray-400">({argsStr})</span>
          <span className="text-gray-500"> → </span>
          <span className="text-gray-300">{expanded ? '' : truncate(resultStr, 50)}</span>
        </span>
        {isLong && <span className="text-gray-500 ml-auto shrink-0">{expanded ? '▾' : '▸'}</span>}
      </div>
      {expanded && <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap ml-6 mt-0.5">{resultStr}</pre>}
    </div>
  }

  if (entry.type === 'observation') {
    return <div className="py-0.5">
      <div className="flex items-start gap-2 text-xs cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-blue-400 mt-px">👁</span>
        <span className="text-gray-400 font-mono">{expanded ? 'observation' : truncate(entry.content, 60)}</span>
        <span className="text-gray-500 ml-auto shrink-0">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap ml-6 mt-0.5">{entry.content}</pre>}
    </div>
  }

  if (entry.type === 'error') {
    return <div className="flex items-center gap-2 py-0.5 text-xs font-mono text-red-400">
      <span>❌</span>
      <span>{entry.message}</span>
    </div>
  }

  return null
}

export default function AiLog({ simRef }: { simRef: React.MutableRefObject<Sim | null> }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [status, setStatus] = useState<string>('idle')
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

  useEffect(() => {
    const id = setInterval(() => {
      const sim = simRef.current
      if (!sim) return
      const ids = sim.getAgentIds()
      if (ids.length === 0) {
        if (prevLenRef.current !== 0) {
          prevLenRef.current = 0
          setLogs([])
          setStatus('idle')
        }
        return
      }
      const agentId = ids[0] // show first agent
      const agentLogs = sim.getAgentLogs(agentId)
      const agentStatus = sim.getAgentStatus(agentId)
      if (agentLogs.length !== prevLenRef.current) {
        prevLenRef.current = agentLogs.length
        setLogs([...agentLogs])
      }
      if (agentStatus) setStatus(agentStatus)
    }, 400)
    return () => clearInterval(id)
  }, [simRef])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  return <Card p={0} gap={0} cn="bb-ailog">
    <Row p={2}>
      <D cn="text-sm font-semibold" grow>AI Log</D>
      <StatusBadge status={status} />
      <Muted cn="text-xs">{logs.length} entries</Muted>
    </Row>
    <div ref={scrollRef} className="overflow-y-auto px-3 pb-2" style={{ flex: 1, minHeight: 0 }}>
      {logs.length === 0
        ? <Muted cn="text-xs py-4 text-center block">No AI activity yet. Run a script with bk.AI() to see logs.</Muted>
        : logs.map((entry, i) => <LogEntryRow key={i} entry={entry} />)
      }
    </div>
  </Card>
}
