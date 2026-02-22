import React, { useMemo, useState } from 'react'
import { CALENDAR_DAYS, getScheduleColorClass } from '../config/scheduleConstants'
import { formatRelativeTime } from '../utils/time'

const formatTimeLabel = value => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const getDayLabel = item => {
  if (item.dayHint && CALENDAR_DAYS.includes(item.dayHint)) return item.dayHint
  if (item.datetime) {
    const date = new Date(item.datetime)
    if (!Number.isNaN(date.getTime())) {
      return CALENDAR_DAYS[date.getDay()]
    }
  }
  return 'Sun'
}

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

const ScheduleFilters = ({ agentOptions, typeOptions, agentFilter, typeFilter, onAgentChange, onTypeChange }) => {
  return (
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
}

const typeLabelFromValue = (value, options) => options.find(option => option.value === value)?.label || value

const CalendarPage = ({ schedule, agentOptions, typeOptions, onAddItem, onBack }) => {
  const [agentFilter, setAgentFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

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

  const calendarMap = useMemo(() => {
    const base = {}
    CALENDAR_DAYS.forEach(day => { base[day] = [] })
    filteredSchedule.forEach(item => {
      const dayLabel = getDayLabel(item)
      if (!base[dayLabel]) base[dayLabel] = []
      base[dayLabel].push(item)
    })
    return base
  }, [filteredSchedule])

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

      <div className="calendar-layout">
        <section className="calendar-grid">
          {CALENDAR_DAYS.map(day => (
            <div key={day} className="calendar-column">
              <span className="calendar-day">{day}</span>
              <ul>
                {calendarMap[day].length === 0 && <li className="calendar-empty">No items</li>}
                {calendarMap[day].map(item => (
                  <li key={item.id} className={getScheduleColorClass(item.agent)}>
                    <strong>{item.title}</strong>
                    <span>{formatTimeLabel(item.datetime)} • {item.agent}</span>
                    <small>{typeLabelFromValue(item.type, typeOptions)}</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <aside className="calendar-sidebar">
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
        </aside>
      </div>
    </div>
  )
}

export default CalendarPage
