import React, { useMemo, useState } from 'react'
import { CALENDAR_DAYS } from '../config/scheduleConstants'
import { formatRelativeTime } from '../utils/time'

const formatTimeLabel = value => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatDateKey = date => date.toISOString().split('T')[0]

const startOfWeek = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const typeLabelFromValue = (value, options) => options.find(option => option.value === value)?.label || value

const DayEvents = ({ events, typeOptions, onDelete, onEdit }) => (
  <ul className="day-events">
    {events.length === 0 && <li className="calendar-empty">No items</li>}
    {events.map(item => {
      const owner = item.agent || item.owner || 'Unassigned'
      const eventType = item.type || 'event'
      const timestamp = item.datetime || item.startAt
      const isReadOnly = Boolean(item.readOnly)
      const sourceLabel = item.source ? `Synced from ${item.source}` : 'Synced event'
      return (
        <li key={item.id} className="day-event-row">
          <div>
            <strong>{item.title}</strong>
            <span>{owner} • {typeLabelFromValue(eventType, typeOptions)}</span>
            {isReadOnly && (<span className="pill source" title={sourceLabel}>Synced</span>)}
          </div>
          <div className="event-meta">
            <time>{formatTimeLabel(timestamp)}</time>
            {!isReadOnly && onEdit && (
              <button type="button" className="event-edit" onClick={() => onEdit(item.id)} aria-label="Edit event">
                ✎
              </button>
            )}
            {!isReadOnly && onDelete && (
              <button type="button" className="event-delete" onClick={() => onDelete(item.id)} aria-label="Delete event">
                🗑
              </button>
            )}
          </div>
        </li>
      )
    })}
  </ul>
)

