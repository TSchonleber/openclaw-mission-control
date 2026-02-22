import React from 'react'

const STATUS_STYLES = {
  staged: 'pill subtle',
  dispatched: 'pill warn',
  completed: 'pill good',
  error: 'pill error'
}

const OpsFeed = ({ entries, onComplete, loading, error }) => (
  <section className="panel ops-feed">
    <div className="panel-header">
      <h2>Ops feed</h2>
      <p>Commands and runs flowing through the stack.</p>
    </div>
    {error && <p className="error-text">{error}</p>}
    <ul className="ops-feed-list">
      {loading && entries.length === 0 && (
        <li className="ops-feed-empty">Syncing telemetry…</li>
      )}
      {!loading && entries.length === 0 && (
        <li className="ops-feed-empty">Waiting for the next run…</li>
      )}
      {entries.map(entry => (
        <li key={entry.id} className="ops-feed-row">
          <div>
            <p>{entry.title}</p>
            <div className="log-meta">
              <span className="badge route">{entry.route?.toUpperCase?.() || 'AUTO'}</span>
              <span className={STATUS_STYLES[entry.status] || 'pill subtle'}>{entry.status}</span>
              {entry.duration && <span>{entry.duration}</span>}
              <span>{entry.time}</span>
            </div>
          </div>
          {entry.status === 'staged' && entry.sourceId && (
            <button type="button" onClick={() => onComplete?.(entry.sourceId)}>
              complete
            </button>
          )}
        </li>
      ))}
    </ul>
  </section>
)

export default OpsFeed
