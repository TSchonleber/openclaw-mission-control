import React from 'react'

const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CalendarPreview = ({ schedule }) => {
  return (
    <section className="panel calendar-preview">
      <div className="panel-header">
        <h2>Schedule</h2>
        <p>Recurring jobs + the next few beats.</p>
      </div>
      <div className="calendar-grid">
        {dayOrder.map(day => (
          <div key={day} className="calendar-column">
            <span className="calendar-day">{day}</span>
            <ul>
              {schedule.filter(item => item.day === day).map(item => (
                <li key={item.id} className={item.color}>
                  <strong>{item.label}</strong>
                  <span>{item.time}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="calendar-next">
        <h4>Next up</h4>
        <ul>
          {schedule
            .filter(item => item.next)
            .slice(0, 4)
            .map(item => (
              <li key={`${item.id}-next`}>
                <span>{item.label}</span>
                <time>{item.next}</time>
              </li>
            ))}
        </ul>
      </div>
    </section>
  )
}

export default CalendarPreview
