import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import heroConsole from './assets/hero-console.jpg'
import heroHall from './assets/hero-hall.jpg'
import CommandLogPanel from './components/CommandLogPanel'
import OpsFeed from './components/OpsFeed'
import MemoryStream from './components/MemoryStream'
import MemoryBoardPage from './components/MemoryBoardPage'
import CalendarPreview from './components/CalendarPreview'
import TaskBoardPage from './components/TaskBoardPage'
import CalendarPage from './components/CalendarPage'
import avatarAster from './assets/avatars/aster.jpg'
import avatarNara from './assets/avatars/nara.jpg'
import avatarIris from './assets/avatars/iris.jpg'
import avatarOsiris from './assets/avatars/osiris.jpg'
import { OWNER_SEQUENCE, STATUS_SEQUENCE, getSlaMeta, getDefaultSlaMinutes, getTaskDeadline } from './config/taskConstants'
import {
  INITIAL_SCHEDULE,
  CALENDAR_STORAGE_KEY,
  DEFAULT_AGENT_OPTIONS,
  SCHEDULE_TYPE_OPTIONS,
  CALENDAR_DAYS,
  getScheduleColorClass
} from './config/scheduleConstants'
import { listSchedule, createScheduleItem, deleteScheduleItem, updateScheduleItem } from './api/schedule'
import { fetchOpsFeed, fetchMemoryStream, fetchMemoryIndex } from './api/intel'
import { listTasks, createTask as apiCreateTask, advanceTask as apiAdvanceTask, rewindTask as apiRewindTask, reassignTask as apiReassignTask, completeTask as apiCompleteTask, deleteTask as apiDeleteTask } from './api/tasks'
import { autoAssignOwner } from './utils/routingRules'

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
const NGROK_HEADER = API_BASE.includes('ngrok-free') ? { 'ngrok-skip-browser-warning': 'true' } : {}
const SESSION_KEY_PREFIX = 'nara-hub:session:'
const buildSessionId = route => {
  if (!route || typeof window === 'undefined') return undefined
  const key = `${SESSION_KEY_PREFIX}${route}`
  let sessionId = window.localStorage.getItem(key)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    window.localStorage.setItem(key, sessionId)
  }
  return sessionId
}
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

const TASKS_STORAGE_KEY = 'mission-control/tasks'
const minutesAgo = minutes => new Date(Date.now() - minutes * 60 * 1000).toISOString()

const formatClockTime = value => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const mapOpsFeedEntry = entry => {
  if (!entry) return null
  const ts = entry.ts_completed || entry.ts_received || entry.time || Date.now()
  const duration = typeof entry.latencyMs === 'number'
    ? `${Math.round(entry.latencyMs)} ms`
    : entry.duration
  return {
    id: entry.id || crypto.randomUUID(),
    title: entry.title || entry.text || 'Command',
    route: entry.route || entry.routeOverride || 'auto',
    status: entry.status || 'completed',
    duration,
    time: formatClockTime(ts),
    sourceId: entry.sourceId
  }
}

const mapMemoryEntry = entry => {
  if (!entry) return null
  const ts = entry.time || entry.ts || entry.created_at
  return {
    id: entry.id || crypto.randomUUID(),
    type: entry.type || 'thought',
    title: entry.title || 'Reflection',
    summary: entry.summary || entry.body || '',
    time: formatClockTime(ts)
  }
}

