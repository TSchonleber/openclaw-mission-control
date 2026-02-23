import React, { useMemo, useState } from 'react'
import TaskColumn from './TaskColumn'
import TaskComposer from './TaskComposer'
import TaskFilters from './TaskFilters'
import { TASK_COLUMNS, getSlaMeta, DEFAULT_OWNERS } from '../config/taskConstants'

const TaskBoardPage = ({ tasks, owners, onAddTask, onAdvance, onRewind, onReassign, onComplete, onDelete, loading, error, onBack }) => {
  const ownerOptions = useMemo(() => (owners?.length ? owners : DEFAULT_OWNERS), [owners])
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [search, setSearch] = useState('')

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (ownerFilter !== 'All' && task.owner !== ownerFilter) return false
      if (search && !`${task.title} ${task.description || ''}`.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [tasks, ownerFilter, search])

  const columnStats = useMemo(() => {
    return TASK_COLUMNS.map(column => ({
      key: column.key,
      label: column.label,
      count: tasks.filter(task => task.status === column.key).length
    }))
  }, [tasks])

  const ownerStats = useMemo(() => {
    return ownerOptions.map(option => ({
      owner: option,
      count: tasks.filter(task => task.owner === option).length
    }))
  }, [ownerOptions, tasks])

  const blockedCount = useMemo(() => filteredTasks.filter(task => task.blockerFlag || task.blocker).length, [filteredTasks])
  const atRiskCount = useMemo(() => filteredTasks.filter(task => {
    const meta = getSlaMeta(task)
    return meta.slaStatus === 'warn' || meta.slaStatus === 'breach'
  }).length, [filteredTasks])

  return (
    <div className="task-board-page">
      <header className="task-board-header">
        <div>
          <h1>Mission tasks</h1>
          <p>Track everything the crew is actively moving across this sprint.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">Syncing tasks…</p>}
      <div className="task-board-meta">
        <div className="task-pill-group">
          {columnStats.map(stat => (
            <span key={stat.key} className="task-pill">
              <strong>{stat.count}</strong> {stat.label}
            </span>
          ))}
        </div>
        <div className="task-pill-group subtle">
          {ownerStats.map(stat => (
            <span key={stat.owner} className="task-pill">
              <strong>{stat.count}</strong> {stat.owner}
            </span>
          ))}
        </div>
        <div className="task-pill-group risk">
          <span className="task-pill">
            <strong>{blockedCount}</strong> Blocked
          </span>
          <span className="task-pill">
            <strong>{atRiskCount}</strong> At risk
          </span>
        </div>
      </div>
      <TaskComposer owners={ownerOptions} onAdd={onAddTask} />
      <TaskFilters
        owners={ownerOptions}
        ownerFilter={ownerFilter}
        onOwnerChange={setOwnerFilter}
        search={search}
        onSearch={setSearch}
      />
      <div className="task-board-columns">
        {TASK_COLUMNS.map((column, index) => (
          <TaskColumn
            key={column.key}
            title={column.label}
            tasks={filteredTasks.filter(task => task.status === column.key)}
            onAdvance={index === TASK_COLUMNS.length - 1 ? null : onAdvance}
            onRewind={index === 0 ? null : onRewind}
            onReassign={onReassign}
            onComplete={onComplete}
            onDelete={onDelete}
            emptyMessage={column.emptyCopy}
          />
        ))}
      </div>
    </div>
  )
}

export default TaskBoardPage
