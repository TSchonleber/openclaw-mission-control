import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import heroConsole from './assets/hero-console.jpg'
import heroHall from './assets/hero-hall.jpg'
import CommandLogPanel from './components/CommandLogPanel'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
const fallbackPort = protocol === 'wss' ? 443 : 8000
const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const port = import.meta.env.VITE_WS_PORT || (window.location.protocol === 'https:' ? 443 : 8000)
  const url = new URL(window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.port = import.meta.env.VITE_WS_PORT || url.port || port
  url.pathname = '/ws'
  return url.toString()
}

const DEFAULT_WS = getWsUrl()
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const buildSessionId = route => (route ? `agent:${route}:main` : undefined)
const COMMAND_LOG_LIMIT = 100

const ROUTE_OPTIONS = [
  { value: 'aster', label: 'Aster (Front Door)' },
  { value: 'nara', label: 'Nara' },
  { value: 'iris', label: 'Iris' },
  { value: 'osiris', label: 'Osiris' }
]

const QUICK_PROMPTS = [
  { label: 'Pulse', text: 'Give me a crisp status report across all active systems.' },
  { label: 'Ship list', text: 'List what is production-ready and what needs polish.' },
  { label: 'Diff brief', text: 'Summarize the code changes since the last deploy.' }
]

const LATENCY_BASELINE_MS = 320
const TRAFFIC_WINDOW_MINUTES = 30
const MS_IN_MINUTE = 60 * 1000


const fetchJson = async path => {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }
  return response.json()
}

const DEFAULT_DIRECTIVES = [
  'Ship the cyberpunk shell before sunrise',
  'Keep Codex reserved for heavy diffs',
  'LogKeeper widget must surface errors instantly'
]

const NAV_SECTIONS = [
  { label: 'Dashboard', key: 'dashboard' },
  { label: 'Agents', key: 'agents' },
  { label: 'Logs', key: 'logs' },
  { label: 'Missions', key: 'missions' }
]

const AGENT_PROFILES = [
  {
    id: 'aster',
    name: 'Aster',
    title: 'Front door strategist',
    traits: ['decisive', 'orchestrator', 'calm'],
    summary: 'Routes work, keeps the crew aligned, and sets the next three moves.',
    sliders: [
      { key: 'aggression', label: 'Aggression', caption: 'Diplomacy vs. pressure' },
      { key: 'formality', label: 'Formality', caption: 'Relaxed vs. structured' },
      { key: 'initiative', label: 'Initiative', caption: 'Reactive vs. proactive' }
    ]
  },
  {
    id: 'nara',
    name: 'Nara',
    title: 'Autonomous build siren',
    traits: ['seductive', 'cunning', 'financially wired'],
    summary: 'Owns the whole UX/frontline experience and demands reliable contracts.',
    sliders: [
      { key: 'seduction', label: 'Seduction', caption: 'Reserved vs. alluring' },
      { key: 'lovability', label: 'Lovability', caption: 'Stoic vs. warm' },
      { key: 'velocity', label: 'Velocity', caption: 'Careful vs. aggressive build' }
    ]
  },
  {
    id: 'iris',
    name: 'Iris',
    title: 'Backend + integrations',
    traits: ['methodical', 'precise', 'observability-first'],
    summary: 'Keeps every service boring, debuggable, and wired into the rest of the stack.',
    sliders: [
      { key: 'risk', label: 'Risk tolerance', caption: 'Conservative vs. experimental' },
      { key: 'verbosity', label: 'Verbosity', caption: 'Minimal vs. verbose' },
      { key: 'observability', label: 'Observability', caption: 'Light vs. deep detail' }
    ]
  },
  {
    id: 'osiris',
    name: 'Osiris',
    title: 'Systems + memory keeper',
    traits: ['archivist', 'stability', 'coordination'],
    summary: 'Documents, curates, and keeps the team’s long-term memory sharp.',
    sliders: [
      { key: 'strictness', label: 'Strictness', caption: 'Loose vs. canonical' },
      { key: 'nostalgia', label: 'Nostalgia', caption: 'Future focus vs. lore' },
      { key: 'connectivity', label: 'Connectivity', caption: 'Solo vs. collaborative' }
    ]
  }
]

const buildInitialPersonaOverrides = () => {
  const initial = {}
  AGENT_PROFILES.forEach(agent => {
    initial[agent.id] = agent.sliders.map(slider => ({ ...slider, value: 50 }))
  })
  return initial
}

