import React from 'react'

const TaskFilters = ({ owners = [], ownerFilter, onOwnerChange, search, onSearch }) => {
  const ownerOptions = owners.length ? owners : ['Iris', 'Terrence', 'Aster', 'Osiris']
  const filterOptions = ['All', ...ownerOptions]
  return (
    <div className="task-filters">
      <div className="filter-buttons">
        {filterOptions.map(option => (
          <button
            key={option}
            type="button"
            className={ownerFilter === option ? 'active' : ''}
            onClick={() => onOwnerChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="Search tasks"
        aria-label="Search tasks"
        value={search}
        onChange={event => onSearch(event.target.value)}
      />
    </div>
  )
}

export default TaskFilters
