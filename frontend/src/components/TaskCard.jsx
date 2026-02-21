import React from 'react'

const OWNER_CLASS_MAP = {
  Iris: 'owner-iris',
  Terrence: 'owner-terrence',
  Aster: 'owner-aster',
  Osiris: 'owner-osiris'
}

const STATUS_LABELS = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  review: 'Review',
  done: 'Done'
}

const ownerClass = owner => OWNER_CLASS_MAP[owner] || 'owner-iris'
const statusLabel = status => STATUS_LABELS[status] || 'Queued'

const TaskCard = ({ task, onAdvance, onRewind, onReassign }) => (
  <article className="task-card">
    <header>
      <div className="task-card-title">
        <strong>{task.title}</strong>
        <span className={`status-pill status-${task.status}`}>{statusLabel(task.status)}</span>
      </div>
      <span className={`owner-pill ${ownerClass(task.owner)}`}>{task.owner}</span>
    </header>
    {task.description && <p>{task.description}</p>}
    <footer>
      <span className="task-updated">{task.updatedAt ? `Updated ${task.updatedAt}` : 'New'}</span>
      <div className="task-actions">
        {onRewind && (
          <button type="button" onClick={() => onRewind(task.id)} aria-label="Move back">
            ←
          </button>
        )}
        {onAdvance && (
          <button type="button" onClick={() => onAdvance(task.id)} aria-label="Move forward">
            →
          </button>
        )}
        <button type="button" className="ghost" onClick={() => onReassign(task.id)}>
          Swap owner
        </button>
      </div>
    </footer>
  </article>
)

export default TaskCard
