import React from 'react'

const typeMap = {
  action: 'badge action',
  decision: 'badge decision',
  thought: 'badge subtle'
}

const MemoryStream = ({ entries, loading, error }) => (
  <section className="panel memory-stream">
    <div className="panel-header">
      <h2>Memory stream</h2>
      <p>Latest reflections promoted from the vault.</p>
    </div>
    {error && <p className="error-text">{error}</p>}
    <ul className="memory-stream-list">
      {loading && entries.length === 0 && <li className="ops-feed-empty">Fetching memories…</li>}
      {!loading && entries.length === 0 && <li className="ops-feed-empty">No memories captured yet.</li>}
      {entries.map(entry => (
        <li key={entry.id}>
          <div className="memory-stream-meta">
            <span className={typeMap[entry.type] || 'badge'}>{entry.type}</span>
            <time>{entry.time}</time>
          </div>
          <strong>{entry.title}</strong>
          <p>{entry.summary}</p>
        </li>
      ))}
    </ul>
  </section>
)

export default MemoryStream
