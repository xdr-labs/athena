import { describe, expect, test } from 'bun:test'
import { registerTools, WRITE_TOOL_NAMES } from './tools.ts'

function harness(scopes: string[]) {
  const registered = new Map<string, { config: any; handler: (args: any) => Promise<any> }>()
  const semanticCalls: any[] = []

  const server = {
    registerTool(name: string, config: any, handler: (args: any) => Promise<any>) {
      registered.set(name, { config, handler })
    },
  }

  const wiki = {
    searchPages: async () => [
      { path: 'projects/data-relay-link/fixed-tcp', title: 'Fixed TCP' },
      { path: 'projects/dp-os-upgrade/fixed-tcp', title: 'Other project' },
    ],
    listPages: async () => [],
  }

  const indexer = {
    search: async (query: string, limit: number, pathPrefix?: string) => {
      semanticCalls.push({ query, limit, pathPrefix })
      return [
        {
          page_path: 'projects/data-relay-link/fixed-tcp',
          page_title: 'Fixed TCP',
          content: 'service object subtype',
          score: 0.9,
        },
      ]
    },
  }
  const events = { record: async () => {} }
  const log = { warn: () => {}, error: () => {} }

  registerTools(server as never, {
    wiki: wiki as never,
    indexer: indexer as never,
    events: events as never,
    log: log as never,
    timeZone: 'UTC',
    currentActor: () => 'test',
    currentScopes: () => scopes,
  })

  return { registered, semanticCalls }
}

describe('MCP tool scopes', () => {
  test('read-only clients never receive mutating tools', () => {
    const { registered } = harness(['wiki.read'])
    expect(registered.has('search_knowledge')).toBe(true)
    expect(registered.has('get_page')).toBe(true)
    for (const name of WRITE_TOOL_NAMES) {
      expect(registered.has(name)).toBe(false)
    }
  })

  test('write-scoped clients receive mutating tools', () => {
    const { registered } = harness(['wiki.read', 'wiki.write'])
    for (const name of WRITE_TOOL_NAMES) {
      expect(registered.has(name)).toBe(true)
    }
  })
})
describe('project-scoped search', () => {
  test('path_prefix is exposed and forwarded to semantic search', async () => {
    const { registered, semanticCalls } = harness(['wiki.read'])
    const tool = registered.get('search_knowledge')!
    expect(tool.config.inputSchema.path_prefix).toBeDefined()

    const result = await tool.handler({
      query: 'fixed tcp',
      limit: 8,
      path_prefix: 'projects/data-relay-link',
    })

    expect(semanticCalls).toEqual([
      {
        query: 'fixed tcp',
        limit: 16,
        pathPrefix: 'projects/data-relay-link',
      },
    ])

    const payload = JSON.parse(result.content[0].text)
    expect(payload.length).toBe(1)
    expect(payload[0].pagePath).toBe('projects/data-relay-link/fixed-tcp')
  })
})
