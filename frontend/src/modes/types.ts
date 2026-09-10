import { createContext, useContext } from 'react';

export type Mode = 'cyberpunk' | 'vigilancia';

export interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

export const ModeContext = createContext<ModeContextValue>({
  mode: 'cyberpunk',
  setMode: () => {},
});

export function useMode() {
  return useContext(ModeContext);
}