const INITIAL_TASKS = [
  {
    id: 'task-avatar-pipeline',
    title: 'Finish agent avatar pipeline',
    owner: 'Iris',
    status: 'review',
    description: 'Import portrait art + wire carousel badges before shipping Mission Control.',
    slaMinutes: getDefaultSlaMinutes('review'),
    createdAt: minutesAgo(240),
    updatedAt: minutesAgo(60)
  },
  {
    id: 'task-dashboard-widgets',
    title: 'Polish intel widgets',
    owner: 'Aster',
    status: 'in-progress',
    description: 'Ensure Ops Feed, Memory Stream, and Calendar render clean placeholder data.',
    slaMinutes: getDefaultSlaMinutes('in-progress'),
    createdAt: minutesAgo(180),
    updatedAt: minutesAgo(28)
  },
  {
    id: 'task-nara-playbooks',
    title: 'Storyboard TaskBoard states',
    owner: 'Nara',
    status: 'in-progress',
    description: 'Map hover/focus states + microcopy so Mission Control stays seductive.',
    blockerFlag: true,
    blockerReason: 'Waiting on brand kit assets',
    slaMinutes: getDefaultSlaMinutes('in-progress'),
    createdAt: minutesAgo(210),
    updatedAt: minutesAgo(18)
  },
  {
    id: 'task-nara-hand-off',
    title: 'Prep Figma hand-off kit',
    owner: 'Nara',
    status: 'backlog',
    description: 'Bundle component specs + tokens for future dashboard slices.',
    slaMinutes: getDefaultSlaMinutes('backlog'),
    createdAt: minutesAgo(360),
    updatedAt: null
  },
  {
    id: 'task-iris-contracts',
    title: 'Stabilize backend contracts',
    owner: 'Aster',
    status: 'backlog',
    description: 'Confirm gateway endpoints + Codex routes align with new task board.',
    blockerFlag: true,
    blockerReason: 'Need gateway schema approval',
    slaMinutes: 720,
    createdAt: minutesAgo(400),
    updatedAt: minutesAgo(200)
  },
  {
    id: 'task-memory-lane',
    title: 'Document sprint reflections',
    owner: 'Osiris',
    status: 'review',
    description: 'Fold Memory Bank notes into Mission Control brief.',
    slaMinutes: getDefaultSlaMinutes('review'),
    createdAt: minutesAgo(300),
    updatedAt: minutesAgo(90)
  },
  {
    id: 'task-board-compose',
    title: 'Wire task composer UX',
    owner: 'Nara',
    status: 'done',
    description: 'Cycle owners Iris→Terrence→Aster→Osiris with inline controls.',
    createdAt: minutesAgo(500),
    updatedAt: minutesAgo(45)
  },
  {
    id: 'task-nav-toggle',
    title: 'Link nav to board view',
    owner: 'Iris',
    status: 'in-progress',
    description: 'Header nav should flip between dashboard + tasks.',
    slaMinutes: getDefaultSlaMinutes('in-progress'),
    createdAt: minutesAgo(40),
    updatedAt: minutesAgo(5)
  }
]


const normalizeTask = task => {
  if (!task) return null;
  const rawOwner = task.owner || ''
  const owner = rawOwner && rawOwner.toLowerCase() !== 'unknown' ? rawOwner : 'Unassigned'
  const status = task.status || 'backlog'
  const readOnly = Boolean(task.readOnly)
  const tags = Array.isArray(task.tags) ? task.tags : []
  return {
    ...task,
    owner,
    status,
    tags,
    readOnly,
    source: task.source || (readOnly ? 'sync' : 'manual'),
    lastSyncedAt: task.lastSyncedAt || null
  }
}

const normalizeTaskList = list => (Array.isArray(list) ? list.map(normalizeTask).filter(Boolean) : [])

const OPS_FEED_BASE = [
  { id: 'ops-1', title: 'Deploy command pack to Iris', route: 'codex', status: 'completed', duration: '42s', time: '07:02' },
  { id: 'ops-2', title: 'Refresh telemetry window', route: 'chat', status: 'dispatched', duration: '18s', time: '06:55' },
  { id: 'ops-3', title: 'Queue memory sync', route: 'osiris', status: 'staged', time: '06:41' }
]

const MEMORY_STREAM_ENTRIES = [
  {
    id: 'memory-1',
    type: 'action',
    title: 'Mission Control avatars wired',
    summary: 'Swapped placeholder initials for portrait art to boost operator trust.',
    time: '06:58'
  },
  {
    id: 'memory-2',
    type: 'decision',
    title: 'Task board owns sprint scope',
    summary: 'All short-term directives funnel through Iris + Terrence so nothing drifts.',
    time: '06:42'
  },
  {
    id: 'memory-3',
    type: 'thought',
    title: 'Calendar widget stays lightweight',
    summary: 'Preview just enough schedule data to prime the next sync.',
    time: '06:20'
  }
]

const CALENDAR_SCHEDULE = [
  { id: 'cal-1', label: 'Ops stand-up', day: 'Mon', time: '09:00', color: 'calendar-blue', next: 'Mon • 09:00' },
  { id: 'cal-2', label: 'Memory sweep', day: 'Tue', time: '14:00', color: 'calendar-purple', next: 'Tue • 14:00' },
  { id: 'cal-3', label: 'Frontend polish', day: 'Wed', time: '11:00', color: 'calendar-pink', next: 'Wed • 11:00' },
  { id: 'cal-4', label: 'Backend diagnostics', day: 'Thu', time: '16:00', color: 'calendar-green', next: 'Thu • 16:00' },
  { id: 'cal-5', label: 'Sprint sync', day: 'Fri', time: '13:00', color: 'calendar-gold', next: 'Fri • 13:00' },
  { id: 'cal-6', label: 'Ops stand-up', day: 'Thu', time: '09:00', color: 'calendar-blue' }
]


