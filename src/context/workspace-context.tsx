import { createContext, useContext } from "react";
import type { useWorkspaceController } from "../hooks/useWorkspaceController";

type WorkspaceContextValue = ReturnType<typeof useWorkspaceController> & {
  mobileTabBarVisible: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
};
