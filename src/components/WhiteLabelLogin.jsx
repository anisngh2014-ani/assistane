import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function WhiteLabelLogin({ workspaceId, onWorkspaceLoad }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const ws = await base44.asServiceRole.entities.Workspace.filter({ id: workspaceId });
        if (ws.length > 0) {
          setWorkspace(ws[0]);
          onWorkspaceLoad?.(ws[0]);
        }
      } catch (err) {
        console.error("Failed to load workspace:", err);
      } finally {
        setLoading(false);
      }
    };
    if (workspaceId) loadWorkspace();
    else setLoading(false);
  }, [workspaceId, onWorkspaceLoad]);

  return { workspace, loading };
}

// Hook to apply workspace branding
export function useWorkspaceBranding(workspace) {
  useEffect(() => {
    if (!workspace) return;
    
    // Apply custom colors to CSS variables
    if (workspace.primary_color) {
      document.documentElement.style.setProperty("--workspace-primary", workspace.primary_color);
    }
    if (workspace.secondary_color) {
      document.documentElement.style.setProperty("--workspace-secondary", workspace.secondary_color);
    }
    
    // Update page title
    if (workspace.name) {
      document.title = `${workspace.name} - Remote Support`;
    }
  }, [workspace]);
}