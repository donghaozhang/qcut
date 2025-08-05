import React, { useState, useEffect, useCallback } from "react";

// Global loading state for all async modules
const moduleLoadingState = new Map<string, boolean>();
const moduleLoadingListeners = new Map<string, Set<() => void>>();

// Hook to track overall module loading state
export function useAsyncModuleLoading() {
  const [loadingModules, setLoadingModules] = useState<string[]>([]);

  useEffect(() => {
    const updateLoadingModules = () => {
      const loading = Array.from(moduleLoadingState.entries())
        .filter(([_, isLoading]) => isLoading)
        .map(([module]) => module);
      setLoadingModules(loading);
    };

    // Subscribe to all module changes
    const listener = () => updateLoadingModules();

    moduleLoadingListeners.forEach((listeners) => {
      listeners.add(listener);
    });

    // Initial state
    updateLoadingModules();

    return () => {
      moduleLoadingListeners.forEach((listeners) => {
        listeners.delete(listener);
      });
    };
  }, []);

  const isAnyModuleLoading = loadingModules.length > 0;
  const loadingCount = loadingModules.length;

  return {
    isAnyModuleLoading,
    loadingModules,
    loadingCount,
  };
}

// Helper to manage loading state for a specific module
export function useModuleLoadingState(moduleName: string) {
  const setLoading = useCallback(
    (isLoading: boolean) => {
      moduleLoadingState.set(moduleName, isLoading);

      // Notify listeners
      const listeners = moduleLoadingListeners.get(moduleName) || new Set();
      listeners.forEach((listener) => listener());
    },
    [moduleName]
  );

  useEffect(() => {
    // Initialize listeners for this module
    if (!moduleLoadingListeners.has(moduleName)) {
      moduleLoadingListeners.set(moduleName, new Set());
    }

    return () => {
      // Clean up when module unmounts
      moduleLoadingState.delete(moduleName);
      moduleLoadingListeners.delete(moduleName);
    };
  }, [moduleName]);

  return setLoading;
}

// Loading indicator component
export function AsyncModuleLoadingIndicator() {
  const { isAnyModuleLoading, loadingModules } = useAsyncModuleLoading();

  if (!isAnyModuleLoading) return null;

  return (
    <div className="fixed top-4 right-4 bg-background/80 backdrop-blur-sm border rounded-lg p-3 shadow-lg z-50">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        <span className="text-sm text-muted-foreground">
          Loading modules... ({loadingModules.length})
        </span>
      </div>
    </div>
  );
}

// Wrapper component for lazy-loaded sections
interface AsyncModuleWrapperProps {
  loading: boolean;
  error: Error | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
}

export function AsyncModuleWrapper({
  loading,
  error,
  children,
  fallback,
  errorFallback,
}: AsyncModuleWrapperProps) {
  if (error) {
    return (
      <>
        {errorFallback ? (
          errorFallback(error)
        ) : (
          <div className="flex items-center justify-center p-4">
            <div className="text-destructive">
              Error loading module: {error.message}
            </div>
          </div>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <>
        {fallback || (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
