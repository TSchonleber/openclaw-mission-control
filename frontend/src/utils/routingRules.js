const ROUTING_RULES = [
  { owner: 'Nara', keywords: ['frontend', 'ui', 'design', 'figma', 'css'] },
  { owner: 'Iris', keywords: ['backend', 'api', 'integration', 'infra', 'server', 'gateway'] },
  { owner: 'Aster', keywords: ['ops', 'strategy', 'routing', 'command', 'mission'] },
  { owner: 'Osiris', keywords: ['memory', 'docs', 'note', 'archive', 'knowledge'] }
]

const DEFAULT_OWNER = 'Iris'

export const autoAssignOwner = text => {
  if (!text) return DEFAULT_OWNER
  const normalized = text.toLowerCase()
  const explicitMatch = normalized.match(/assign\s+to\s+([a-z]+)/)
  if (explicitMatch) {
    const name = explicitMatch[1]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.owner
    }
  }
  return DEFAULT_OWNER
}
