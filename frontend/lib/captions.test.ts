import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captionLanguageLabel,
  captionLanguageOptions,
  defaultCaptionTrackName,
  hasTranscript,
  isCaptionStatus,
} from './captions.ts';

test('captionLanguageLabel: name in the UI language with the code', () => {
  assert.equal(captionLanguageLabel('vi', 'en'), 'Vietnamese (vi)');
  assert.equal(captionLanguageLabel('en', 'vi'), 'Tiếng Anh (en)');
});

test('captionLanguageOptions: keeps a saved language missing from the list', () => {
  assert.equal(captionLanguageOptions('en').some(o => o.value === 'pt-BR'), false);
  assert.equal(captionLanguageOptions('en', 'pt-BR').at(-1)?.value, 'pt-BR');
  assert.equal(captionLanguageOptions('en', 'vi').filter(o => o.value === 'vi').length, 1);
});

test('defaultCaptionTrackName matches the backend default', () => {
  assert.equal(defaultCaptionTrackName('vi'), 'Tiếng Việt (Zoom)');
  assert.equal(defaultCaptionTrackName('en'), 'English (Zoom)');
  assert.equal(defaultCaptionTrackName('ja'), 'ja (Zoom)');
});

test('hasTranscript: finished TRANSCRIPT or CC files only', () => {
  assert.equal(hasTranscript([{ file_type: 'MP4' }]), false);
  assert.equal(hasTranscript([{ file_type: 'TRANSCRIPT', status: 'completed' }]), true);
  assert.equal(hasTranscript([{ file_type: 'CC' }]), true);
  assert.equal(hasTranscript([{ file_type: 'TRANSCRIPT', status: 'processing' }]), false);
  assert.equal(hasTranscript(undefined), false);
});

test('isCaptionStatus', () => {
  assert.equal(isCaptionStatus('uploaded'), true);
  assert.equal(isCaptionStatus(null), false);
  assert.equal(isCaptionStatus('toString'), false);
});
