import React from 'react'

const OfficePage = ({ agents, onBack }) => (
  <div className="office-page">
    <header className="task-board-header">
      <div>
        <h1>Digital Office</h1>
        <p>Live status view of every agent workspace.</p>
      </div>
      <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
    </header>

    <div className="office-grid">
      {agents.map(agent => (
        <section key={agent.id} className={`office-card ${agent.status}`}>
          <div className="office-card-header">
            <img src={agent.avatar} alt={agent.name} className="office-avatar" />
            <div>
              <strong>{agent.name}</strong>
              <span>{agent.title}</span>
            </div>
            <span className={`status-pill ${agent.status}`}>{agent.status}</span>
          </div>
          <div className="office-workspace">
            <div className={`office-monitor ${agent.status}`} />
            <div className="office-desk" />
            <div className={`office-activity ${agent.status}`} />
          </div>
        </section>
      ))}
    </div>
  </div>
)

export default OfficePage
