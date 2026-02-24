import React from 'react'

const OfficePage = ({ agents, subagents, activity, onBack }) => {
  const withStatus = list => list.map(agent => {
    const last = activity[agent.id]
    const active = last && Date.now() - last < 5 * 60 * 1000
    return { ...agent, status: active ? 'working' : 'idle' }
  })

  const core = withStatus(agents.filter(a => a.tier === 'core'))
  const subs = withStatus(subagents)

  return (
    <div className="office-page pixel-office">
      <header className="task-board-header">
        <div>
          <h1>The Office</h1>
          <p>Live pixel view of the crew at work.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>

      <div className="office-legend">
        <span className="legend working">Working</span>
        <span className="legend idle">Idle</span>
      </div>

      <div className="office-map">
        <div className="office-row private-row">
          {core.map(agent => (
            <div key={agent.id} className="private-office">
              <div className="office-door" />
              <div className="office-desk" />
              <div className={`agent-sprite ${agent.status}`}>
                <div className="sprite" />
                <span>{agent.name}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="office-props">
          <div className="prop watercooler" />
          <div className="prop plant" />
          <div className="prop table" />
        </div>

        <div className="office-row main-floor">
          {subs.map(agent => (
            <div key={agent.id} className="open-desk">
              <div className="desk" />
              <div className={`agent-sprite ${agent.status}`}>
                <div className="sprite" />
                <span>{agent.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default OfficePage
