declare module 'petite-vue' {
  interface PetiteVueApp {
    mount: (selector?: string | Element) => void
    unmount: () => void
  }

  export function createApp<T extends object>(initialData?: T): PetiteVueApp
  export function reactive<T extends object>(value: T): T
}
