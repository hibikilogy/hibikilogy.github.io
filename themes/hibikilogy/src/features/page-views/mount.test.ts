import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageViewCounter } from './counter.ts'
import { mountPageViews } from './mount.ts'

const PATH = '/articles/foo'

function createCounter() {
  return createPageViewCounter({
    endpoint: 'https://hub.example/api/reactions',
    identityBase: 'https://hibikilogy.github.io/',
  })
}

function mount(counter: ReturnType<typeof createCounter>, root: ParentNode, isActive = () => true) {
  mountPageViews(counter, { root, pathname: PATH, isActive })
}

function createRoot(html = '<footer><span data-page-views-value data-state="pending">—</span></footer>') {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

function response(viewCount: number): Response {
  return { ok: true, json: async () => ({ data: { reaction: { viewCount } } }) } as Response
}

function valueOf(root: ParentNode): HTMLElement {
  return root.querySelector<HTMLElement>('[data-page-views-value]')!
}

/** 让 fetch 的微任务链（catchAsyncError → then）跑完。 */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('mountPageViews', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('paints the cached count immediately, then reconciles with the fetched one', async () => {
    const counter = createCounter()
    let resolveFetch: (value: Response) => void = () => {}

    vi.stubGlobal('fetch', vi.fn(async () => response(10)))
    await counter.load(PATH)

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })))
    const root = createRoot()
    mount(counter, root)

    expect(valueOf(root).textContent).toBe('10')
    expect(valueOf(root).dataset.state).toBe('cached')

    resolveFetch(response(12))
    await vi.waitFor(() => expect(valueOf(root).textContent).toBe('12'))
    expect(valueOf(root).dataset.state).toBe('fresh')
  })

  it('keeps the placeholder until the first count arrives', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(4)))
    const root = createRoot()

    mount(createCounter(), root)

    expect(valueOf(root).textContent).toBe('—')
    await vi.waitFor(() => expect(valueOf(root).textContent).toBe('4'))
    expect(valueOf(root).dataset.state).toBe('fresh')
  })

  it('keeps the placeholder when the request fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline')
    })
    vi.stubGlobal('fetch', fetchMock)
    const root = createRoot()

    mount(createCounter(), root)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await settle()
    expect(valueOf(root).textContent).toBe('—')
    expect(valueOf(root).dataset.state).toBe('pending')
  })

  it('drops the fetched count when the page was already replaced', async () => {
    const fetchMock = vi.fn(async () => response(8))
    vi.stubGlobal('fetch', fetchMock)
    const root = createRoot()

    mount(createCounter(), root, () => false)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await settle()
    expect(valueOf(root).textContent).toBe('—')
    expect(valueOf(root).dataset.state).toBe('pending')
  })

  it('does nothing when the footer has no count element', () => {
    const fetchMock = vi.fn(async () => response(1))
    vi.stubGlobal('fetch', fetchMock)

    mount(createCounter(), createRoot('<footer></footer>'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
