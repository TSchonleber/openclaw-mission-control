#!/usr/bin/env node

/**
 * Auto-intake script
 * - pulls recent Ops Feed entries from the gateway
 * - classifies actionable items via simple heuristics
 * - auto-assigns owner and posts tasks to /mission/tasks
 * - records last processed timestamp in a state file
 */

const fs = require('fs')
const path = require('path')
const fetch = globalThis.fetch ?? require('node-fetch')

const STATE_PATH = path.join(__dirname, '.auto-intake-state.json')
const OPS_FEED_URL = process.env.AUTO_INTAKE_OPS_FEED_URL || 'http://127.0.0.1:18789/ops-feed?limit=50'
const TASKS_URL = process.env.AUTO_INTAKE_TASKS_URL || 'http://127.0.0.1:18789/mission/tasks'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.AUTO_INTAKE_TOKEN || ''

const OWNER_RULES = [
  { owner: 'Nara', keywords: ['ui', 'frontend', 'design', 'css', 'figma'] },
  { owner: 'Iris', keywords: ['api', 'backend', 'integration', 'cron', 'gateway', 'database'] },
  { owner: 'Aster', keywords: ['ops', 'plan', 'strategy', 'status', 'routing'] },
  { owner: 'Osiris', keywords: ['memory', 'vault', 'obsidian', 'docs', 'note'] }
]
const DEFAULT_OWNER = 'Iris'

const loadState = () => {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { lastTimestamp: 0, processedIds: [] }
  }
}

const saveState = state => {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

const autoAssignOwner = text => {
  if (!text) return DEFAULT_OWNER
  const normalized = text.toLowerCase()
  for (const rule of OWNER_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.owner
    }
  }
  return DEFAULT_OWNER
}

const isActionable = entry => {
  const haystack = `${entry.title || ''} ${entry.text || ''}`.toLowerCase()
  if (!haystack.trim()) return false
  const directiveVerbs = ['ship', 'build', 'fix', 'wire', 'document', 'prepare', 'route', 'draft']
  return directiveVerbs.some(v => haystack.includes(v))
}

async function main () {
  const state = loadState()
  const resp = await fetch(OPS_FEED_URL, {
    headers: GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {}
  })
  if (!resp.ok) {
    throw new Error(`Failed to fetch ops feed: ${resp.status}`)
  }
  const entries = await resp.json()
  const newEntries = entries
    .filter(e => (e.ts || e.time) && new Date(e.ts || e.time).getTime() > state.lastTimestamp)
    .sort((a, b) => new Date(a.ts || a.time) - new Date(b.ts || b.time))

  let maxTimestamp = state.lastTimestamp
  for (const entry of newEntries) {
    const ts = new Date(entry.ts || entry.time).getTime()
    if (ts > maxTimestamp) maxTimestamp = ts

    if (!isActionable(entry)) continue
    const title = entry.title || entry.text || 'New directive'
    const description = entry.text || entry.detail || ''
    const owner = autoAssignOwner(`${title} ${description}`)

    const payload = {
      title,
      description,
      owner,
      status: 'backlog',
      source: 'chat',
      sourceMeta: {
        feedId: entry.id,
        route: entry.route || entry.routeOverride || 'auto'
      }
    }

    const taskResp = await fetch(TASKS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {})
      },
      body: JSON.stringify(payload)
    })

    if (!taskResp.ok) {
      const text = await taskResp.text()
      console.error(`Failed to create task for entry ${entry.id}:`, text)
      continue
    }

    console.log(`Created task for entry ${entry.id}: ${title}`)
  }

  state.lastTimestamp = maxTimestamp
  saveState(state)
}

main().catch(err => {
  console.error('[auto-intake] error:', err)
  process.exit(1)
})
