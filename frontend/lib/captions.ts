// Captions from the Zoom transcript (docs/design/P2-5-captions.md)

export type CaptionStatus = 'waiting_transcript' | 'pending' | 'uploaded' | 'failed' | 'no_transcript';

// Offered in the language pickers; any BCP-47 tag saved earlier is kept
export const CAPTION_LANGUAGES = ['vi', 'en', 'fr', 'de', 'es', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'th', 'id'];

// "Tiếng Việt (vi)" / "Vietnamese (vi)" in the UI language
export function captionLanguageLabel(code: string, uiLanguage: string): string {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code);
    if (name && name !== code) return `${name.charAt(0).toLocaleUpperCase(uiLanguage)}${name.slice(1)} (${code})`;
  } catch {
    // Unknown tag or no Intl.DisplayNames: the code alone
  }
  return code;
}

export function captionLanguageOptions(uiLanguage: string, current?: string | null) {
  const codes = current && !CAPTION_LANGUAGES.includes(current) ? [...CAPTION_LANGUAGES, current] : CAPTION_LANGUAGES;
  return codes.map(code => ({ value: code, label: captionLanguageLabel(code, uiLanguage) }));
}

// Same default as the backend (captionTrackName in backend/src/zoom/captions.ts)
export function defaultCaptionTrackName(language: string): string {
  return { vi: 'Tiếng Việt (Zoom)', en: 'English (Zoom)' }[language] ?? `${language} (Zoom)`;
}

export const CAPTION_STATUS_COLORS: Record<CaptionStatus, string> = {
  uploaded: 'success',
  pending: 'processing',
  waiting_transcript: 'default',
  no_transcript: 'warning',
  failed: 'error',
};

export function isCaptionStatus(value: unknown): value is CaptionStatus {
  return typeof value === 'string' && Object.hasOwn(CAPTION_STATUS_COLORS, value);
}

// Zoom lists a finished transcript (or in-meeting captions) for the recording
export function hasTranscript(files: { file_type?: string; status?: string }[] | null | undefined): boolean {
  return (files ?? []).some(
    f => (f.file_type === 'TRANSCRIPT' || f.file_type === 'CC') && (f.status === undefined || f.status === 'completed'),
  );
}
