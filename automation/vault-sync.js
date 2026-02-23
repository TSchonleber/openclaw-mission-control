#!/usr/bin/env node

/**
 * vault-sync.js
 *
 * 1. Walks Markdown files in the Obsidian vault
 * 2. Parses checkbox tasks with metadata (owner=, due=)
 * 3. Syncs them to /mission/tasks and /mission/schedule
 * 4. Writes back completions to the vault when the task is done in Mission Control
 */

const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const fetch = globalThis.fetch ?? require('node-fetch')

const VAULT_PATH = process.env.VAULT_PATH || path.join(process.env.HOME || '~', 'Documents', 'Agent Memory')
const TASKS_URL = process.env.VAULT_SYNC_TASKS_URL || 'http://127.0.0.1:18789/mission/tasks'
const SCHEDULE_URL = process.env.VAULT_SYNC_SCHEDULE_URL || 'http://127.0.0.1:18789/mission/schedule'
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.VAULT_SYNC_TOKEN || ''
const DEFAULT_OWNER = 'Iris'
const DATE_LABEL = new Intl.DateTimeFormat('en-CA')

const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}

const walkFiles = async dir => {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

const parseTasksFromFile = async absolutePath => {
  const relPath = path.relative(VAULT_PATH, absolutePath)
  const content = await fsp.readFile(absolutePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const tasks = []
  lines.forEach((line, index) => {
    const match = line.match(/^\s*- \[( |x|X)\]\s+(.*)$/)
    if (!match) return
    const checked = match[1].toLowerCase() === 'x'
    const rest = match[2]
    const metaMatches = [...rest.matchAll(/(\w+)=([^\s]+)/g)]
    const meta = {}
    let cleaned = rest
    metaMatches.forEach(m => {
      meta[m[1].toLowerCase()] = m[2]
      cleaned = cleaned.replace(m[0], '').trim()
    })
    tasks.push({
      vaultId: `${relPath}:${index + 1}`,
      file: absolutePath,
      lineIndex: index,
      title: cleaned.trim() || rest.trim(),
      owner: meta.owner || DEFAULT_OWNER,
      due: meta.due || null,
      rawLine: line,
      checked
    })
  })
  return { tasks, lines }
}

const fetchTasks = async () => {
  const resp = await fetch(TASKS_URL, { headers })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `Failed to fetch tasks: ${resp.status}`)
  }
  const bodyText = await resp.text()
  try {
    return JSON.parse(bodyText)
  } catch (err) {
    throw new Error(`Failed to parse tasks JSON: ${err.message}`)
  }
}

const updateTask = async (id, body) => {
  const resp = await fetch(`${TASKS_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  if (!resp.ok) {
    const text = await resp.text()
    console.error(`Failed to update task ${id}:`, text)
  }
}

const createTask = async payload => {
  const resp = await fetch(TASKS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `Failed to create task (${resp.status})`)
  }
  return resp.json()
}

const ensureScheduleEntry = async (taskId, taskData) => {
  if (!taskData.due) return
  const parsed = Date.parse(taskData.due)
  if (Number.isNaN(parsed)) return
  const payload = {
    title: taskData.title,
    agent: taskData.owner,
    type: 'task',
    datetime: new Date(parsed).toISOString(),
    recurrence: null,
    notes: `Vault: ${taskData.vaultId}`,
    metadata: { vaultId: taskData.vaultId, taskId }
  }
  const resp = await fetch(SCHEDULE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  })
  if (!resp.ok) {
    const text = await resp.text()
    console.error(`Failed to sync schedule for ${taskId}:`, text)
  }
}

async function main () {
  if (!fs.existsSync(VAULT_PATH)) throw new Error(`Vault path not found: ${VAULT_PATH}`)

  const files = await walkFiles(VAULT_PATH)
  const vaultTasks = new Map()
  const fileCache = {}

  for (const file of files) {
    const { tasks, lines } = await parseTasksFromFile(file)
    if (tasks.length) fileCache[file] = { lines, dirty: false }
    tasks.forEach(task => {
      vaultTasks.set(task.vaultId, task)
    })
  }

  const existingTasks = await fetchTasks()
  const vaultBacklog = Array.from(vaultTasks.values())
  const existingByVault = new Map()

  existingTasks.forEach(task => {
    const vaultId = task.sourceMeta?.vaultId
    if (vaultId) existingByVault.set(vaultId, task)
  })

  // Create or update tasks
  for (const parsed of vaultBacklog) {
    const existing = existingByVault.get(parsed.vaultId)
    if (!existing) {
      const payload = {
        title: parsed.title,
        description: `From vault: ${parsed.vaultId}`,
        owner: parsed.owner || DEFAULT_OWNER,
        status: parsed.checked ? 'done' : 'backlog',
        source: 'vault',
        sourceMeta: { vaultId: parsed.vaultId }
      }
      const task = await createTask(payload)
      console.log(`Created task from ${parsed.vaultId}`)
      await ensureScheduleEntry(task.id, parsed)
    } else {
      const updates = {}
      if (existing.owner !== parsed.owner) updates.owner = parsed.owner
      if ((existing.sourceMeta?.vaultId || '') !== parsed.vaultId) {
        updates.sourceMeta = { ...existing.sourceMeta, vaultId: parsed.vaultId }
      }
      if (parsed.checked && existing.status !== 'done') {
        updates.status = 'done'
      }
      if (!parsed.checked && existing.status === 'done') {
        updates.status = 'backlog'
      }
      if (Object.keys(updates).length) {
        await updateTask(existing.id, updates)
        console.log(`Updated task ${existing.id} from ${parsed.vaultId}`)
      }
      await ensureScheduleEntry(existing.id, parsed)
    }
  }

  // Write back completions
  existingTasks
    .filter(task => task.status === 'done' && task.sourceMeta?.vaultId)
    .forEach(task => {
      const [relPath] = task.sourceMeta.vaultId.split(':')
      const absolute = path.join(VAULT_PATH, relPath)
      if (!fileCache[absolute]) return
      const { lines } = fileCache[absolute]
      const lineNumber = Number(task.sourceMeta.vaultId.split(':')[1]) - 1
      if (!Number.isNaN(lineNumber) && lines[lineNumber] && !lines[lineNumber].includes('[x]')) {
        const stamp = DATE_LABEL.format(new Date())
        lines[lineNumber] = lines[lineNumber].replace('[ ]', '[x]') + ` (done @ ${stamp})`
        fileCache[absolute].dirty = true
      }
    })

  await Promise.all(Object.entries(fileCache).map(async ([file, data]) => {
    if (data.dirty) {
      await fsp.writeFile(file, data.lines.join('\n'), 'utf8')
      console.log(`Updated ${file}`)
    }
  }))
}

main().catch(err => {
  console.error('[vault-sync] error:', err)
  process.exit(1)
})
