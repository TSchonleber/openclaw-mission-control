import React from 'react'
import { getOwnerClass, getStatusLabel, getSlaMeta } from '../config/taskConstants'
import { formatUpdatedLabel } from '../utils/time'

const TaskCard = ({ task, onAdvance, onRewind, onReassign }) => {
  const ownerClass = getOwnerClass(task.owner)
  const statusCopy = getStatusLabel(task.status)
  const updatedLabel = formatUpdatedLabel(task.updatedAt)
  const isBlocker = Boolean(task.blocker || task.blockerFlag)
  const slaMeta = getSlaMeta(task)
  const hasSla = Boolean(slaMeta.slaMinutes)
  const remainingLabel = slaMeta.remainingMinutes != null
    ? `${Math.max(0, Math.round(slaMeta.remainingMinutes))}m left`
    : null

  const cardClass = `task-card sla-${slaMeta.slaStatus || 'ok'}`

  return (
    <article className={cardClass}>
      <header>
        <div className="task-card-title">
          <strong>{task.title}</strong>
          <div className="task-flags">
            <span className={`status-pill status-${task.status}`}>{statusCopy}</span>
            {isBlocker && (
              <span className="pill blocker" title={task.blockerReason || 'Flagged as blocker'}>
                Blocker
              </span>
            )}
            {hasSla && (
              <span className={`pill sla sla-${slaMeta.slaStatus}`} title={remainingLabel ?? 'SLA active'}>
                SLA {remainingLabel ?? `${slaMeta.slaMinutes}m`}
              </span>
            )}
          </div>
        </div>
        <span className={`owner-pill ${ownerClass}`}>{task.owner}</span>
      </header>
      {task.description && <p>{task.description}</p>}
      <footer>
        <span className="task-updated">{updatedLabel}</span>
        <div className="task-actions">
          {onRewind && (
            <button
              type="button"
              onClick={() => onRewind(task.id)}
              aria-label="Move task to previous column"
              title="Move task backward"
            >
              ←
            </button>
          )}
          {onAdvance && (
            <button
              type="button"
              onClick={() => onAdvance(task.id)}
              aria-label="Move task to next column"
              title="Move task forward"
            >
              →
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => onReassign(task.id)}
            title="Cycle owner"
          >
            Swap owner
          </button>
        </div>
      </footer>
    </article>
  )
}

export default TaskCard
