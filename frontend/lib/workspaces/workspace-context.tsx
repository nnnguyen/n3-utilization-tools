'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth-context';

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
  };
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch('/workspaces', { silent: true });
      setWorkspaces(data);

      // Find active workspace based on user's activeWorkspaceId (from JWT/Session)
      // or default to the first one if not set
      const activeId = (user as any).activeWorkspaceId;
      const active = data.find((w: Workspace) => w.id === activeId) || data[0] || null;
      setActiveWorkspace(active);
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const switchWorkspace = async (workspaceId: string) => {
    await apiFetch(`/workspaces/${workspaceId}/switch`, { method: 'POST' });
    // After switching, we need to refresh the user session (to get new JWT with updated activeWorkspaceId)
    // and then refresh the workspace list/active workspace
    await refreshUser();
    await refreshWorkspaces();
  };

  const createWorkspace = async (name: string) => {
    const newWorkspace = await apiFetch('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    await refreshWorkspaces();
    return newWorkspace;
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        loading,
        refreshWorkspaces,
        switchWorkspace,
        createWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  }
  return context;
}
