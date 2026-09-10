import type { Mode } from './types';
import type { Camera, CamStatus } from '../types';

// Cyberpunk components
import CyberTile from './cyberpunk/CyberTile';
import CyberDetail from './cyberpunk/CyberDetail';
import CyberGrid from './cyberpunk/CyberGrid';
import CyberEventsSpheres from './cyberpunk/CyberEventsSpheres';

// Vigilancia components
import OpsTile from './vigilancia/OpsTile';
import OpsDetail from './vigilancia/OpsDetail';
import OpsConsole from './vigilancia/OpsConsole';
import OpsGrid from './vigilancia/OpsGrid';

// Shared panels (mode-aware via CSS)
import InventoryPanel from '../components/InventoryPanel';
import TwitchPanel from '../components/TwitchPanel';
import SettingsPanel from '../components/SettingsPanel';

export interface ModeComponents {
  Tile: React.ComponentType<{
    camera: Camera;
    status?: CamStatus;
    active: boolean;
    preferMain?: boolean;
    onSelect: (c: Camera) => void;
  }>;
  Detail: React.ComponentType<{
    camera: Camera;
    preferMain?: boolean;
    onClose: () => void;
    status?: CamStatus;
    solo?: boolean;
    onSoloChange?: (solo: boolean) => void;
  }>;
  Grid: React.ComponentType<{
    cameras: Camera[];
    status: Record<number, CamStatus>;
    cols: number;
    preferMain: boolean;
    g2rOk: boolean | null;
    g2rStreams: string[];
    bootVisible: boolean;
    onBootDone: () => void;
    onSelect: (c: Camera) => void;
    onLayoutChange: (n: number) => void;
    onReorder: (cameras: Camera[]) => void;
    selectedId?: number | null;
    onSelectedChange?: (id: number | null) => void;
    modalOpen?: boolean;
  }>;
  Events: React.ComponentType;
  Inventory: React.ComponentType<{ onChanged: () => void; onReorder?: (cameras: Camera[]) => void }>;
  Twitch: React.ComponentType;
  Settings: React.ComponentType;
}

export const MODES: Record<Mode, ModeComponents> = {
  cyberpunk: {
    Tile: CyberTile,
    Detail: CyberDetail,
    Grid: CyberGrid,
    Events: CyberEventsSpheres,
    Inventory: InventoryPanel,
    Twitch: TwitchPanel,
    Settings: SettingsPanel,
  },
  vigilancia: {
    Tile: OpsTile,
    Detail: OpsDetail,
    Grid: OpsGrid,
    Events: OpsConsole,
    Inventory: InventoryPanel,
    Twitch: TwitchPanel,
    Settings: SettingsPanel,
  },
};
