import type { Camera, CamStatus } from '../../types';
import CyberBoot from './CyberBoot';
import CyberSpheres from './CyberSpheres';

interface Props {
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
}

export default function CyberGrid({ cameras, status, preferMain, g2rOk, bootVisible, onBootDone, onSelect }: Props) {
  return (
    <div className="cyber-grid">
      {bootVisible && <CyberBoot onDone={onBootDone} />}
      {!bootVisible && cameras.length > 0 && (
        <CyberSpheres
          cameras={cameras}
          status={status}
          preferMain={preferMain}
          onSelect={onSelect}
        />
      )}
      {!bootVisible && cameras.length === 0 && (
        <div className="cyber-grid-empty">
          No hay cámaras habilitadas. Ve a <b>Inventario</b> para añadirlas.
        </div>
      )}
      {g2rOk === false && (
        <div className="cyber-grid-warning">
          ⚠ go2rtc no responde en 127.0.0.1:1984. Verifica el servicio.
        </div>
      )}
    </div>
  );
}
