export function stopPageEnter(root: HTMLElement = document.documentElement): void {
  root.removeAttribute('data-page-enter')
}

export function startPageEnter(root: HTMLElement = document.documentElement): void {
  root.dataset.pageEnter = 'navigation'
}
