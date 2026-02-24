import React from 'react'

const TeamStructurePage = ({ onBack }) => {
  const nodes = [
    {
      role: 'Core Agents',
      people: [
        { name: 'Iris', title: 'Backend / Integrations', focus: 'APIs, ingestion, reliability' },
        { name: 'Nara', title: 'Frontend / UX', focus: 'Mission Control UI, flows, visuals' },
        { name: 'Osiris', title: 'Systems / Memory', focus: 'Memory pipelines, ops, tooling' },
        { name: 'Aster', title: 'Front Door / Routing', focus: 'Agent routing, command queue' }
      ]
    },
    {
      role: 'Developers',
      people: [
        { name: 'Backend Fixer', title: 'API triage', focus: 'Patch server issues, logging, DB migrations' },
        { name: 'Frontend Builder', title: 'UI assembly', focus: 'Component builds, layout polish, responsiveness' },
        { name: 'Automation Engineer', title: 'Pipelines', focus: 'Cron jobs, ingest automation, release scripts' }
      ]
    },
    {
      role: 'Designers',
      people: [
        { name: 'UI Stylist', title: 'Visual polish', focus: 'Typography, spacing, tokens, gradients' },
        { name: 'Motion Designer', title: 'Interactions', focus: 'Micro-animations, transitions, feedback' }
      ]
    },
    {
      role: 'Writers',
      people: [
        { name: 'Spec Writer', title: 'Docs & contracts', focus: 'API docs, runbooks, specs' },
        { name: 'Narrative Writer', title: 'Story & tone', focus: 'Voice, prompts, onboarding copy' }
      ]
    }
  ]

  return (
    <div className="team-structure-page">
      <header className="task-board-header">
        <div>
          <h1>Team structure</h1>
          <p>Hierarchy of core agents and recurring subagents by role.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>

      <div className="team-grid">
        {nodes.map(group => (
          <section key={group.role} className="team-group">
            <h3>{group.role}</h3>
            <div className="team-cards">
              {group.people.map(person => (
                <article key={person.name} className="team-card">
                  <strong>{person.name}</strong>
                  <span>{person.title}</span>
                  <p>{person.focus}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default TeamStructurePage
