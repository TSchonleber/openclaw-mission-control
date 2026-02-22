import React from 'react'
import TaskCard from './TaskCard'

const TaskColumn = ({ title, tasks, onAdvance, onRewind, onReassign, emptyMessage = 'No tasks here.' }) => (
  <section className="task-column">
    <div className="task-column-header">
      <h3>{title}</h3>
      <span>{tasks.length}</span>
    </div>
    <div className="task-column-body">
      {tasks.length === 0 && <p className="task-empty">{emptyMessage}</p>}
      {tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onAdvance={onAdvance}
          onRewind={onRewind}
          onReassign={onReassign}
        />
      ))}
    </div>
  </section>
)

export default TaskColumn
