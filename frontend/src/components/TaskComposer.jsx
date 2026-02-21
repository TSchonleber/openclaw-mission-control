import React, { useEffect, useMemo, useState } from 'react'

const TaskComposer = ({ owners = [], onAdd }) => {
  const ownerOptions = useMemo(() => (owners.length ? owners : ['Iris', 'Terrence', 'Aster', 'Osiris']), [owners])
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState(() => ownerOptions[0] || 'Iris')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!ownerOptions.includes(owner)) {
      setOwner(ownerOptions[0] || 'Iris')
    }
  }, [ownerOptions, owner])

  const handleSubmit = event => {
    event.preventDefault()
    if (!title.trim()) return
    onAdd?.({ title: title.trim(), owner, description: description.trim() || undefined })
    setTitle('')
    setDescription('')
  }

  return (
    <form className="task-composer" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="New task title"
        value={title}
        onChange={event => setTitle(event.target.value)}
      />
      <select value={owner} onChange={event => setOwner(event.target.value)}>
        {ownerOptions.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <textarea
        placeholder="Optional description"
        value={description}
        onChange={event => setDescription(event.target.value)}
      />
      <button type="submit">Add task</button>
    </form>
  )
}

export default TaskComposer
