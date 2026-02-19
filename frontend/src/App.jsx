import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
const fallbackPort = protocol === 'wss' ? 443 : 8000
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL || `${protocol}://${host}:${import.meta.env.VITE_WS_PORT || fallbackPort}/ws`

const ROUTE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'chat', label: 'Chat only' },
  { value: 'codex', label: 'Codex only' }
]

const QUICK_PROMPTS = [
  {
    label: 'Status pulse',
    text: 'Give me a crisp status update on everything running right now.'
  },
  {
    label: 'Code diff',
    text: 'Draft the git diff summary for the latest frontend changes.'
  },
  {
    label: 'Persona tune',
    text: 'Refresh the persona blurb with three bullet improvements.'
  }
]

const STACK_SIGNALS = [
  { label: 'Frontend', value: '5180 / mobile-ready', tone: 'good', detail: 'Vite live on LAN' },
  { label: 'Backend', value: '8002 / uvicorn', tone: 'good', detail: 'Ready for websocket traffic' },
  { label: 'Codex router', value: 'idle', tone: 'warn', detail: 'Awaiting first route' },
  { label: 'LogKeeper', value: 'disabled', tone: 'idle', detail: 'Stream target TBD' }
]

const PersonaCard = () => (
  <div className="persona-card">
    <div className="persona-avatar">N</div>
    <div className="persona-details">
      <h3>Nara</h3>
      <span>Autonomous build assistant</span>
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

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [routePref, setRoutePref] = useState('auto')
  const [status, setStatus] = useState('connecting')
  const wsRef = useRef(null)
  const reconnectRef = useRef()
  const scrollRef = useRef()
  const textareaRef = useRef()

  const connect = useCallback(() => {
    try {
      if (wsRef.current) {
        wsRef.current.close()
      }
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

  const personaFacts = useMemo(
    () => [
      'Frontend priority: chat + logkeeper shell',
      'WebSocket handshake + Codex routing',
      'Push clean diffs to GitHub'
    ],
    []
  )

  const activityStream = useMemo(() => {
    if (!messages.length) {
      return [
        { title: 'Awaiting first command', meta: 'No user traffic yet', time: '—' },
        { title: 'Vite dev server up', meta: 'http://10.0.0.53:5180', time: 'live' }
      ]
    }
    return messages
      .slice(-4)
      .reverse()
      .map(msg => ({
        title: msg.role === 'user' ? 'User prompt' : 'Assistant response',
        meta: msg.content?.slice(0, 72) || 'payload',
        time: msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'
      }))
  }, [messages])

  const disabled = !input.trim() || status === 'error' || status === 'offline'

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <p>Nara Hub</p>
            <small>Direct ops console</small>
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
              <p>Send directives or drop into Codex mode on demand.</p>
            </div>
          </div>

          <div className="messages-scroll" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="message system">
                <div className="message-content">
                  Waiting for the backend… type a message or pick a quick prompt to wake the stack.
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
              placeholder="Type to command Codex, shift+enter for newline"
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
            <h2>Stack monitor</h2>
            <p>Live directives & activity feed</p>
          </div>

          <PersonaCard />

          <div className="list-card">
            <h4>Live directives</h4>
            <ul>
              {personaFacts.map(fact => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <div className="list-card">
            <h4>Recent activity</h4>
            <div className="activity-list">
              {activityStream.map(entry => (
                <ActivityItem key={`${entry.title}-${entry.time}`} entry={entry} />
              ))}
            </div>
          </div>

          <div className="list-card">
            <h4>Deployment checklist</h4>
            <ul>
              <li>Wire Codex router to backend WS</li>
              <li>Mount LogKeeper widget + stream</li>
              <li>Ship Vercel preview once UI passes review</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
