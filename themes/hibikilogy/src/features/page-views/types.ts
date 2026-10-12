export interface PageViewCounterOptions {
  /** 计数接口地址；为空表示未启用。 */
  readonly endpoint: string
  /** 生产站点基址；用于生成跨部署一致的计数键。 */
  readonly identityBase: string
}

/** 计数缓存与请求的唯一所有者，随 AppScope 存活。 */
export interface PageViewCounter {
  /** 同步读缓存，供切页时立刻上屏。 */
  peek: (pathname: string) => number | undefined
  /** 取最新计数；请求失败返回 null，缓存保持不变。 */
  load: (pathname: string) => Promise<number | null>
}

export interface PageViewMountOptions {
  readonly root: ParentNode
  readonly pathname: string
  readonly isActive: () => boolean
}
