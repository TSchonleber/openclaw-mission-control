import React, { useMemo, useState } from 'react'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'inflight', label: 'In-flight' },
  { value: 'errors', label: 'Errors' }
]

const STATUS_TONE = {
  staged: 'pill warn',
  dispatched: 'pill subtle',
  completed: 'pill good',
  error: 'pill error'
}

const STATUS_LABEL = {
  staged: 'Staged',
  dispatched: 'Dispatched',
  completed: 'Done',
  error: 'Error'
}

const formatTime = iso => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const formatLatency = entry => {
  if (typeof entry.latency_ms === 'number') return `${Math.round(entry.latency_ms)} ms`
  if (entry.ts_received && entry.ts_completed) {
    const delta = new Date(entry.ts_completed).getTime() - new Date(entry.ts_received).getTime()
    if (!Number.isNaN(delta) && delta >= 0) {
      return `${Math.round(delta)} ms`
    }
  }
  return '—'
}

const highlight = (text = '', query) => {
  if (!query) return text
  const regex = new RegExp(`(${query})`, 'ig')
  const parts = text.split(regex)
  return parts.map((chunk, idx) => (
    idx % 2 === 1
      ? <mark key={`${chunk}-${idx}`}>{chunk}</mark>
      : <React.Fragment key={`${chunk}-${idx}`}>{chunk}</React.Fragment>
  ))
}

const CommandLogPanel = ({
  entries,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  loading,
  error
}) => {
  const [expandedId, setExpandedId] = useState(null)

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (filter === 'inflight' && !(entry.status === 'staged' || entry.status === 'dispatched')) {
        return false
      }
      if (filter === 'errors' && entry.status !== 'error') {
        return false
      }
      if (search && !entry.text?.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [entries, filter, search])

  return (
    <div className="list-card command-log-panel">
      <div className="command-log-header">
        <div>
          <h4>Command log</h4>
          <span>{loading ? 'Syncing…' : `${entries.length} tracked`}</span>
        </div>
        <div className="log-filters">
          {FILTERS.map(option => (
            <button
              key={option.value}
              className={filter === option.value ? 'active' : ''}
              type="button"
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="log-search">
        <input
          type="search"
          placeholder="Search commands"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
        />
      </div>
      {error && <div className="log-error">{error}</div>}
      {!error && filteredEntries.length === 0 && (
        <div className="log-empty">{loading ? 'Loading command history…' : 'No matching commands yet.'}</div>
      )}
      <ul className="command-log-list">
        {filteredEntries.map(entry => {
          const isExpanded = expandedId === entry.id
          const pillClass = STATUS_TONE[entry.status] || 'pill subtle'
          return (
            <li key={entry.id}>
              <button className="log-row" type="button" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                <div>
                  <p>{highlight(entry.text || '—', search)}</p>
                  <div className="log-meta">
                    <span className="badge route">{(entry.route || entry.routeOverride || 'auto').toUpperCase()}</span>
                    <span className={pillClass}>{STATUS_LABEL[entry.status] || entry.status}</span>
                    <span>{formatTime(entry.ts_dispatched || entry.ts_received)}</span>
                  </div>
                </div>
                <span className="chevron" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </button>
              {isExpanded && (
                <div className="log-detail">
                  <div>
                    <strong>Model</strong>
                    <span>{entry.model || '—'}</span>
                  </div>
                  <div>
                    <strong>Latency</strong>
                    <span>{formatLatency(entry)}</span>
                  </div>
                  <div>
                    <strong>Started</strong>
                    <span>{formatTime(entry.ts_received)}</span>
                  </div>
                  <div>
                    <strong>Finished</strong>
                    <span>{formatTime(entry.ts_completed)}</span>
                  </div>
                  {entry.error && (
                    <div className="log-error-inline">
                      <strong>Error</strong>
                      <span>{entry.error}</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default CommandLogPanel
