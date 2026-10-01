import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBackupState, formatBytes, isDriveBackupActive } from './drive-backup.ts';

test('aggregateBackupState: a problem outranks progress outranks done', () => {
  assert.equal(aggregateBackupState([]), null);
  assert.equal(aggregateBackupState([{ status: 'done' }, { status: 'done' }]), 'done');
  assert.equal(aggregateBackupState([{ status: 'done' }, { status: 'uploading' }]), 'uploading');
  assert.equal(aggregateBackupState([{ status: 'pending' }]), 'uploading');
  assert.equal(aggregateBackupState([{ status: 'failed' }, { status: 'uploading' }]), 'failed');
  assert.equal(aggregateBackupState([{ status: 'done' }, { status: 'skipped' }]), 'done');
  assert.equal(aggregateBackupState([{ status: 'skipped' }, { status: 'skipped' }]), 'skipped');
});

test('isDriveBackupActive: true while any file is pending or uploading', () => {
  assert.equal(isDriveBackupActive([{ status: 'done' }]), false);
  assert.equal(isDriveBackupActive([{ status: 'done' }, { status: 'pending' }]), true);
  assert.equal(isDriveBackupActive([{ status: 'failed' }]), false);
});

test('formatBytes: binary units', () => {
  assert.equal(formatBytes(1024 ** 3, 'en-US'), '1 GB');
  assert.equal(formatBytes(1.5 * 1024 ** 3, 'vi-VN'), '1,5 GB');
});
