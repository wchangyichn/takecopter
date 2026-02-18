import { useState, useCallback } from 'react';
import type { ViewType } from '../types';

interface AppState {
  currentView: ViewType;
  selectedStoryId: string | null;
  selectedNodeId: string | null;
}

const initialState: AppState = {
  currentView: 'home',
  selectedStoryId: null,
  selectedNodeId: null,
};

export function useAppState() {
  const [state, setState] = useState<AppState>(initialState);

  const setView = useCallback((view: ViewType) => {
    setState(prev => ({ ...prev, currentView: view }));
  }, []);

  const selectStory = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedStoryId: id }));
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedNodeId: id }));
  }, []);

  return {
    ...state,
    setView,
    selectStory,
    selectNode,
  };
}
