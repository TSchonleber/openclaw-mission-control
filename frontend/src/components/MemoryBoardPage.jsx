import React, { useMemo, useState } from 'react'

const MemoryBoardPage = ({ entries, loading, error, onSearch, onBack }) => {
  const [query, setQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('All')

  const agents = useMemo(() => {
    const unique = new Set(entries.map(entry => entry.agent || 'Unknown'))
    return ['All', ...Array.from(unique)]
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter(entry => {
      if (agentFilter !== 'All' && entry.agent !== agentFilter) return false
      if (!query) return true
      const blob = `${entry.title} ${entry.summary} ${entry.source}`.toLowerCase()
      return blob.includes(query.toLowerCase())
    })
  }, [entries, agentFilter, query])

  return (
    <div className="memory-board-page">
      <header className="task-board-header">
        <div>
          <h1>Memory vault</h1>
          <p>All memories, journals, and notes across agents.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">Syncing memories…</p>}
      <div className="memory-board-controls">
        <input
          type="search"
          placeholder="Search memories"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            onSearch?.(e.target.value)
          }}
        />
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
          {agents.map(agent => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>
      </div>
      <div className="memory-board-grid">
        {filtered.map(entry => (
          <article key={entry.id} className="memory-card">
            <div className="memory-card-meta">
              <span className="pill subtle">{entry.agent}</span>
              <span className="pill">{entry.source}</span>
            </div>
            <h3>{entry.title}</h3>
            <p>{entry.summary}</p>
            <code>{entry.path}</code>
          </article>
        ))}
      </div>
      {!loading && filtered.length === 0 && <p className="ops-feed-empty">No memories match that filter.</p>}
    </div>
  )
}

export default MemoryBoardPage
