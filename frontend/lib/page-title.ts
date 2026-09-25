import type { MessageKey } from './i18n/vi.ts';

// Header title for each route, matching the selected menu item
const PAGE_TITLES: [prefix: string, key: MessageKey][] = [
  ['/youtube/dashboard', 'nav.dashboard'],
  ['/youtube/channel-content', 'nav.channelContent'],
  ['/youtube/analytics', 'nav.analytics'],
  ['/zoom-utilities', 'nav.zoom'],
  ['/word-cloud', 'nav.wordCloud'],
  ['/settings/integrations', 'nav.integrations'],
  ['/settings/personalization', 'nav.personalization'],
];

/** i18n key of the page title: longest matching route prefix, `nav.home` otherwise. */
export function pageTitleKey(pathname: string): MessageKey {
  let best: [string, MessageKey] | undefined;
  for (const entry of PAGE_TITLES) {
    const [prefix] = entry;
    const matches = pathname === prefix || pathname.startsWith(prefix + '/');
    if (matches && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : 'nav.home';
}
