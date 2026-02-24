import React from 'react'

const TeamStructurePage = ({ onBack }) => {
  const coreLead = {
    name: 'Aster',
    title: 'Chief of Staff / Router',
    focus: 'Routes missions, sets priorities, keeps the crew aligned',
    tags: ['Orchestration', 'Routing', 'Priority']
  }

  const coreAgents = [
    { name: 'Iris', title: 'Backend / Integrations', focus: 'APIs, ingestion, reliability', tags: ['Backend', 'Data', 'Pipelines'] },
    { name: 'Nara', title: 'Frontend / UX', focus: 'Mission Control UI, flows, visuals', tags: ['UI', 'UX', 'Interface'] },
    { name: 'Osiris', title: 'Systems / Memory', focus: 'Memory pipelines, ops, tooling', tags: ['Memory', 'Ops', 'Systems'] }
  ]

  const metaAgent = {
    name: 'Codex',
    title: 'Lead Engineer',
    focus: 'Builds, fixes, automates, ships',
    tags: ['Code', 'Systems', 'Reliability']
  }

  const subAgents = [
    { name: 'Backend Fixer', title: 'API triage', focus: 'Patch server issues, migrations, reliability', tags: ['Backend', 'Reliability'] },
    { name: 'Frontend Builder', title: 'UI assembly', focus: 'Component builds, layout polish, responsiveness', tags: ['UI', 'UX'] },
    { name: 'Automation Engineer', title: 'Pipelines', focus: 'Cron jobs, ingest automation, release scripts', tags: ['Automation', 'Pipelines'] },
    { name: 'Spec Writer', title: 'Docs & contracts', focus: 'API docs, runbooks, specs', tags: ['Docs', 'Contracts'] },
    { name: 'UI Stylist', title: 'Visual polish', focus: 'Typography, spacing, tokens', tags: ['Design', 'Polish'] }
  ]

  return (
    <div className="team-structure-page team-hero">
      <header className="task-board-header">
        <div>
          <h1>Meet the Team</h1>
          <p>Core agents, their roles, and how work flows through Mission Control.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>

      <div className="team-flow">
        <section className="team-lead">
          <div className="team-card lead">
            <strong>{coreLead.name}</strong>
            <span>{coreLead.title}</span>
            <p>{coreLead.focus}</p>
            <div className="team-tags">
              {coreLead.tags.map(tag => (
                <span key={tag} className="pill subtle">{tag}</span>
              ))}
            </div>
          </div>
        </section>

        <div className="flow-divider">
          <span>INPUT SIGNAL → OUTPUT ACTION</span>
        </div>

        <section className="team-core">
          {coreAgents.map(agent => (
            <article key={agent.name} className="team-card">
              <strong>{agent.name}</strong>
              <span>{agent.title}</span>
              <p>{agent.focus}</p>
              <div className="team-tags">
                {agent.tags.map(tag => (
                  <span key={tag} className="pill subtle">{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="flow-divider">
          <span>META LAYER</span>
        </div>

        <section className="team-meta">
          <div className="team-card meta">
            <strong>{metaAgent.name}</strong>
            <span>{metaAgent.title}</span>
            <p>{metaAgent.focus}</p>
            <div className="team-tags">
              {metaAgent.tags.map(tag => (
                <span key={tag} className="pill subtle">{tag}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="team-subagents">
          <h4>Subagents</h4>
          <div className="team-subagent-grid">
            {subAgents.map(agent => (
              <article key={agent.name} className="team-card sub">
                <strong>{agent.name}</strong>
                <span>{agent.title}</span>
                <p>{agent.focus}</p>
                <div className="team-tags">
                  {agent.tags.map(tag => (
                    <span key={tag} className="pill subtle">{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default TeamStructurePage