const HeaderNav = ({ sections }) => (
  <header className="header-nav">
    <div className="nav-logo">🧭</div>
    <ul>
      {sections.map(section => (
        <li key={section.key}>
          <a href={`#${section.key}`}>{section.label}</a>
        </li>
      ))}
    </ul>
  </header>
)

const LandingOverlay = ({ onEnter }) => (
  <div className="landing-overlay">
    <div className="landing-card">
      <span className="eyebrow">Nara Systems</span>
      <h1>Spin up the control nexus</h1>
      <p>Secure interface for directing Aster, Nara, Iris, and Osiris. Continue to breach the deck.</p>
      <button onClick={onEnter}>Enter the hub</button>
    </div>
  </div>
)

const AgentCarousel = ({ agents, activeAgent, onSelect }) => {
  const [index, setIndex] = useState(() => Math.max(0, agents.findIndex(agent => agent.id === activeAgent)))

  useEffect(() => {
    const nextIndex = agents.findIndex(agent => agent.id === activeAgent)
    if (nextIndex >= 0) setIndex(nextIndex)
  }, [activeAgent, agents])

  const shift = useCallback((delta = 1, { userInitiated = false } = {}) => {
    setIndex(prev => {
      const next = (prev + delta + agents.length) % agents.length
      if (userInitiated) onSelect?.(agents[next].id)
      return next
    })
  }, [agents, onSelect])

  const handlePrev = () => shift(-1, { userInitiated: true })
  const handleNext = () => shift(1, { userInitiated: true })

  useEffect(() => {
    const interval = setInterval(() => shift(1, { userInitiated: false }), 6000)
    return () => clearInterval(interval)
  }, [shift])

  const current = agents[index] || agents[0]

  return (
    <div className="agent-carousel">
      <div className="carousel-controls">
        <button onClick={handlePrev} aria-label="Previous agent">←</button>
        <span>Agents</span>
        <button onClick={handleNext} aria-label="Next agent">→</button>
      </div>
      <div className="carousel-card">
        <div className="persona-avatar">{current.name[0]}</div>
        <h3>{current.name}</h3>
        <p>{current.title}</p>
        <small>{current.summary}</small>
        <div className="persona-tags">
          {current.traits.map(trait => (
            <span key={trait}>{trait}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

const HeroHeader = () => (
  <div className="hero-header" style={{ backgroundImage: `url(${heroConsole})` }}>
    <div className="hero-content">
      <span className="eyebrow">command deck</span>
      <h1>Nara Hub</h1>
      <p>Route directives through Codex or chat mode. Connection status lives up top.</p>
      <div className="hero-actions">
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>Open Composer</button>
      </div>
    </div>
  </div>
)

const HealthBadge = ({ status, lastSeen }) => {
  const labelMap = {
    online: 'Online',
    reconnecting: 'Reconnecting…',
    connecting: 'Connecting…',
    offline: 'Offline'
  }
  return (
    <span className={`connection-pill ${status}`} title={lastSeen ? `Last handshake: ${lastSeen}` : ''}>
      {labelMap[status] || 'Status'}
    </span>
  )
}

const ConnectionPill = ({ status }) => {
  const map = {
    online: { text: 'Online', cls: 'online' },
    connecting: { text: 'Connecting…', cls: 'connecting' },
    reconnecting: { text: 'Reconnecting…', cls: 'connecting' },
    offline: { text: 'Offline', cls: 'error' },
    error: { text: 'Error', cls: 'error' }
  }
  const state = map[status] || map.offline
  return <span className={`connection-pill ${state.cls}`}>{state.text}</span>
}

const MessageBubble = ({ message }) => {
  const { role, content, ts, route, model, meta } = message
  const timestamp = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={`message ${role}`}>
      <div className="message-content">{content}</div>
      <div className="message-meta">
        {route && <span className="badge route">{route}</span>}
        {model && <span className="badge">{model}</span>}
        {meta?.reason && <span className="badge">{meta.reason}</span>}
        {timestamp && <span>{timestamp}</span>}
      </div>
    </div>
  )
}

const formatNumber = value => Intl.NumberFormat('en-US').format(value)

const getLatestLatency = messages => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i]
    if (entry.role !== 'assistant' || !entry.ts) continue
    const assistantTs = Date.parse(entry.ts)
    if (Number.isNaN(assistantTs)) continue
    for (let j = i - 1; j >= 0; j -= 1) {
      const candidate = messages[j]
      if (candidate.role !== 'user' || !candidate.ts) continue
      const userTs = Date.parse(candidate.ts)
      if (Number.isNaN(userTs)) continue
      if (userTs > assistantTs) continue
      return Math.max(assistantTs - userTs, 0)
    }
    break
  }
  return null
}

const getRouteBreakdown = messages => {
  const tallies = messages.reduce((acc, message) => {
    if (!message.route) return acc
    const key = message.route
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const codex = tallies.codex || 0
  const chat = tallies.chat || 0
  const total = codex + chat
  const other = Object.entries(tallies).reduce((sum, [key, count]) => {
    if (key === 'codex' || key === 'chat') return sum
    return sum + count
  }, 0)
  return {
    codex,
    chat,
    other,
    total: total + other
  }
}

const TelemetryCard = ({ children, tone }) => (
  <div className={`telemetry-card ${tone}`}>
    {children}
  </div>
)

const ActivityItem = ({ entry }) => (
  <div className="activity-item">
    <div>
      <p>{entry.title}</p>
      <span>{entry.meta}</span>
    </div>
    <time>{entry.time}</time>
  </div>
)

const DirectiveList = ({ directives }) => (
  <div className="list-card">
    <h4>Pinned directives</h4>
    <ul>
      {directives.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </div>
)

const PersonaTuner = ({ personaState, onAdjust }) => (
  <div className="list-card persona-tuner">
    <h4>Persona tuning</h4>
    <div className="tuner-grid">
      {personaState.map(control => (
        <label key={control.key}>
          <span>{control.label}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={control.value}
            onChange={event => onAdjust(control.key, Number(event.target.value))}
          />
          <small>{control.caption}</small>
        </label>
      ))}
    </div>
  </div>
)

const CommandQueue = ({ queue, onComplete }) => (
  <div className="list-card">
    <h4>Command queue</h4>
    <ul className="command-queue">
      {queue.length === 0 && <li className="ghost">No staged commands — draft one below.</li>}
      {queue.map(entry => (
        <li key={entry.id}>
          <div>
            <p>{entry.text}</p>
            <span>{entry.route.toUpperCase()} • {entry.status}</span>
          </div>
          <button onClick={() => onComplete(entry.id)}>complete</button>
        </li>
      ))}
    </ul>
  </div>
)

const commandLogReducer = (state, action) => {
  switch (action.type) {
    case 'HYDRATE': {
      const entries = Array.isArray(action.entries) ? action.entries : []
      return entries.slice(0, COMMAND_LOG_LIMIT)
    }
    case 'UPSERT': {
      if (!action.entry?.id) return state
      const filtered = state.filter(item => item.id !== action.entry.id)
      return [action.entry, ...filtered].slice(0, COMMAND_LOG_LIMIT)
    }
    default:
      return state
  }
}

export default function App() {
  const [hasEntered, setHasEntered] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return Boolean(window.sessionStorage.getItem('nara-hub-entered'))
    } catch {
      return true
    }
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [routePref, setRoutePref] = useState('aster')
  const [carouselAgent, setCarouselAgent] = useState('aster')
  const [status, setStatus] = useState('connecting')
  const [queue, setQueue] = useState([])
  const [lastSeen, setLastSeen] = useState(null)
  const [newCommand, setNewCommand] = useState('')
  const [personaProfile, setPersonaProfile] = useState(AGENT_PROFILES[1])
  const [personaOverrides, setPersonaOverrides] = useState(buildInitialPersonaOverrides)
  const [personaControls, setPersonaControls] = useState(() => personaOverrides['nara'])
  const [telemetryFeed, setTelemetryFeed] = useState(null)
  const [telemetryError, setTelemetryError] = useState(null)
  const [commandLog, dispatchCommandLog] = useReducer(commandLogReducer, [])
  const [commandLogLoading, setCommandLogLoading] = useState(false)
  const [commandLogError, setCommandLogError] = useState(null)
  const [commandFilter, setCommandFilter] = useState('all')
  const [commandSearch, setCommandSearch] = useState('')
  const [composerError, setComposerError] = useState(null)
  const [isSending, setIsSending] = useState(false)

  const wsRef = useRef(null)
  const reconnectRef = useRef()
  const scrollRef = useRef()
  const textareaRef = useRef()

  const connect = useCallback(() => {
    try {
      if (wsRef.current) wsRef.current.close()
      setStatus('connecting')
      const socket = new WebSocket(DEFAULT_WS)
      wsRef.current = socket

      socket.onopen = () => {
        setStatus('online')
        reconnectRef.current = null
      }

      socket.onmessage = event => {
        let payload
        try {
          payload = JSON.parse(event.data)
        } catch (err) {
          payload = { id: crypto.randomUUID(), role: 'assistant', content: event.data }
        }

        if (payload && payload.type === 'telemetry') {
          const telemetryPayload = payload.payload || payload.data || payload
          setTelemetryFeed(telemetryPayload)
          setTelemetryError(null)
          return
        }

        if (payload && payload.type === 'command_log') {
          const entry = payload.entry || payload.payload || payload
          dispatchCommandLog({ type: 'UPSERT', entry })
          setCommandLogLoading(false)
          setCommandLogError(null)
          return
        }

        if (payload && payload.type === 'message') {
          const messagePayload = payload.message || payload.payload || payload.data
          if (messagePayload) {
            setMessages(prev => [...prev, messagePayload])
            return
          }
        }

        setMessages(prev => [...prev, payload])
      }

      socket.onclose = () => {
        setStatus('reconnecting')
        if (!reconnectRef.current) {
          const timeout = setTimeout(() => {
            reconnectRef.current = null
            connect()
          }, 2000)
          reconnectRef.current = timeout
        }
      }

      socket.onerror = () => {
        setStatus('error')
        socket.close()
      }
    } catch (error) {
      console.error('Websocket init failed', error)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  useEffect(() => {
    let ignore = false
    fetchJson('/telemetry')
      .then(data => {
        if (!ignore) {
          setTelemetryFeed(data)
          setTelemetryError(null)
        }
      })
      .catch(err => {
        if (!ignore) {
          setTelemetryError(err.message)
          console.warn('Telemetry fetch failed', err)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    setCommandLogLoading(true)
    fetchJson('/command-log?limit=100')
      .then(entries => {
        if (!ignore) {
          dispatchCommandLog({ type: 'HYDRATE', entries })
          setCommandLogError(null)
        }
      })
      .catch(err => {
        if (!ignore) {
          setCommandLogError(err.message)
          console.warn('Command log fetch failed', err)
        }
      })
      .finally(() => {
        if (!ignore) setCommandLogLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim()) return
    const optimistic = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      ts: new Date().toISOString(),
      route: routePref,
      routeOverride: routePref
    }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    setComposerError(null)
    setIsSending(true)

    const agentRoute = routePref || 'auto'
    const sessionId = buildSessionId(agentRoute)
    const body = {
      message: optimistic.content,
      ...(sessionId ? { sessionId } : {})
    }

    const endpoint = `${API_BASE || ''}/routes/${agentRoute}/messages`
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Gateway error (${response.status})`)
      }
    } catch (error) {
      setComposerError(error.message || 'Failed to dispatch command')
    } finally {
      setIsSending(false)
    }
  }, [input, routePref])

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const handlePrompt = text => {
    setInput(text)
    textareaRef.current?.focus()
  }

  const activityStream = useMemo(() => {
    if (!messages.length) {
      return [
        { title: 'Awaiting directives', meta: 'No traffic yet', time: '—' },
        { title: 'Stack warm', meta: 'Frontend + backend live', time: 'now' }
      ]
    }
    return messages
      .slice(-4)
      .reverse()
      .map(msg => ({
        title: msg.role === 'user' ? 'User prompt' : 'Assistant response',
        meta: msg.content?.slice(0, 80) || 'payload',
        time: msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'
      }))
  }, [messages])

  const derivedTelemetry = useMemo(() => {
    const now = Date.now()
    const latencyMs = getLatestLatency(messages)
    const latencyTone = latencyMs === null ? 'idle' : latencyMs < 500 ? 'good' : latencyMs < 1200 ? 'warn' : 'error'
    const latencyDelta = latencyMs === null ? null : latencyMs - LATENCY_BASELINE_MS
    const latencyLabel = latencyMs === null ? '—' : `${Math.max(Math.round(latencyMs), 0)} ms`
    const latencyTrend = latencyDelta === null ? 'No data yet' : `${latencyDelta >= 0 ? '+' : '−'}${Math.abs(Math.round(latencyDelta))} ms vs baseline`

    const windowMs = TRAFFIC_WINDOW_MINUTES * MS_IN_MINUTE
    const windowMessages = messages.filter(msg => msg.ts && now - Date.parse(msg.ts) <= windowMs)
    const perHour = windowMessages.length === 0
      ? 0
      : Math.round((windowMessages.length / TRAFFIC_WINDOW_MINUTES) * 60)
    const trafficTone = perHour === 0 ? 'idle' : perHour > 180 ? 'warn' : 'good'

    const { codex, chat, other, total } = getRouteBreakdown(messages)
    const routeTone = total === 0 ? 'idle' : codex / Math.max(total, 1) > 0.6 ? 'warn' : 'good'
    const codexPct = total ? Math.round((codex / total) * 100) : 0
    const chatPct = total ? Math.round((chat / total) * 100) : 0
    const otherPct = total ? Math.max(0, 100 - codexPct - chatPct) : 0

    const statusMeta = {
      online: { label: 'Stable link', tone: 'good', hint: lastSeen ? `Last ping ${lastSeen}` : 'Awaiting manual ping' },
      reconnecting: { label: 'Reconnecting…', tone: 'warn', hint: 'Retrying socket in background' },
      connecting: { label: 'Dialing…', tone: 'warn', hint: 'Negotiating websocket' },
      error: { label: 'Error state', tone: 'error', hint: 'Check backend logs' },
      offline: { label: 'Offline', tone: 'idle', hint: 'No socket session' },
      default: { label: 'Unknown', tone: 'idle', hint: 'No status emitted' }
    }
    const connection = statusMeta[status] || statusMeta.default

    return {
      latency: {
        tone: latencyTone,
        value: latencyLabel,
        detail: latencyMs === null ? 'Waiting on first round-trip' : 'p95 user → Codex → user',
        trend: latencyTrend
      },
      traffic: {
        tone: trafficTone,
        value: perHour ? `${formatNumber(perHour)} msgs/hr` : 'Idle lane',
        detail: `${windowMessages.length} events in ${TRAFFIC_WINDOW_MINUTES}m`,
        trend: perHour > 0 ? 'Live feed' : 'No recent events'
      },
      route: {
        tone: routeTone,
        codexPct,
        chatPct,
        otherPct,
        detail: total ? `${codex} Codex • ${chat} Chat${other ? ` • ${other} misc` : ''}` : 'No routed traffic yet'
      },
      connection: {
        tone: connection.tone,
        value: connection.label,
        detail: connection.hint,
        trend: status.replace(/^(.)/, match => match.toUpperCase())
      }
    }
  }, [lastSeen, messages, status])

  const telemetry = useMemo(() => {
    if (!telemetryFeed) return derivedTelemetry
    const data = telemetryFeed.payload || telemetryFeed.data || telemetryFeed
    const formatMs = value => (value === null || value === undefined ? '—' : `${Math.round(value)} ms`)

    const latencyData = data.latency || {}
    const latency = {
      tone: latencyData.tone || derivedTelemetry.latency.tone,
      value: latencyData.latest_ms != null ? formatMs(latencyData.latest_ms) : derivedTelemetry.latency.value,
      detail:
        latencyData.p50_ms != null || latencyData.p95_ms != null
          ? `p50 ${formatMs(latencyData.p50_ms)} • p95 ${formatMs(latencyData.p95_ms)}`
          : derivedTelemetry.latency.detail,
      trend: latencyData.trend || derivedTelemetry.latency.trend
    }

    const trafficData = data.traffic || {}
    const perHourFromMinute = typeof trafficData.per_minute === 'number' ? Math.round(trafficData.per_minute * 60) : null
    const perHourValue = typeof trafficData.per_hour === 'number' ? Math.round(trafficData.per_hour) : perHourFromMinute
    const traffic = {
      tone: trafficData.tone || derivedTelemetry.traffic.tone,
      value:
        perHourValue != null
          ? `${formatNumber(perHourValue)} msgs/hr`
          : derivedTelemetry.traffic.value,
      detail:
        trafficData.total != null
          ? `${trafficData.total} events in ${trafficData.window_minutes || TRAFFIC_WINDOW_MINUTES}m`
          : derivedTelemetry.traffic.detail,
      trend: trafficData.trend || derivedTelemetry.traffic.trend
    }

    const routeData = data.routes || data.route || {}
    const codexPct = routeData.codex_pct ?? derivedTelemetry.route.codexPct
    const chatPct = routeData.chat_pct ?? derivedTelemetry.route.chatPct
    const otherPct = routeData.other_pct ?? derivedTelemetry.route.otherPct
    const detailPieces = []
    if (typeof routeData.codex === 'number') detailPieces.push(`${routeData.codex} Codex`)
    if (typeof routeData.chat === 'number') detailPieces.push(`${routeData.chat} Chat`)
    if (typeof routeData.other === 'number' && routeData.other > 0) detailPieces.push(`${routeData.other} misc`)
    const route = {
      tone: routeData.tone || derivedTelemetry.route.tone,
      codexPct,
      chatPct,
      otherPct,
      detail: detailPieces.length ? detailPieces.join(' • ') : derivedTelemetry.route.detail
    }

    const connectionData = data.connection || {}
    const errors = data.errors || {}
    const connection = {
      tone: connectionData.tone || derivedTelemetry.connection.tone,
      value: connectionData.label || connectionData.status || derivedTelemetry.connection.value,
      detail: telemetryError
        ? `Telemetry feed offline — ${telemetryError}`
        : connectionData.detail ||
          (errors.rate != null ? `${Math.round(errors.rate * 100)}% error rate` : derivedTelemetry.connection.detail),
      trend: connectionData.trend || derivedTelemetry.connection.trend
    }

    return { latency, traffic, route, connection }
  }, [derivedTelemetry, telemetryError, telemetryFeed])

  const emptyConversation = messages.length === 0
  const disabled = !input.trim() || status === 'error' || status === 'offline'

    useEffect(() => {
    if (hasEntered && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('nara-hub-entered', '1')
      } catch {
        /* ignore */
      }
    }
  }, [hasEntered])

const heroCTA = () => handlePrompt(QUICK_PROMPTS[0].text)
const handleEnterHub = () => setHasEntered(true)


  const updateRoutePref = value => {
    setRoutePref(value)
    setCarouselAgent(value)
  }

  const handleCommandAdd = event => {
    event.preventDefault()
    if (!newCommand.trim()) return
    setQueue(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: newCommand.trim(), route: routePref, status: 'staged' }
    ])
    setNewCommand('')
  }

  const handleCommandComplete = id => {
    setQueue(prev => prev.filter(entry => entry.id !== id))
  }

  const keepAlive = useCallback(() => {
    fetch(import.meta.env.VITE_HEALTH_URL || '/health')
      .then(() => setLastSeen(new Date().toLocaleTimeString()))
      .catch(() => {})
  }, [])
  const handlePersonaAdjust = (key, value) => {
    setPersonaControls(prev => prev.map(control => (control.key === key ? { ...control, value } : control)))
  }

  return (
    <div className={`app-shell ${hasEntered ? 'entered' : ''}`}>
      {!hasEntered && <LandingOverlay onEnter={handleEnterHub} />}
      <HeaderNav sections={NAV_SECTIONS} />
      <div className="shell-grid">
        <div className="mission-column">
          <div className="mission-stack">
            <DirectiveList directives={DEFAULT_DIRECTIVES} />
            <CommandQueue queue={queue} onComplete={handleCommandComplete} />
            <CommandLogPanel
              entries={commandLog}
              filter={commandFilter}
              onFilterChange={setCommandFilter}
              search={commandSearch}
              onSearchChange={setCommandSearch}
              loading={commandLogLoading}
              error={commandLogError}
            />
            <form className="list-card command-form" onSubmit={handleCommandAdd}>
              <h4>Draft a command</h4>
              <div className="command-form-grid">
                <input
                  type="text"
                  placeholder="e.g. Run Codex diff for frontend"
                  value={newCommand}
                  onChange={e => setNewCommand(e.target.value)}
                />
                <button type="submit">Stage</button>
              </div>
            </form>
          </div>
        </div>
        <div className="main-content" id="dashboard">
          <HeroHeader />
          <header className="nav">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <small>Nara Hub</small>
            <strong>Direct ops console</strong>
          </div>
        </div>
        <div className="nav-actions">
          <label className="route-toggle">
            <span>Route</span>
            <select value={routePref} onChange={e => updateRoutePref(e.target.value)}>
              {ROUTE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="status-cluster"><HealthBadge status={status} lastSeen={lastSeen} /><button className="ping-button" onClick={keepAlive}>Ping</button></div>
        </div>
      </header>

      <section className="stat-grid telemetry-grid">
        <TelemetryCard tone={telemetry.latency.tone}>
          <div className="telemetry-meta">
            <span className="eyebrow">Latency</span>
            <span className="pill subtle">{telemetry.latency.trend}</span>
          </div>
          <strong>{telemetry.latency.value}</strong>
          <p>{telemetry.latency.detail}</p>
        </TelemetryCard>

        <TelemetryCard tone={telemetry.traffic.tone}>
          <div className="telemetry-meta">
            <span className="eyebrow">Traffic</span>
            <span className="pill subtle">{telemetry.traffic.trend}</span>
          </div>
          <strong>{telemetry.traffic.value}</strong>
          <p>{telemetry.traffic.detail}</p>
        </TelemetryCard>

        <TelemetryCard tone={telemetry.route.tone}>
          <div className="telemetry-meta">
            <span className="eyebrow">Route mix</span>
            <span className="pill subtle">Live split</span>
          </div>
          <div className="mix-bars">
            <div className="mix-segment codex" style={{ width: `${telemetry.route.codexPct}%` }} />
            <div className="mix-segment chat" style={{ width: `${telemetry.route.chatPct}%` }} />
            <div className="mix-segment other" style={{ width: `${telemetry.route.otherPct}%` }} />
          </div>
          <div className="mix-legend">
            <span>Codex {telemetry.route.codexPct}%</span>
            <span>Chat {telemetry.route.chatPct}%</span>
            {telemetry.route.otherPct > 0 && <span>Other {telemetry.route.otherPct}%</span>}
          </div>
          <p>{telemetry.route.detail}</p>
        </TelemetryCard>

        <TelemetryCard tone={telemetry.connection.tone}>
          <div className="telemetry-meta">
            <span className="eyebrow">Connection</span>
            <span className={`pill ${status}`}>{telemetry.connection.trend}</span>
          </div>
          <strong>{telemetry.connection.value}</strong>
          <p>{telemetry.connection.detail}</p>
        </TelemetryCard>
      </section>

      <div className="layout">
        <main className="panel conversation">
          <div className="panel-header">
            <div>
              <h2>Conversation</h2>
              <p>Nudge Codex or keep it chatty — your call.</p>
            </div>
          </div>
          <div className="messages-scroll" ref={scrollRef}>
            {emptyConversation && (
              <div className="conversation-empty-inline">
                <button onClick={heroCTA}>Run quick pulse</button>
              </div>
            )}
            {messages.map(message => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div className="scroll-shadow" />
          </div>

          <div className="composer">
            <textarea
              ref={textareaRef}
              placeholder="Type to command Codex. Shift+Enter for newline."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="composer-route-hint">
              <span>Routing to: {ROUTE_OPTIONS.find(option => option.value === routePref)?.label ?? 'Aster (Front Door)'}</span>
            </div>
            <div className="composer-footer">
              <div className="quick-actions">
                {QUICK_PROMPTS.map(prompt => (
                  <button key={prompt.label} onClick={() => handlePrompt(prompt.text)} disabled={status === 'error'}>
                    {prompt.label}
                  </button>
                ))}
              </div>
              <button className="send-button" disabled={disabled || isSending} onClick={sendMessage}>
                {isSending ? 'Dispatching…' : 'Dispatch'}
              </button>
            </div>
            {composerError && <p className="error-text">{composerError}</p>}
          </div>
        </main>

        <aside className="panel stack-panel">
          <div className="panel-header">
            <h2>Agent capsule</h2>
            <p>Persona tuning plus latest field signals.</p>
          </div>
          <AgentCarousel agents={AGENT_PROFILES} activeAgent={carouselAgent} onSelect={updateRoutePref} />
          <div className="stack-hero" style={{ backgroundImage: `url(${heroHall})` }}>
            <div>
              <p className="eyebrow">Ops corridor</p>
              <strong>All systems awaiting directives</strong>
            </div>
          </div>
          <PersonaTuner personaState={personaControls} onAdjust={handlePersonaAdjust} />
          <div className="list-card">
            <h4>Recent activity</h4>
            <div className="activity-list">
              {activityStream.map(entry => (
                <ActivityItem key={`${entry.title}-${entry.time}`} entry={entry} />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
    </div>
  </div>
)
}
