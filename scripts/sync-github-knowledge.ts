import { PageNotFoundError, WikiClient, normalizePath } from '../packages/core/src/index.ts'

export type KnowledgeSource = {
  project: string
  title: string
  repository: string
  ref: string
  source_path: string
  wiki_path: string
}

export type KnowledgeConfig = {
  sources: KnowledgeSource[]
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export function validateSource(source: KnowledgeSource): void {
  if (!REPO_RE.test(source.repository)) throw new Error(`invalid repository: ${source.repository}`)
  if (!source.ref.trim()) throw new Error('ref is required')
  if (!source.source_path.trim() || source.source_path.startsWith('/') || source.source_path.includes('..')) {
    throw new Error(`invalid source_path: ${source.source_path}`)
  }
  const wikiPath = normalizePath(source.wiki_path)
  if (!wikiPath || !wikiPath.startsWith('projects/')) {
    throw new Error(`wiki_path must live under projects/: ${source.wiki_path}`)
  }
}
export function renderSourcePage(source: KnowledgeSource, body: string, sha: string): string {
  return [
    '> [!IMPORTANT]',
    '> **Derived knowledge. Do not edit this page manually.**',
    '> GitHub/OpenSpec remains authoritative; this page is replaced by the sync job.',
    '',
    '## Source',
    '',
    `- Project: **${source.project}**`,
    `- Repository: \`${source.repository}\``,
    `- Ref: \`${source.ref}\``,
    `- Source path: \`${source.source_path}\``,
    `- Git blob SHA: \`${sha}\``,
    '',
    '---',
    '',
    body.trim(),
    '',
  ].join('\n')
}

async function fetchGitHubFile(source: KnowledgeSource): Promise<{ content: string; sha: string }> {
  validateSource(source)
  const url =
    `https://api.github.com/repos/${source.repository}/contents/` +
    `${source.source_path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(source.ref)}`
  const token = process.env.GITHUB_TOKEN?.trim()
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'athena-knowledge-sync',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`GitHub ${source.repository}@${source.ref} returned HTTP ${response.status}`)
  }
  const payload = (await response.json()) as {
    type?: string
    encoding?: string
    content?: string
    sha?: string
  }
  if (payload.type !== 'file' || payload.encoding !== 'base64' || !payload.content || !payload.sha) {
    throw new Error(`GitHub returned an unsupported content payload for ${source.repository}`)
  }
  return {
    content: Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8'),
    sha: payload.sha,
  }
}

async function reindex(indexerUrl: string | undefined, path: string): Promise<void> {
  if (!indexerUrl) return
  const response = await fetch(`${indexerUrl.replace(/\/+$/, '')}/reindex`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) throw new Error(`indexer reindex returned HTTP ${response.status}`)
}

export async function syncSource(
  wiki: WikiClient,
  source: KnowledgeSource,
  indexerUrl?: string,
): Promise<'CREATED' | 'UPDATED' | 'UNCHANGED'> {
  const fetched = await fetchGitHubFile(source)
  const path = normalizePath(source.wiki_path)
  const rendered = renderSourcePage(source, fetched.content, fetched.sha)

  let current: Awaited<ReturnType<WikiClient['getPage']>> | null = null
  try {
    current = await wiki.getPage(path)
  } catch (error) {
    if (!(error instanceof PageNotFoundError)) throw error
  }

  if (!current) {
    const page = await wiki.createPage({
      path,
      title: source.title,
      content: rendered,
      description: `Canonical knowledge projection for ${source.project}`,
      tags: ['canonical', 'github-sync', source.project],
    })
    await reindex(indexerUrl, page.path)
    return 'CREATED'
  }

  if (current.content === rendered && current.title === source.title) return 'UNCHANGED'

  const page = await wiki.updatePage({ path, title: source.title, content: rendered })
  await reindex(indexerUrl, page.path)
  return 'UPDATED'
}

async function loadConfig(path: string): Promise<KnowledgeConfig> {
  const raw = await Bun.file(path).text()
  const parsed = JSON.parse(raw) as KnowledgeConfig
  if (!Array.isArray(parsed.sources) || !parsed.sources.length) {
    throw new Error('knowledge config must contain at least one source')
  }
  for (const source of parsed.sources) validateSource(source)
  return parsed
}
async function main(): Promise<void> {
  const wikiUrl = process.env.WIKI_URL?.trim()
  const wikiApiToken = process.env.WIKI_API_TOKEN?.trim()
  if (!wikiUrl || !wikiApiToken) throw new Error('WIKI_URL and WIKI_API_TOKEN are required')

  const configPath = process.env.KNOWLEDGE_SOURCES_FILE || 'knowledge-sources.json'
  const config = await loadConfig(configPath)
  const wiki = new WikiClient({
    baseUrl: wikiUrl,
    token: wikiApiToken,
    locale: process.env.WIKI_LOCALE || 'en',
  })
  const indexerUrl = process.env.INDEXER_URL?.trim()

  let failed = 0
  for (const source of config.sources) {
    try {
      const status = await syncSource(wiki, source, indexerUrl)
      console.log(`SYNC project=${source.project} status=${status} path=${normalizePath(source.wiki_path)}`)
    } catch (error) {
      failed += 1
      console.error(
        `SYNC project=${source.project} status=FAIL error=${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  if (failed) process.exitCode = 1
}

if (import.meta.main) await main()
