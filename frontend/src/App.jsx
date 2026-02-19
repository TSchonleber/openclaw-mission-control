import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const DEFAULT_WS = import.meta.env.VITE_WS_URL || `ws://${host}:8000/ws`
const ROUTE_OPTIONS = [
  { value: 'auto', label: 'Auto route' },
  { value: 'chat', label: 'Force chat' },
  { value: 'codex', label: 'Force Codex' }
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

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [routePref, setRoutePref] = useState('auto')
  const [status, setStatus] = useState('connecting')
  const wsRef = useRef(null)
  const reconnectRef = useRef()
  const scrollRef = useRef()

  const connect = useCallback(() => {
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

  const personaFacts = useMemo(
    () => [
      'Frontend priority: chat+logkeeper UI',
      'WebSocket handshake + Codex routing',
      'Push clean diffs to GitHub'
    ],
    []
  )

  const disabled = !input.trim() || status === 'error' || status === 'offline'

  return (
    <div className="app-shell">
      <div className="panel header">
        <div className="header-title">
          <h1>Nara Hub — Live Chat</h1>
          <span>Cyberpunk control room for your agents</span>
        </div>
        <ConnectionPill status={status} />
      </div>

      <div className="dashboard-grid">
        <section className="panel chat-panel">
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
              placeholder="Type to command Codex, shift+enter for newline"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="composer-footer">
              <select className="route-select" value={routePref} onChange={e => setRoutePref(e.target.value)}>
                {ROUTE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button className="send-button" disabled={disabled} onClick={sendMessage}>
                Dispatch
              </button>
            </div>
          </div>
        </section>

        <aside className="panel persona-panel">
          <PersonaCard />
          <div>
            <h4>Live directives</h4>
            <ul>
              {personaFacts.map(fact => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Quick prompts</h4>
            <div className="quick-actions">
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt.label} onClick={() => setInput(prompt.text)} disabled={status === 'error'}>
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
