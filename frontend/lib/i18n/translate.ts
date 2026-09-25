// Pure translation helpers (no React), shared by the hooks in index.tsx and by
// plain modules such as lib/api.ts
import { vi, type MessageKey } from './vi.ts';
import { en } from './en.ts';

export type { MessageKey };
export type Language = 'vi' | 'en';

// Flat keys ("zoom.recordings.title") so the type checker can list them all;
// en.ts must define every key vi.ts has, or the build fails.
export const dictionaries: Record<Language, Record<MessageKey, string>> = { vi, en };

export type TranslateParams = Record<string, string | number>;

export function translate(language: Language, key: MessageKey, params?: TranslateParams): string {
  const template = dictionaries[language][key] ?? dictionaries.vi[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// For code outside React components (plain helpers, callbacks built at module
// level): the current language as last applied to <html lang> by the
// preferences provider
export function translateNow(key: MessageKey, params?: TranslateParams): string {
  return translate(currentLanguage(), key, params);
}

export function currentLanguage(): Language {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'vi';
}

export function hasMessage(key: string): key is MessageKey {
  return key in dictionaries.vi;
}

// A sync/YouTube error with a known code (ZoomSyncLog.errorCode, notification
// data) in the chosen language; otherwise the text the backend stored
export function syncErrorText(language: Language, code: string | null | undefined, fallback: string): string {
  const key = `syncError.${code}`;
  return code && hasMessage(key) ? translate(language, key) : fallback;
}

// Body of a coded API error ({ code, message, params? }, see backend
// common/coded-error.ts): its translation, or null to keep `message`
export function apiErrorText(
  language: Language,
  body: { code?: unknown; params?: Record<string, unknown> } | null | undefined,
): string | null {
  const key = `apiError.${body?.code}`;
  if (typeof body?.code !== 'string' || !hasMessage(key)) return null;
  const params: TranslateParams = {};
  for (const [name, value] of Object.entries(body.params ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') params[name] = value;
  }
  // A YouTube reason with a known code is translated too
  if (typeof params.reason === 'string') {
    params.reason = syncErrorText(language, body.params?.reasonCode as string | null, params.reason);
  }
  return translate(language, key, params);
}
