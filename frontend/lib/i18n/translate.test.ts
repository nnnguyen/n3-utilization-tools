import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorText, syncErrorText } from './translate.ts';

test('apiErrorText translates a coded error', () => {
  assert.equal(
    apiErrorText('en', { code: 'AUTH_INVALID_CREDENTIALS', message: 'Thông tin đăng nhập không chính xác' } as any),
    'Incorrect email or password',
  );
  assert.equal(apiErrorText('vi', { code: 'WORD_DUPLICATE' }), 'Bạn đã gửi từ này rồi.');
});

test('apiErrorText fills params and translates a known YouTube reason', () => {
  assert.equal(
    apiErrorText('en', {
      code: 'PLAYLIST_DELETE_FAILED',
      params: { reason: 'Đã hết quota API YouTube trong ngày, thử lại vào ngày mai', reasonCode: 'quotaExceeded' },
    }),
    'Could not delete the playlist: The YouTube API quota for today is used up; try again tomorrow',
  );
  assert.equal(
    apiErrorText('en', { code: 'PLAYLIST_DELETE_FAILED', params: { reason: 'socket hang up', reasonCode: null } }),
    'Could not delete the playlist: socket hang up',
  );
});

test('apiErrorText returns null for unknown or missing codes', () => {
  assert.equal(apiErrorText('en', { code: 'SOMETHING_NEW' }), null);
  assert.equal(apiErrorText('en', { message: 'x' } as any), null);
  assert.equal(apiErrorText('en', null), null);
});

test('syncErrorText translates known codes and keeps other texts', () => {
  assert.equal(syncErrorText('en', 'VIDEO_NOT_FOUND', 'Video đã bị xoá trên YouTube'), 'The video was deleted on YouTube');
  assert.equal(syncErrorText('en', null, 'raw error'), 'raw error');
  assert.equal(syncErrorText('en', 'unknownCode', 'raw error'), 'raw error');
});