const normalizeScheduleEvent = event => {
  if (!event) return null
  const owner = event.owner || event.agent || 'Unassigned'
  const startAt = event.startAt || event.datetime || null
  return {
    ...event,
    owner,
    agent: event.agent || owner,
    startAt,
    datetime: event.datetime || startAt,
    type: event.type || 'event',
    readOnly: Boolean(event.readOnly),
    source: event.source || null,
    lastSyncedAt: event.lastSyncedAt || event.updatedAt || null,
    notes: event.notes || event.description || undefined,
    recurrence: event.recurrence || event.location || undefined
  }
}

const normalizeScheduleList = list => (Array.isArray(list) ? list.map(normalizeScheduleEvent).filter(Boolean) : [])

const safeParseJSON = (value, fallback = null) => {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getStoredTasks = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY)
    const parsed = safeParseJSON(raw, null)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

const persistTasks = tasks => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    /* ignore */
  }
}

const getStoredSchedule = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY)
    const parsed = safeParseJSON(raw, null)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

const persistSchedule = schedule => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(schedule))
  } catch {
    /* ignore */
  }
}

const fetchJson = async path => {
  const response = await fetch(`${API_BASE}${path}`, { headers: NGROK_HEADER })
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
  { label: 'Tasks', key: 'tasks' },
  { label: 'Calendar', key: 'calendar' },
  { label: 'Memory', key: 'memory' }
]

