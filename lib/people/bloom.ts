import type { Person } from './roster.js'

export type SourceStatus = 'ok' | 'auth_expired' | 'unavailable' | 'not_applicable'

export interface SourceResult<T> {
  status: SourceStatus
  data?: T
  hint?: string
}

export type SectionKey = 'goals' | 'career' | 'idp' | 'final' | 'recognition' | 'other'
export const SECTION_KEYS: readonly SectionKey[] = ['goals', 'career', 'idp', 'final', 'recognition', 'other']

export interface ItemResponse { author: string | null; reviewer: string | null; value: string }

export interface AppraisalItem {
  id: number
  title: string
  description: string | null
  label: string | null
  responses: ItemResponse[]
  actions: string[]
  notes: string[]
}

export interface AppraisalSection {
  key: SectionKey
  sectionId: number
  type: string
  title: string
  status: string | null
  items: AppraisalItem[]
  extra: string[] // top-level text fields we don't model (e.g. a summary comment)
}

export interface Appraisal {
  fy: string
  performanceId: number
  title: string
  employee: string | null
  progressStatus: string | null
  period: { start: string | null; end: string | null }
  sections: AppraisalSection[]
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; redirect: 'manual'; signal?: AbortSignal },
) => Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>

export const LOGIN_HINT =
  "interactive: ask the user to run '! nerv people login' (copy PHPSESSID from Chrome DevTools → Application → Cookies)"

const PREFIX: Record<string, string> = {
  question: 'question-sections',
  development: 'development-sections',
  summary: 'summary-sections',
  recommendation: 'recommendation-sections',
}

class AuthExpired extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function unwrap(v: unknown): unknown {
  return isObj(v) && 'data' in v && !('id' in v) ? v.data : v
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function nameOf(v: unknown): string | null {
  return str(v) ?? (isObj(v) ? str(v.fullName) ?? str(v.name) : null)
}

// Bloom's nested shapes vary; pull the first human-readable field.
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (isObj(v)) {
    for (const k of ['value', 'text', 'content', 'comment', 'title', 'description', 'name']) {
      const s = str(v[k])
      if (s) return s
    }
  }
  return JSON.stringify(v)
}

function list(v: unknown): unknown[] {
  const u = unwrap(v)
  if (Array.isArray(u)) return u
  if (isObj(u) && Array.isArray(u.items)) return u.items
  return []
}

function classify(type: string, title: string): SectionKey {
  if (type === 'question') return /goal/i.test(title) ? 'goals' : 'career'
  if (type === 'development') return 'idp'
  if (type === 'summary') return 'final'
  if (type === 'recommendation') return 'recognition'
  return 'other'
}

function mapItem(raw: unknown): Omit<AppraisalItem, 'notes'> {
  const o = isObj(raw) ? raw : {}
  return {
    id: Number(o.id),
    title: str(o.title) ?? '(untitled)',
    description: str(o.description),
    label: str(o.label) ?? (isObj(o.label) ? str(o.label.name) : null),
    responses: (Array.isArray(o.responses) ? o.responses : []).map(r => {
      const ro = isObj(r) ? r : {}
      return { author: nameOf(ro.author), reviewer: nameOf(ro.reviewer), value: textOf(ro.value ?? '') }
    }),
    actions: (Array.isArray(o.actions) ? o.actions : []).map(textOf),
  }
}

export async function fetchAppraisal(
  person: Person,
  opts: { baseUrl: string | null; session: string | null; fy: string; only?: SectionKey; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<SourceResult<Appraisal>> {
  const performanceId = person.bloom[opts.fy]
  if (!performanceId) {
    return {
      status: 'not_applicable',
      hint: `No ${opts.fy} Bloom appraisal for ${person.id}. If one exists, add "bloom": {"${opts.fy}": <performanceId>} to their entry in config/people.local.json.`,
    }
  }
  if (!opts.baseUrl) {
    return { status: 'unavailable', hint: 'Add "bloom": {"baseUrl": "https://…/performance/v1"} to config/people.local.json.' }
  }
  if (!opts.session) return { status: 'auth_expired', hint: LOGIN_HINT }

  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike)
  const root = `${opts.baseUrl}/performances/${performanceId}`
  const headers = { Cookie: `PHPSESSID=${opts.session}`, Accept: 'application/json' }

  async function get(path: string): Promise<unknown> {
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000)
    const res = await fetchImpl(`${root}${path}`, { headers, redirect: 'manual', signal })
    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) throw new AuthExpired()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new AuthExpired()
    return unwrap(await res.json())
  }

  // Notes are supplementary: one failing or id-less item must not sink the appraisal.
  async function fetchNotes(sectionId: number, itemId: number): Promise<string[]> {
    if (!Number.isFinite(itemId)) return []
    try {
      return list(await get(`/sections/${sectionId}/items/${itemId}/notes`)).map(textOf)
    } catch (e) {
      if (e instanceof AuthExpired) throw e
      return []
    }
  }

  try {
    const [overviewRaw, sectionsRaw] = await Promise.all([get(''), get('/sections')])
    const overview = isObj(overviewRaw) ? overviewRaw : {}
    const sectionList = list(sectionsRaw).filter(isObj)

    const wanted = sectionList.filter(s => {
      if (!opts.only) return true
      const type = String(s.type)
      // question sections need their title to classify; listed titles are used when present
      if (type === 'question' && !str(s.title)) return opts.only === 'goals' || opts.only === 'career'
      return classify(type, str(s.title) ?? '') === opts.only
    })

    const sections = await Promise.all(wanted.map(async (s): Promise<AppraisalSection> => {
      const sectionId = Number(s.id)
      const type = String(s.type)
      const prefix = PREFIX[type]
      const detail = prefix ? await get(`/${prefix}/${sectionId}`) : {}
      const d = isObj(detail) ? detail : {}
      const title = str(d.title) ?? str(s.title) ?? '(untitled section)'
      const baseItems = list(d.items).map(mapItem)
      const items = await Promise.all(baseItems.map(async item => ({
        ...item,
        notes: await fetchNotes(sectionId, item.id),
      })))
      const extra = Object.entries(d)
        .filter(([k, v]) => !['title', 'description', 'status', 'items', 'id', 'weight', 'performance', 'alerts'].includes(k) && str(v))
        .map(([k, v]) => `${k}: ${v}`)
      return { key: classify(type, title), sectionId, type, title, status: str(d.status), items, extra }
    }))

    const filtered = opts.only ? sections.filter(s => s.key === opts.only) : sections
    return {
      status: 'ok',
      data: {
        fy: opts.fy,
        performanceId,
        title: str(overview.title) ?? `${opts.fy} appraisal`,
        employee: nameOf(overview.employee),
        progressStatus: str(overview.progressStatus) ?? (isObj(overview.progressStatus) ? str(overview.progressStatus.name) : null),
        period: { start: str(overview.startDate), end: str(overview.endDate) },
        sections: filtered,
      },
    }
  } catch (e) {
    if (e instanceof AuthExpired) return { status: 'auth_expired', hint: LOGIN_HINT }
    const reason = (e as Error).name === 'TimeoutError' ? 'timed out' : (e as Error).message
    return { status: 'unavailable', hint: `Bloom request failed (${reason}). Check network/VPN and retry.` }
  }
}