const ScheduleComposer = ({ agents, typeOptions, onAdd }) => {
  const [title, setTitle] = useState('')
  const [agent, setAgent] = useState(() => agents[0] || 'Iris')
  const [type, setType] = useState(() => typeOptions[0]?.value || 'cron')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [recurrence, setRecurrence] = useState('')
  const [notes, setNotes] = useState('')

  const canSubmit = Boolean(title.trim() && date)

  const handleSubmit = event => {
    event.preventDefault()
    if (!canSubmit) return
    onAdd?.({ title: title.trim(), agent, type, date, time, recurrence, notes })
    setTitle('')
    setRecurrence('')
    setNotes('')
  }

  return (
    <form className="schedule-composer" onSubmit={handleSubmit}>
      <h3>Schedule a new item</h3>
      <label>
        <span>Title</span>
        <input type="text" value={title} placeholder="e.g. Ops stand-up" onChange={e => setTitle(e.target.value)} />
      </label>
      <label>
        <span>Agent</span>
        <select value={agent} onChange={e => setAgent(e.target.value)}>
          {agents.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Type</span>
        <select value={type} onChange={e => setType(e.target.value)}>
          {typeOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Date</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </label>
      <label>
        <span>Time</span>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} />
      </label>
      <label>
        <span>Recurrence</span>
        <input type="text" value={recurrence} placeholder="e.g. Weekly • Mon" onChange={e => setRecurrence(e.target.value)} />
      </label>
      <label>
        <span>Notes</span>
        <textarea value={notes} placeholder="Optional context" onChange={e => setNotes(e.target.value)} />
      </label>
      <button type="submit" disabled={!canSubmit}>Add to calendar</button>
    </form>
  )
}

const ScheduleFilters = ({ agentOptions, typeOptions, agentFilter, typeFilter, onAgentChange, onTypeChange }) => (
  <div className="calendar-filters">
    <div className="filter-group">
      <span>Agents</span>
      <div className="filter-buttons">
        {['All', ...agentOptions].map(option => (
          <button
            key={option}
            type="button"
            className={agentFilter === option ? 'active' : ''}
            onClick={() => onAgentChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
    <div className="filter-group">
      <span>Types</span>
      <div className="filter-buttons">
        {['All', ...typeOptions.map(option => option.label)].map(label => (
          <button
            key={label}
            type="button"
            className={typeFilter === label ? 'active' : ''}
            onClick={() => onTypeChange(label)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </div>
)

const CalendarPage = ({ schedule, agentOptions, typeOptions, onAddItem, onEditItem, onDeleteItem, onBack }) => {
  const [agentFilter, setAgentFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [viewMode, setViewMode] = useState('week')
  const [visibleDate, setVisibleDate] = useState(new Date())

  const filteredSchedule = useMemo(() => {
    return schedule.filter(item => {
      if (agentFilter !== 'All' && item.agent !== agentFilter) return false
      if (typeFilter !== 'All') {
        const filterValue = typeOptions.find(option => option.label === typeFilter)?.value || typeFilter
        if (item.type !== filterValue) return false
      }
      return true
    })
  }, [schedule, agentFilter, typeFilter, typeOptions])

  const eventsByDay = useMemo(() => {
    const map = {}
    filteredSchedule.forEach(item => {
      if (!item.datetime) return
      const date = new Date(item.datetime)
      if (Number.isNaN(date.getTime())) return
      const key = formatDateKey(date)
      map[key] = map[key] ? [...map[key], item] : [item]
    })
    return map
  }, [filteredSchedule])

  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return []
    const start = startOfWeek(visibleDate)
    return CALENDAR_DAYS.map((day, index) => {
      const date = addDays(start, index)
      const key = formatDateKey(date)
      return { day, date, key, events: eventsByDay[key] || [] }
    })
  }, [visibleDate, viewMode, eventsByDay])

  const monthDays = useMemo(() => {
    if (viewMode !== 'month') return []
    const firstOfMonth = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1)
    const gridStart = startOfWeek(firstOfMonth)
    const days = []
    for (let i = 0; i < 42; i += 1) {
      const date = addDays(gridStart, i)
      const key = formatDateKey(date)
      days.push({
        date,
        key,
        isCurrentMonth: date.getMonth() === visibleDate.getMonth(),
        events: eventsByDay[key] || []
      })
    }
    return days
  }, [visibleDate, viewMode, eventsByDay])

  const shiftBackward = () => {
    setVisibleDate(prev => (viewMode === 'month'
      ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      : addDays(prev, -7)))
  }

  const shiftForward = () => {
    setVisibleDate(prev => (viewMode === 'month'
      ? new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      : addDays(prev, 7)))
  }

  const jumpToday = () => setVisibleDate(new Date())

  const handleDeleteEvent = id => {
    if (!onDeleteItem) return
    onDeleteItem(id)
  }

  const visibleLabel = visibleDate.toLocaleString([], { month: 'long', year: 'numeric' })

  const upcoming = useMemo(() => {
    const dated = filteredSchedule.filter(item => item.datetime)
    const undated = filteredSchedule.filter(item => !item.datetime)
    const sorted = dated.sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    return [...sorted, ...undated].slice(0, 8)
  }, [filteredSchedule])

  const typeTallies = useMemo(() => {
    return typeOptions.map(option => ({
      label: option.label,
      count: filteredSchedule.filter(item => item.type === option.value).length
    }))
  }, [filteredSchedule, typeOptions])

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <div>
          <h1>Mission schedule</h1>
          <p>Every cron job, standing task, and reminder across the crew.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>

      <div className="calendar-controls">
        <div className="view-toggle">
          <button type="button" className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>Week</button>
          <button type="button" className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>Month</button>
        </div>
        <div className="nav-buttons">
          <button type="button" onClick={shiftBackward}>‹</button>
          <span>{visibleLabel}</span>
          <button type="button" onClick={shiftForward}>›</button>
          <button type="button" onClick={jumpToday}>Today</button>
        </div>
      </div>

      <div className="calendar-meta">
        {typeTallies.map(tally => (
          <span key={tally.label} className="task-pill">
            <strong>{tally.count}</strong> {tally.label}
          </span>
        ))}
      </div>

      <ScheduleFilters
        agentOptions={agentOptions}
        typeOptions={typeOptions}
        agentFilter={agentFilter}
        typeFilter={typeFilter}
        onAgentChange={setAgentFilter}
        onTypeChange={setTypeFilter}
      />

      {viewMode === 'week' ? (
        <div className="calendar-grid">
          {weekDays.map(day => (
            <div key={day.day} className="calendar-column">
              <span className="calendar-day">{day.day}</span>
              <DayEvents events={day.events} typeOptions={typeOptions} onEdit={onEditItem} onDelete={handleDeleteEvent} />
            </div>
          ))}
        </div>
      ) : (
        <div className="calendar-month-grid">
          {monthDays.map(day => (
            <div key={day.key} className={`month-cell ${day.isCurrentMonth ? '' : 'muted'}`}>
              <div className="month-cell-header">
                <span>{day.date.getDate()}</span>
              </div>
              <DayEvents events={day.events} typeOptions={typeOptions} onEdit={onEditItem} onDelete={handleDeleteEvent} />
            </div>
          ))}
        </div>
      )}

      <div className="calendar-sidebar">
        <div className="schedule-upcoming">
          <h3>Upcoming</h3>
          <ul>
            {upcoming.length === 0 && <li className="calendar-empty">No scheduled work.</li>}
            {upcoming.map(item => (
              <li key={`upcoming-${item.id}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.agent} • {typeLabelFromValue(item.type, typeOptions)}</span>
                </div>
                <div>
                  <time>{formatTimeLabel(item.datetime)}</time>
                  <small>{formatRelativeTime(item.datetime)}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ScheduleComposer agents={agentOptions} typeOptions={typeOptions} onAdd={onAddItem} />
      </div>
    </div>
  )
}

export default CalendarPage