const AGENT_PROFILES = [
  {
    id: 'aster',
    name: 'Aster',
    avatar: avatarAster,
    focus: 'Routes missions, sets priorities',
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
    avatar: avatarNara,
    focus: 'Owns UX/frontline experience',
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
    avatar: avatarIris,
    focus: 'Backend + integrations guardrail',
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
    avatar: avatarOsiris,
    focus: 'Systems, memory, and lore',
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

const HeaderNav = ({ sections, activeView, onNavigate }) => (
  <header className="header-nav">
    <div className="nav-logo">🧭</div>
    <ul>
      {sections.map(section => (
        <li key={section.key}>
          <button
            type="button"
            className={activeView === section.key ? 'active' : ''}
            onClick={() => onNavigate?.(section.key)}
          >
            {section.label}
          </button>
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

const AgentCarousel = ({ agents, activeAgent, onSelect, routedAgent }) => {
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
  const isRouted = current.id === routedAgent

  return (
    <div className="agent-carousel">
      <div className="carousel-controls">
        <button onClick={handlePrev} aria-label="Previous agent">←</button>
        <span>Agents</span>
        <button onClick={handleNext} aria-label="Next agent">→</button>
      </div>
      <div className="carousel-card">
        <div className="persona-avatar">
          <img src={current.avatar} alt={`${current.name} avatar`} />
        </div>
        <div className="persona-card-header">
          <h3>{current.name}</h3>
          {isRouted && <span className="pill subtle">Routed</span>}
        </div>
        <p className="persona-role">{current.title}</p>
        <small>{current.summary}</small>
        {current.focus && <p className="persona-focus">{current.focus}</p>}
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



const normalizeMessageContent = (text) => {
  if (typeof text !== 'string') return ['']
  const normalized = text
    .replace(/```([\s\S]*?)```/g, (_, code) => `\n${code.trim()}\n`)
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~{2}(.*?)~{2}/g, '$1')
    .replace(/^-{3,}$/gm, '')
    .replace(/\r/g, '')
    .replace(/\n-\s+/g, '\n• ')
    .replace(/\n>/g, '\n')
  return normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

const MessageBubble = ({ message }) => {
  const { role, content, ts, route, model, meta } = message
  const timestamp = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const segments = useMemo(() => normalizeMessageContent(content), [content])
  return (
    <div className={`message ${role}`}>
      <div className="message-content">
        {segments.length > 0 ? (
          segments.map((segment, index) => (
            <p key={`${message.id || index}-segment-${index}`}>{segment}</p>
          ))
        ) : (
          <p>{content}</p>
        )}
      </div>
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

const PersonaTuner = ({ personaState, agentId, onAdjust }) => (
  <div className="list-card persona-tuner">
    <div className="persona-tuner-header">
      <h4>Persona tuning</h4>
      {agentId && <span className="pill subtle">{agentId}</span>}
    </div>
    <div className="tuner-grid">
      {personaState.length === 0 && <p className="empty-text">No controls yet.</p>}
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
  const [personaOverrides, setPersonaOverrides] = useState(buildInitialPersonaOverrides)
  const [telemetryFeed, setTelemetryFeed] = useState(null)
  const [telemetryError, setTelemetryError] = useState(null)
  const [commandLog, dispatchCommandLog] = useReducer(commandLogReducer, [])
  const [commandLogLoading, setCommandLogLoading] = useState(false)
  const [commandLogError, setCommandLogError] = useState(null)
  const [commandFilter, setCommandFilter] = useState('all')
  const [commandSearch, setCommandSearch] = useState('')
  const [composerError, setComposerError] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const useTasksApi = import.meta.env.VITE_USE_TASKS_API === 'true' || Boolean(import.meta.env.VITE_API_BASE_URL)
  const useScheduleApi = import.meta.env.VITE_USE_SCHEDULE_API === 'true' || Boolean(import.meta.env.VITE_API_BASE_URL)
  const useIntelApi = import.meta.env.VITE_USE_INTEL_API === 'true' || Boolean(import.meta.env.VITE_API_BASE_URL)

  const [tasks, setTasks] = useState(() => (useTasksApi ? [] : normalizeTaskList(getStoredTasks() ?? INITIAL_TASKS)))
  const [tasksLoading, setTasksLoading] = useState(useTasksApi)
  const [tasksError, setTasksError] = useState(null)

  const [schedule, setSchedule] = useState(() => (useScheduleApi ? [] : normalizeScheduleList(getStoredSchedule() ?? INITIAL_SCHEDULE)))
  const [scheduleError, setScheduleError] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(useScheduleApi)

  const [opsFeedData, setOpsFeedData] = useState(() => (useIntelApi ? [] : OPS_FEED_BASE))
  const [opsFeedError, setOpsFeedError] = useState(null)
  const [opsFeedLoading, setOpsFeedLoading] = useState(useIntelApi)
  const [memoryData, setMemoryData] = useState(() => (useIntelApi ? [] : MEMORY_STREAM_ENTRIES))
  const [memoryError, setMemoryError] = useState(null)
  const [memoryLoading, setMemoryLoading] = useState(useIntelApi)
  const [memoryDocs, setMemoryDocs] = useState([])
  const [memoryDocsLoading, setMemoryDocsLoading] = useState(useIntelApi)
  const [memoryDocsError, setMemoryDocsError] = useState(null)
  const [slaAlerts, setSlaAlerts] = useState([])
  const slaStatusRef = useRef(new Map())
  const [autoArchiveDone, setAutoArchiveDone] = useState(true)

  const refreshTasks = useCallback(() => {
    if (!useTasksApi) return Promise.resolve()
    setTasksLoading(true)
    return listTasks()
      .then(data => {
        setTasks(data)
        setTasksError(null)
      })
      .catch(err => setTasksError(err.message || 'Failed to load tasks'))
      .finally(() => setTasksLoading(false))
  }, [useTasksApi])

  const personaState = useMemo(() => personaOverrides[routePref] || [], [personaOverrides, routePref])
  const boardOwners = useMemo(() => {
    const unique = new Set(OWNER_SEQUENCE)
    tasks.forEach(task => {
      if (task.owner) unique.add(task.owner)
    })
    return Array.from(unique)
  }, [tasks])
  const wsRef = useRef(null)
  const reconnectRef = useRef()
  const scrollRef = useRef()
  const textareaRef = useRef()
  const reminderMapRef = useRef(new Map())
  const autoIntakeProcessedRef = useRef(new Set())

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
        if (payload && payload.type === 'task_event') {
          if (useTasksApi) refreshTasks()
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
  }, [refreshTasks, useTasksApi])

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
    if (useTasksApi) return
    persistTasks(tasks)
  }, [tasks, useTasksApi])

  useEffect(() => {
    if (useScheduleApi) return
    persistSchedule(schedule)
  }, [schedule, useScheduleApi])

  useEffect(() => {
    if (!useTasksApi) return undefined
    refreshTasks()
  }, [useTasksApi, refreshTasks])

  useEffect(() => {
    if (!useScheduleApi) return undefined
    let ignore = false
    setScheduleLoading(true)
    listSchedule()
      .then(items => {
        if (ignore) return
        if (Array.isArray(items) && items.length) {
          setSchedule(normalizeScheduleList(items))
          setScheduleError(null)
        }
      })
      .catch(error => {
        if (!ignore) {
          setScheduleError(error.message)
        }
      })
      .finally(() => {
        if (!ignore) setScheduleLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [useScheduleApi])

  useEffect(() => {
    if (!useIntelApi) return undefined
    let ignore = false
    let timer
    const load = () => {
      setOpsFeedLoading(true)
      fetchOpsFeed({ limit: 50 })
        .then(data => {
          if (ignore) return
          const mapped = Array.isArray(data)
            ? data.map(mapOpsFeedEntry).filter(Boolean)
            : []
          setOpsFeedData(mapped)
          setOpsFeedError(null)
        })
        .catch(error => {
          if (!ignore) {
            setOpsFeedError(error.message || 'Failed to load ops feed')
          }
        })
        .finally(() => {
          if (!ignore) {
            setOpsFeedLoading(false)
            timer = window.setTimeout(load, 30000)
          }
        })
    }
    load()
    return () => {
      ignore = true
      if (timer) window.clearTimeout(timer)
    }
  }, [useIntelApi])

  useEffect(() => {
    if (!useIntelApi) return undefined
    let ignore = false
    let timer
    const load = () => {
      setMemoryLoading(true)
      fetchMemoryStream({ limit: 20 })
        .then(data => {
          if (ignore) return
          const mapped = Array.isArray(data)
            ? data.map(mapMemoryEntry).filter(Boolean)
            : []
          setMemoryData(mapped)
          setMemoryError(null)
        })
        .catch(error => {
          if (!ignore) {
            setMemoryError(error.message || 'Failed to load memory stream')
          }
        })
        .finally(() => {
          if (!ignore) {
            setMemoryLoading(false)
            timer = window.setTimeout(load, 60000)
          }
        })
    }
    load()
    return () => {
      ignore = true
      if (timer) window.clearTimeout(timer)
    }
  }, [useIntelApi])

  useEffect(() => {
    if (!useIntelApi) return undefined
    let ignore = false
    const load = () => {
      setMemoryDocsLoading(true)
      fetchMemoryIndex({ limit: 200 })
        .then(data => {
          if (ignore) return
          setMemoryDocs(data.entries || [])
          setMemoryDocsError(null)
        })
        .catch(error => {
          if (!ignore) {
            setMemoryDocsError(error.message || 'Failed to load memory vault')
          }
        })
        .finally(() => {
          if (!ignore) {
            setMemoryDocsLoading(false)
          }
        })
    }
    load()
    return () => {
      ignore = true
    }
  }, [useIntelApi])

  useEffect(() => {
    const nextMap = new Map()
    const newAlerts = []
    tasks.forEach(task => {
      const meta = getSlaMeta(task)
      nextMap.set(task.id, meta.slaStatus)
      const previous = slaStatusRef.current.get(task.id) || 'ok'
      if (meta.slaStatus !== previous) {
        if (meta.slaStatus === 'warn' || meta.slaStatus === 'breach') {
          newAlerts.push({
            id: `sla-${task.id}-${meta.slaStatus}-${Date.now()}` ,
            title: `Task "${task.title}" SLA ${meta.slaStatus.toUpperCase()}` ,
            route: 'sla',
            status: meta.slaStatus === 'breach' ? 'error' : 'warn',
            duration: meta.elapsedMinutes != null ? `${Math.round(meta.elapsedMinutes)} min elapsed` : null,
            time: formatClockTime(Date.now()),
            sourceId: task.id
          })
        }
      }
    })
    slaStatusRef.current = nextMap
    if (newAlerts.length) {
      setSlaAlerts(prev => [...newAlerts, ...prev].slice(0, 50))
    }
  }, [tasks])

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
        headers: { 'Content-Type': 'application/json', ...NGROK_HEADER },
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

  const opsFeedEntries = useMemo(() => {
    const upstream = useIntelApi ? opsFeedData : OPS_FEED_BASE
    const staged = queue.map(entry => ({
      id: `queue-${entry.id}`,
      title: entry.text,
      route: entry.route,
      status: entry.status,
      duration: null,
      time: 'just now',
      sourceId: entry.id
    }))
    return [...slaAlerts, ...staged, ...upstream]
  }, [queue, opsFeedData, useIntelApi, slaAlerts])

  const memoryEntries = useMemo(() => (useIntelApi ? memoryData : MEMORY_STREAM_ENTRIES), [memoryData, useIntelApi])

  const calendarPreviewEntries = useMemo(() => {
    if (!schedule.length) return CALENDAR_SCHEDULE
    return schedule.slice(0, 8).map(item => {
      const date = item.datetime ? new Date(item.datetime) : null
      const validDate = date && !Number.isNaN(date.getTime())
      const day = validDate ? CALENDAR_DAYS[date.getDay()] : '—'
      const time = validDate
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—'
      const nextLabel = validDate
        ? `${day} • ${time}`
        : item.recurrence || 'Scheduled'
      return {
        id: item.id,
        label: item.title,
        day,
        time,
        color: getScheduleColorClass(item.agent),
        next: nextLabel
      }
    })
  }, [schedule])

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

  const getUpdateStamp = useCallback(
    () => new Date().toISOString(),
    []
  )

  const handleAddTask = useCallback(({ title, owner, description }) => {
    const trimmedTitle = title?.trim()
    if (!trimmedTitle) return
    const trimmedDescription = description?.trim() || undefined
    const resolvedOwner = owner && OWNER_SEQUENCE.includes(owner)
      ? owner
      : autoAssignOwner(`${trimmedTitle} ${trimmedDescription || ''}`)

    if (useTasksApi) {
      apiCreateTask({ title: trimmedTitle, description: trimmedDescription, owner: resolvedOwner })
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to create task'))
      return
    }

    const createdAt = new Date().toISOString()
    const entry = normalizeTask({
      id: crypto.randomUUID(),
      title: trimmedTitle,
      owner: resolvedOwner,
      status: 'backlog',
      description: trimmedDescription,
      createdAt,
      updatedAt: getUpdateStamp(),
      slaMinutes: getDefaultSlaMinutes('backlog'),
      readOnly: false,
      source: 'manual'
    })
    setTasks(prev => [entry, ...prev])
  }, [getUpdateStamp, useTasksApi, refreshTasks])


  const handleDeleteScheduleItem = useCallback(id => {
    const target = schedule.find(item => item.id === id)
    if (!target || target.readOnly) return
    const confirmDelete = typeof window !== 'undefined'
      ? window.confirm('Remove this calendar entry?')
      : true
    if (!confirmDelete) return
    if (useScheduleApi) {
      deleteScheduleItem(id)
        .then(() => {
          setSchedule(prev => prev.filter(item => item.id !== id))
          setScheduleError(null)
        })
        .catch(error => setScheduleError(error.message || 'Failed to delete entry'))
      return
    }
    setSchedule(prev => prev.filter(item => item.id !== id))
  }, [schedule, useScheduleApi])

  const handleAddScheduleItem = useCallback(({ title, agent, type, date, time, recurrence, notes }) => {
    const trimmedTitle = title?.trim()
    if (!trimmedTitle || !date) return
    const normalizedAgent = DEFAULT_AGENT_OPTIONS.includes(agent) ? agent : DEFAULT_AGENT_OPTIONS[0]
    const typeValues = SCHEDULE_TYPE_OPTIONS.map(option => option.value)
    const normalizedType = typeValues.includes(type) ? type : SCHEDULE_TYPE_OPTIONS[0]?.value || 'event'
    const timePart = time && time.length ? time : '09:00'
    const timestamp = (() => {
      const candidate = new Date(`${date}T${timePart}`)
      if (!Number.isNaN(candidate.getTime())) return candidate.toISOString()
      const fallback = new Date(date)
      return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString()
    })()
    const clientEntry = normalizeScheduleEvent({
      id: crypto.randomUUID(),
      title: trimmedTitle,
      agent: normalizedAgent,
      owner: normalizedAgent,
      type: normalizedType,
      datetime: timestamp,
      startAt: timestamp,
      recurrence: recurrence?.trim() || undefined,
      notes: notes?.trim() || undefined,
      createdBy: 'Iris',
      createdAt: new Date().toISOString(),
      readOnly: false,
      source: 'manual'
    })

    if (useScheduleApi) {
      const payload = {
        title: trimmedTitle,
        owner: normalizedAgent,
        startAt: timestamp,
        description: notes?.trim() || undefined,
        location: recurrence?.trim() || undefined
      }
      createScheduleItem(payload)
        .then(serverItem => {
          const normalized = serverItem ? normalizeScheduleEvent({ ...serverItem, type: normalizedType }) : clientEntry
          setSchedule(prev => [normalized, ...prev])
          setScheduleError(null)
        })
        .catch(error => {
          setScheduleError(error.message)
        })
      return
    }

    setSchedule(prev => [clientEntry, ...prev])
  }, [useScheduleApi])

  const handleEditScheduleItem = useCallback(id => {
    const target = schedule.find(item => item.id === id)
    if (!target || target.readOnly) return
    if (typeof window === 'undefined') return
    const promptValue = (label, fallback = '') => {
      const value = window.prompt(label, fallback)
      if (value === null) throw new Error('cancelled')
      return value.trim()
    }
    try {
      const nextTitle = promptValue('Update title', target.title)
      const baseDate = target.datetime ? new Date(target.datetime) : null
      const defaultDate = baseDate && !Number.isNaN(baseDate.getTime()) ? baseDate.toISOString().slice(0, 10) : ''
      const defaultTime = baseDate && !Number.isNaN(baseDate.getTime())
        ? baseDate.toISOString().slice(11, 16)
        : '09:00'
      const nextDate = promptValue('Update date (YYYY-MM-DD)', defaultDate)
      const nextTime = promptValue('Update time (HH:MM)', defaultTime)
      const nextAgent = promptValue(`Update owner (${DEFAULT_AGENT_OPTIONS.join(', ')})`, target.agent || target.owner)
      const typeLabels = SCHEDULE_TYPE_OPTIONS.map(option => option.value).join(', ')
      const nextType = promptValue(`Update type (${typeLabels})`, target.type || 'event')
      const nextRecurrence = promptValue('Update recurrence (optional)', target.recurrence || '')
      const nextNotes = promptValue('Update notes (optional)', target.notes || target.description || '')
      const normalizedAgent = DEFAULT_AGENT_OPTIONS.includes(nextAgent) ? nextAgent : DEFAULT_AGENT_OPTIONS[0]
      const normalizedType = SCHEDULE_TYPE_OPTIONS.some(option => option.value === nextType)
        ? nextType
        : SCHEDULE_TYPE_OPTIONS[0].value
      const timestamp = (() => {
        if (!nextDate) return target.datetime
        const candidate = new Date(`${nextDate}T${nextTime || '09:00'}`)
        return Number.isNaN(candidate.getTime()) ? target.datetime : candidate.toISOString()
      })()
      const updates = {
        title: nextTitle || target.title,
        agent: normalizedAgent,
        owner: normalizedAgent,
        type: normalizedType,
        datetime: timestamp,
        recurrence: nextRecurrence || undefined,
        notes: nextNotes || undefined
      }
      if (useScheduleApi) {
        const payload = {
          title: updates.title,
          owner: normalizedAgent,
          startAt: timestamp,
          description: nextNotes || null,
          location: nextRecurrence || null
        }
        updateScheduleItem(id, payload)
          .then(serverItem => {
            const normalized = serverItem
              ? normalizeScheduleEvent({ ...serverItem, type: normalizedType })
              : normalizeScheduleEvent({ ...target, ...updates })
            setSchedule(prev => prev.map(item => (item.id === id ? normalized : item)))
            setScheduleError(null)
          })
          .catch(error => setScheduleError(error.message || 'Failed to update entry'))
        return
      }
      setSchedule(prev => prev.map(item => (item.id === id ? normalizeScheduleEvent({ ...item, ...updates }) : item)))
    } catch {
      // user cancelled one of the prompts
    }
  }, [schedule, useScheduleApi])

  const handleAdvanceTask = useCallback(id => {
    const target = tasks.find(item => item.id === id)
    if (target?.readOnly) return
    if (useTasksApi) {
      apiAdvanceTask(id)
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to advance task'))
      return
    }
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task
      const currentIndex = STATUS_SEQUENCE.indexOf(task.status)
      const safeIndex = currentIndex === -1 ? 0 : currentIndex
      if (safeIndex >= STATUS_SEQUENCE.length - 1) return task
      const nextStatus = STATUS_SEQUENCE[safeIndex + 1]
      if (!nextStatus) return task
      return { ...task, status: nextStatus, updatedAt: getUpdateStamp() }
    }))
  }, [getUpdateStamp, useTasksApi, refreshTasks, tasks])

  const handleRewindTask = useCallback(id => {
    const target = tasks.find(item => item.id === id)
    if (target?.readOnly) return
    if (useTasksApi) {
      apiRewindTask(id)
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to rewind task'))
      return
    }
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task
      const currentIndex = STATUS_SEQUENCE.indexOf(task.status)
      const safeIndex = currentIndex === -1 ? 1 : currentIndex
      if (safeIndex <= 0) return task
      const nextStatus = STATUS_SEQUENCE[safeIndex - 1]
      return { ...task, status: nextStatus, updatedAt: getUpdateStamp() }
    }))
  }, [getUpdateStamp, useTasksApi, refreshTasks, tasks])

  const handleReassignTask = useCallback(id => {
    const task = tasks.find(item => item.id === id)
    if (task?.readOnly) return
    if (useTasksApi) {
      const currentIndex = task ? OWNER_SEQUENCE.indexOf(task.owner) : 0
      const safeIndex = currentIndex === -1 ? 0 : currentIndex
      const nextOwner = OWNER_SEQUENCE[(safeIndex + 1) % OWNER_SEQUENCE.length]
      apiReassignTask(id, nextOwner)
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to reassign task'))
      return
    }
    setTasks(prev => prev.map(item => {
      if (item.id !== id) return item
      const currentIndex = OWNER_SEQUENCE.indexOf(item.owner)
      const safeIndex = currentIndex === -1 ? 0 : currentIndex
      const nextOwner = OWNER_SEQUENCE[(safeIndex + 1) % OWNER_SEQUENCE.length]
      return { ...item, owner: nextOwner, updatedAt: getUpdateStamp() }
    }))
  }, [getUpdateStamp, useTasksApi, refreshTasks, tasks])

  const handleCompleteTask = useCallback(id => {
    const target = tasks.find(item => item.id === id)
    if (target?.readOnly) return
    if (useTasksApi) {
      apiCompleteTask(id)
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to complete task'))
      return
    }
    setTasks(prev => prev.map(task => (
      task.id === id ? { ...task, status: 'done', updatedAt: getUpdateStamp() } : task
    )))
  }, [getUpdateStamp, useTasksApi, refreshTasks, tasks])

  const handleDeleteTask = useCallback(id => {
    const confirmDelete = typeof window !== 'undefined'
      ? window.confirm('Delete this task?')
      : true
    if (!confirmDelete) return
    if (useTasksApi) {
      apiDeleteTask(id)
        .then(() => refreshTasks())
        .catch(err => setTasksError(err.message || 'Failed to delete task'))
      return
    }
    setTasks(prev => prev.filter(task => task.id !== id))
  }, [useTasksApi, refreshTasks])

  const handleNavigate = useCallback(view => {
    const allowed = ['dashboard', 'tasks', 'calendar', 'memory']
    setActiveView(allowed.includes(view) ? view : 'dashboard')
  }, [])

  const handlePersonaAdjust = (key, value) => {
    setPersonaOverrides(prev => {
      const current = prev[routePref] || []
      const updated = current.map(control => (control.key === key ? { ...control, value } : control))
      return { ...prev, [routePref]: updated }
    })
  }

  return (
    <div className={`app-shell ${hasEntered ? 'entered' : ''}`}>
      {!hasEntered && <LandingOverlay onEnter={handleEnterHub} />}
      <HeaderNav sections={NAV_SECTIONS} activeView={activeView} onNavigate={handleNavigate} />
      {activeView === 'dashboard' && (
        <>
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
          <AgentCarousel agents={AGENT_PROFILES} activeAgent={carouselAgent} routedAgent={routePref} onSelect={setCarouselAgent} />
          <div className="stack-hero" style={{ backgroundImage: `url(${heroHall})` }}>
            <div>
              <p className="eyebrow">Ops corridor</p>
              <strong>All systems awaiting directives</strong>
            </div>
          </div>
          <PersonaTuner personaState={personaState} agentId={routePref} onAdjust={handlePersonaAdjust} />
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
          <section className="intel-grid">
            <OpsFeed
              entries={opsFeedEntries}
              onComplete={handleCommandComplete}
              loading={opsFeedLoading}
              error={opsFeedError}
            />
            <MemoryStream
              entries={memoryEntries}
              loading={memoryLoading}
              error={memoryError}
            />
            <CalendarPreview schedule={calendarPreviewEntries} />
          </section>
        </div>
      </div>
        </>
      )}

      {activeView === 'tasks' && (
        <TaskBoardPage
          tasks={tasks}
          owners={boardOwners}
          autoArchiveDone={autoArchiveDone}
          onToggleAutoArchive={setAutoArchiveDone}
          onAddTask={handleAddTask}
          onAdvance={handleAdvanceTask}
          onRewind={handleRewindTask}
          onReassign={handleReassignTask}
          onComplete={handleCompleteTask}
          onDelete={handleDeleteTask}
          loading={tasksLoading}
          error={tasksError}
          onBack={() => handleNavigate('dashboard')}
        />
      )}

      {activeView === 'calendar' && (
        <CalendarPage
          schedule={schedule}
          agentOptions={DEFAULT_AGENT_OPTIONS}
          typeOptions={SCHEDULE_TYPE_OPTIONS}
          onAddItem={handleAddScheduleItem}
          onEditItem={handleEditScheduleItem}
          onDeleteItem={handleDeleteScheduleItem}
          onBack={() => handleNavigate('dashboard')}
        />
      )}

      {activeView === 'memory' && (
        <MemoryBoardPage
          entries={memoryDocs}
          loading={memoryDocsLoading}
          error={memoryDocsError}
          onSearch={query => fetchMemoryIndex({ q: query, limit: 200 }).then(data => setMemoryDocs(data.entries || [])).catch(err => setMemoryDocsError(err.message || 'Failed to load memory vault'))}
          onBack={() => handleNavigate('dashboard')}
        />
      )}
    </div>
  )
}

