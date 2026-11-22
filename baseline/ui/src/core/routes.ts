import { appAssetUrl } from './app-assets'

export type Page = 'basic' | 'multi' | 'account' | 'compliance'
export function currentPage(): Page {
  if (location.hash === '#smart-withdrawal') return 'multi'
  if (location.hash === '#smart-account') return 'account'
  if (location.hash === '#compliance' || /\/compliance(?:\/(?:index\.html)?)?$/.test(location.pathname)) return 'compliance'
  return 'basic'
}
export function pageUrl(page: Page) {
  return appAssetUrl(page === 'compliance' ? 'compliance/' : page === 'multi' ? '#smart-withdrawal' : page === 'account' ? '#smart-account' : './')
}
