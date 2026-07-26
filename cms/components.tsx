// Presentational components mirroring the stable Zola DOM contracts.
import type { MouseEvent, ReactNode, SyntheticEvent } from 'react'
import { h } from './runtime'
import { DEFAULT_COVER, formatDate, getDomain, normalizeExternalUrl } from './shared'

interface PreviewPageProps {
  hero: ReactNode
  body?: ReactNode
  hasAside?: boolean
}

export function PreviewPage({ hero, body, hasAside = false }: PreviewPageProps) {
  return (
    <div id="app">
      <div className="Layout">
        {hero}
        {body && (
          <div className="PageFrame">
            <div className="PageMain">
              <main className={`Content${hasAside ? ' has-aside' : ''}`}>
                <div className="container">
                  <div className="content">
                    <section className="content-container">{body}</section>
                  </div>
                </div>
              </main>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function SimpleHero({ title }: { title: string }) {
  return (
    <header className="Hero no-cover">
      <div className="container">
        <div className="taxonomies-banner">
          <div className="taxonomies-meta">
            <h2 className="title"><span className="banner-title">{title}</span></h2>
          </div>
        </div>
      </div>
    </header>
  )
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length)
    return null

  return (
    <div className="post-heading-tags TagsList">
      {tags.map(tag => (
        <a className="joh-tag" href="#" title={tag} key={tag} onClick={preventNavigation}>
          <span>{tag}</span>
        </a>
      ))}
    </div>
  )
}

function Authors({ authors }: { authors: string[] }) {
  return (
    <span className="article-authors">
      <span className="author-title">作者</span>
      {authors.length
        ? authors.map((name, index) => (
            <span key={name}>
              {index > 0 && <span className="author-separator">、</span>}
              <a className="article-author" href="#" onClick={preventNavigation}>
                <span className="author-name font-bold">{name}</span>
              </a>
            </span>
          ))
        : <span className="author-name font-bold">京吹学报</span>}
    </span>
  )
}

interface PostHeroProps {
  title: string
  description: string
  date: string
  cover: string
  coverAlt: string
  authors: string[]
  tags: string[]
}

export function PostHero({ title, description, date, cover, coverAlt, authors, tags }: PostHeroProps) {
  const hasCustomCover = Boolean(cover && cover !== DEFAULT_COVER)

  return (
    <header className={`Hero ${hasCustomCover ? 'has-cover' : 'no-cover'}`}>
      <div className="container">
        <div className="post-heading">
          <img
            className={`article-cover${hasCustomCover ? '' : ' default-bg'}`}
            src={cover || DEFAULT_COVER}
            alt={coverAlt || title}
            onError={handleCoverError}
          />
          <div className="post-heading-gradient-overlay" />
          <div className="post-heading-dark-overlay" />
          <div className="post-heading-info">
            <div className="post-heading-info-container">
              <Tags tags={tags} />
              <h1 className="post-heading-title text-pretty">
                <span className="PostTitleTransition">{title}</span>
              </h1>
              {description && <p className="post-heading-subtitle">{description}</p>}
              <div className="post-heading-meta">
                <time className="article-publish-date" dateTime={date}>发布于 {formatDate(date)}</time>
                <Authors authors={authors} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

interface AuthorHeroProps {
  title: string
  bio: string
  avatar: string
  link: string
}

export function AuthorHero({ title, bio, avatar, link }: AuthorHeroProps) {
  const href = normalizeExternalUrl(link)
  const domain = getDomain(link)

  return (
    <header className="Hero no-cover">
      <div className="container">
        <div className="author-profile-banner">
          {avatar && (
            <img
              className="author-avatar"
              src={avatar}
              alt={title}
              width="180"
              height="180"
              onError={hideBrokenImage}
            />
          )}
          <h2 className="author-profile-name">
            <span className="author-profile-label">作者</span>
            {title}
          </h2>
          {bio && <p className="author-profile-bio">{bio}</p>}
          <div className="author-profile-meta">
            <span className="author-profile-count">XX 篇文章</span>
            {href && (
              <a
                className="author-profile-link joh-external-link-icon"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {domain}
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function preventNavigation(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault()
}

function handleCoverError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget

  if (image.src.endsWith(DEFAULT_COVER))
    return

  image.src = DEFAULT_COVER
  image.classList.add('default-bg')
  image.closest('.Hero')?.classList.replace('has-cover', 'no-cover')
}

function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.hidden = true
}
