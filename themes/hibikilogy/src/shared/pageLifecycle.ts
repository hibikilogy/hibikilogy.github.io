// Runs cleanup on the final page unload, not on bfcache round-trips.
export function onFinalPageHide(cleanup: () => void): void {
  window.addEventListener('pagehide', (event) => {
    if (event.persisted)
      return

    cleanup()
  })
}
