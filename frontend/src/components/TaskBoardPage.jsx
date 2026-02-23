import React, { useMemo, useState } from 'react'
import TaskColumn from './TaskColumn'
import TaskComposer from './TaskComposer'
import TaskFilters from './TaskFilters'
import { TASK_COLUMNS, getSlaMeta, DEFAULT_OWNERS } from '../config/taskConstants'

const TaskBoardPage = ({ tasks, owners, autoArchiveDone, onToggleAutoArchive, onAddTask, onAdvance, onRewind, onReassign, onComplete, onDelete, loading, error, onBack }) => {

  const handleAutoArchiveToggle = event => {
    onToggleAutoArchive?.(event.target.checked)
  }
  const ownerOptions = useMemo(() => (owners?.length ? owners : DEFAULT_OWNERS), [owners])
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [search, setSearch] = useState('')

  const now = Date.now()
  const doneCutoffMs = 7 * 24 * 60 * 60 * 1000

  const displayTasks = useMemo(() => {
    return tasks.filter(task => {
      if (autoArchiveDone && task.status === 'done') {
        const updatedAt = task.updatedAt ? new Date(task.updatedAt).getTime() : null
        if (updatedAt && now - updatedAt > doneCutoffMs) return false
      }
      const hasNowTag = (task.tags || []).includes('now')
      if (task.status !== 'done' && !hasNowTag) return false
      return true
    })
  }, [tasks, autoArchiveDone, now])

  const unassignedTasks = useMemo(() => displayTasks.filter(task => task.owner === 'Unassigned'), [displayTasks])
  const activeTasks = useMemo(() => displayTasks.filter(task => task.owner !== 'Unassigned'), [displayTasks])

  const filteredTasks = useMemo(() => {
    const source = ownerFilter === 'Unassigned' ? unassignedTasks : activeTasks
    return source.filter(task => {
      if (ownerFilter !== 'All' && ownerFilter !== 'Unassigned' && task.owner !== ownerFilter) return false
      if (search && !`${task.title} ${task.description || ''}`.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [activeTasks, unassignedTasks, ownerFilter, search])

  const unassignedFiltered = useMemo(() => {
    if (ownerFilter !== 'All' && ownerFilter !== 'Unassigned') return []
    return unassignedTasks.filter(task => {
      if (search && !`${task.title} ${task.description || ''}`.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [unassignedTasks, ownerFilter, search])

  const columnStats = useMemo(() => {
    return TASK_COLUMNS.map(column => ({
      key: column.key,
      label: column.label,
      count: activeTasks.filter(task => task.status === column.key).length
    }))
  }, [activeTasks])

  const ownerStats = useMemo(() => {
    return ownerOptions.map(option => ({
      owner: option,
      count: displayTasks.filter(task => task.owner === option).length
    }))
  }, [ownerOptions, displayTasks])

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
      <div className="task-board-controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(autoArchiveDone)}
            onChange={handleAutoArchiveToggle}
          />
          <span>Auto-archive done tasks</span>
        </label>
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
