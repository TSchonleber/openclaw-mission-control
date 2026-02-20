import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroConsole from './assets/hero-console.jpg'
import heroHall from './assets/hero-hall.jpg'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
const fallbackPort = protocol === 'wss' ? 443 : 8000
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL || `${protocol}://${host}:${import.meta.env.VITE_WS_PORT || fallbackPort}/ws`

const ROUTE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'chat', label: 'Chat' },
  { value: 'codex', label: 'Codex' }
]

const QUICK_PROMPTS = [
  { label: 'Pulse', text: 'Give me a crisp status report across all active systems.' },
  { label: 'Ship list', text: 'List what is production-ready and what needs polish.' },
  { label: 'Diff brief', text: 'Summarize the code changes since the last deploy.' }
]

const STACK_SIGNALS = [
  { label: 'Frontend', value: '5180 • online', tone: 'good', detail: 'Vite dev server' },
  { label: 'Backend', value: '8000 • listening', tone: 'good', detail: 'FastAPI + WS bridge' },
  { label: 'Codex router', value: 'idle', tone: 'warn', detail: 'Waiting for directives' },
  { label: 'LogKeeper', value: 'disconnected', tone: 'idle', detail: 'Hook stream to enable' }
]

const DEFAULT_DIRECTIVES = [
  'Ship the cyberpunk shell before sunrise',
  'Keep Codex reserved for heavy diffs',
  'LogKeeper widget must surface errors instantly'
]

const PersonaCard = ({ profile }) => (
  <div className="persona-card">
    <div className="persona-avatar">N</div>
    <div className="persona-details">
      <h3>Nara</h3>
      <span>{profile.tagline}</span>
      <div className="persona-tags">
        {profile.traits.map(trait => (
          <span key={trait}>{trait}</span>
        ))}
      </div>
    </div>
  </div>
)

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

const StatCard = ({ label, value, detail, tone }) => (
  <div className={`stat-card ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
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

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [routePref, setRoutePref] = useState('auto')
  const [status, setStatus] = useState('connecting')
  const [queue, setQueue] = useState([])
  const [newCommand, setNewCommand] = useState('')
  const [personaProfile, setPersonaProfile] = useState({
    tagline: 'Autonomous build siren',
    traits: ['seductive', 'cunning', 'financially wired']
  })
  const [personaControls, setPersonaControls] = useState([
    { key: 'seduction', label: 'Seduction', caption: 'Charm vs reserve', value: 78 },
    { key: 'cunning', label: 'Cunning', caption: 'Instinct vs planning', value: 82 },
    { key: 'ruthless', label: 'Ruthless', caption: 'Polish vs velocity', value: 64 }
  ])

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
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const sendMessage = useCallback(() => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const payload = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      ts: new Date().toISOString(),
      routeOverride: routePref
    }
    wsRef.current.send(JSON.stringify(payload))
    setMessages(prev => [...prev, payload])
    setInput('')
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

  const emptyConversation = messages.length === 0
  const disabled = !input.trim() || status === 'error' || status === 'offline'

  const heroCTA = () => handlePrompt(QUICK_PROMPTS[0].text)

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

  const handlePersonaAdjust = (key, value) => {
    setPersonaControls(prev => prev.map(control => (control.key === key ? { ...control, value } : control)))
  }

  return (
    <div className="app-shell">
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
            <select value={routePref} onChange={e => setRoutePref(e.target.value)}>
              {ROUTE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ConnectionPill status={status} />
        </div>
      </header>

      <section className="stat-grid">
        {STACK_SIGNALS.map(signal => (
          <StatCard key={signal.label} {...signal} />
        ))}
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
              <div className="conversation-hero" style={{ backgroundImage: `url(${heroConsole})` }}>
                <div className="hero-panel">
                  <p className="eyebrow">Command deck idle</p>
                  <h3>Drop a directive to wake the stack.</h3>
                  <p>Codex routes are standing by. Use a quick prompt or type freely.</p>
                  <button onClick={heroCTA}>Run quick pulse</button>
                </div>
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
            <div className="composer-footer">
              <div className="quick-actions">
                {QUICK_PROMPTS.map(prompt => (
                  <button key={prompt.label} onClick={() => handlePrompt(prompt.text)} disabled={status === 'error'}>
                    {prompt.label}
                  </button>
                ))}
              </div>
              <button className="send-button" disabled={disabled} onClick={sendMessage}>
                Dispatch
              </button>
            </div>
          </div>
        </main>

        <aside className="panel stack-panel">
          <div className="panel-header">
            <h2>Control tower</h2>
            <p>Live directives, queue, and persona tuning.</p>
          </div>
          <PersonaCard profile={personaProfile} />
          <div className="stack-hero" style={{ backgroundImage: `url(${heroHall})` }}>
            <div>
              <p className="eyebrow">Ops corridor</p>
              <strong>All systems awaiting directives</strong>
            </div>
          </div>
          <DirectiveList directives={DEFAULT_DIRECTIVES} />
          <PersonaTuner personaState={personaControls} onAdjust={handlePersonaAdjust} />
          <CommandQueue queue={queue} onComplete={handleCommandComplete} />

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
  )
}
