import { AsyncLocalStorage } from 'async_hooks';

export interface WorkspaceStore {
  workspaceId: string;
  userId: string;
}

export const workspaceStorage = new AsyncLocalStorage<WorkspaceStore>();
