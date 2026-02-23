import React from 'react'
import { getOwnerClass, getStatusLabel, getSlaMeta, getTaskDeadline } from '../config/taskConstants'
import { formatUpdatedLabel } from '../utils/time'

const formatRemaining = minutes => {
  if (minutes == null) return null
  if (minutes <= 0) return 'Overdue'
  if (minutes >= 120) {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    if (mins > 0) return `${hours}h ${mins}m left`
    return `${hours}h left`
  }
  if (minutes === Infinity) return null
  return `${Math.max(1, Math.round(minutes))}m left`
}

const TaskCard = ({ task, onAdvance, onRewind, onReassign, onComplete, onDelete }) => {
  const ownerClass = getOwnerClass(task.owner)
  const statusCopy = getStatusLabel(task.status)
  const updatedLabel = formatUpdatedLabel(task.updatedAt)
  const isBlocker = Boolean(task.blocker || task.blockerFlag)
  const slaMeta = getSlaMeta(task)
  const hasSla = Boolean(slaMeta.slaMinutes)
  const remainingLabel = formatRemaining(slaMeta.remainingMinutes)
  const deadlineIso = getTaskDeadline(task)

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
              <span
                className={`pill sla sla-${slaMeta.slaStatus}`}
                title={deadlineIso ? `Due ${new Date(deadlineIso).toLocaleString()}` : 'SLA active'}
              >
                {remainingLabel || `SLA ${slaMeta.slaMinutes}m`}
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
          {onComplete && (
            <button
              type="button"
              className="ghost complete"
              onClick={() => onComplete(task.id)}
              title="Mark task complete"
              aria-label="Mark task complete"
            >
              ✓
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="ghost danger"
              onClick={() => onDelete(task.id)}
              title="Delete task"
              aria-label="Delete task"
            >
              🗑
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}

export default TaskCard
