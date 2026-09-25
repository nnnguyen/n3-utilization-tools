'use client';

import React, { Fragment, useCallback, useMemo } from 'react';
import { usePreferences, type Language } from '../preferences';
import {
  dictionaries,
  syncErrorText,
  translate,
  type MessageKey,
  type TranslateParams,
} from './translate';

export {
  apiErrorText,
  currentLanguage,
  hasMessage,
  syncErrorText,
  translate,
  translateNow,
  type MessageKey,
  type TranslateParams,
} from './translate';

export function useSyncErrorText() {
  const { language } = usePreferences();
  return useCallback(
    (code: string | null | undefined, fallback: string) => syncErrorText(language, code, fallback),
    [language],
  );
}

export function useT() {
  const { language } = usePreferences();
  return useCallback((key: MessageKey, params?: TranslateParams) => translate(language, key, params), [language]);
}

// Like t(), but {placeholders} can be React elements (links, bold text), so a
// sentence keeps its word order in every language
export function useTNode() {
  const { language } = usePreferences();
  return useCallback(
    (key: MessageKey, nodes: Record<string, React.ReactNode>): React.ReactNode => {
      const template = dictionaries[language][key] ?? dictionaries.vi[key] ?? key;
      return template.split(/(\{\w+\})/g).map((part, i) => {
        const name = part.match(/^\{(\w+)\}$/)?.[1];
        return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
      });
    },
    [language],
  );
}

const INTL_LOCALE: Record<Language, string> = { vi: 'vi-VN', en: 'en-US' };

// Dates and numbers in the chosen language (instead of the browser's locale)
export function useFormat() {
  const { language } = usePreferences();
  return useMemo(() => {
    const locale = INTL_LOCALE[language];
    const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));
    return {
      locale,
      dateTime: (value: string | number | Date) =>
        toDate(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }),
      date: (value: string | number | Date) => toDate(value).toLocaleDateString(locale),
      time: (value: string | number | Date) =>
        toDate(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      number: (value: number) => value.toLocaleString(locale),
    };
  }, [language]);
}
