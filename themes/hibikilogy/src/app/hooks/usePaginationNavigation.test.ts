import type { RouteModel } from './types.ts'
import { effectScope } from '@vue/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { usePaginationNavigation } from './usePaginationNavigation.ts'

describe('usePaginationNavigation', () => {
  it('leaves feature-owned pagination events inside their boundary', () => {
    const navigate = vi.fn()
    const route = { navigate } as unknown as RouteModel
    const scope = effectScope()
    scope.run(() => usePaginationNavigation(route))

    const pagination = document.createElement('site-pagination')
    document.body.append(pagination)
    pagination.dispatchEvent(createPageChange('/page/2'))
    expect(navigate).toHaveBeenCalledWith('/page/2')

    const featureRoot = document.createElement('section')
    featureRoot.addEventListener('page-change', event => event.stopPropagation())
    featureRoot.append(pagination)
    pagination.dispatchEvent(createPageChange('/search?p=2'))
    expect(navigate).toHaveBeenCalledTimes(1)

    scope.stop()
    featureRoot.remove()
  })
})

function createPageChange(href: string): CustomEvent<{ href: string }> {
  return new CustomEvent('page-change', {
    bubbles: true,
    detail: { href },
  })
}
