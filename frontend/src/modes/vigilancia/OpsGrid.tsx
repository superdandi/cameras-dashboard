import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Camera, CamStatus } from '../../types';
import { api } from '../../api';
import { useEvents } from '../../hooks/useEvents';
import { useGo2rtcStreams } from '../../hooks/useGo2rtcStreams';
import { useDowntimeTracker, formatDowntime } from '../../hooks/useDowntimeTracker';
import { pushGo2rtc, pushStatus, pushLastEvent } from './telemetryStore';
import { zoomIn, zoomOut, resetZoom } from './zoomStore';
import { toggleCameraAudio } from '../../hooks/useCameraAudio';
import OpsTile from './OpsTile';
import OpsStatusBar from './OpsStatusBar';
import OpsSidePanel from './OpsSidePanel';
import OpsBoot from './OpsBoot';
import LayoutSwitcher from '../../components/LayoutSwitcher';

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

function SortableTile({
  camera,
  status,
  preferMain,
  onSelect,
  downtimeLabel,
  liveSince,
  lastCutAt,
  selected,
}: {
  camera: Camera;
  status?: CamStatus;
  preferMain: boolean;
  onSelect: (c: Camera) => void;
  downtimeLabel?: string;
  liveSince?: number;
  lastCutAt?: number;
  selected?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: camera.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'ops-tile-dragging' : ''}>
      <OpsTile
        camera={camera}
        status={status}
        active
        preferMain={preferMain}
        onSelect={onSelect}
        downtimeLabel={downtimeLabel}
        liveSince={liveSince}
        lastCutAt={lastCutAt}
        selected={selected}
        dragHandle={
          <div className="ops-drag-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} title="Arrastrar para reordenar">
            ⠿
          </div>
        }
      />
    </div>
  );
}

export default function OpsGrid({ cameras, status, cols, preferMain, g2rOk, g2rStreams, bootVisible, onBootDone, onSelect, onLayoutChange, onReorder, selectedId, onSelectedChange, modalOpen }: Props) {
  const [panelOpen, setPanelOpen] = useState(true);
  const { events } = useEvents(500);
  const go2rtcStreams = useGo2rtcStreams(cameras);
  const downtime = useDowntimeTracker(status);
  const activeKeyRef = useRef<string | null>(null);
  const ptzTimerRef = useRef<number | null>(null);
  const zoomTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const selectedCamera = selectedId ? cameras.find((c) => c.id === selectedId) ?? null : null;

  const stopPtzHold = useCallback(() => {
    if (ptzTimerRef.current !== null) {
      clearInterval(ptzTimerRef.current);
      ptzTimerRef.current = null;
    }
    if (selectedCamera?.has_ptz) {
      api.ptz(selectedCamera.id, 'stop', 40, 0).catch(() => {});
    }
  }, [selectedCamera]);

  const startPtzHold = useCallback((act: string) => {
    if (!selectedCamera || !selectedCamera.has_ptz) return;
    stopPtzHold();
    api.ptz(selectedCamera.id, act, 40, 0).catch(() => {});
    ptzTimerRef.current = window.setInterval(() => {
      api.ptz(selectedCamera.id, act, 40, 0).catch(() => {});
    }, 300);
  }, [selectedCamera, stopPtzHold]);

  const stopZoomHold = useCallback(() => {
    if (zoomTimerRef.current !== null) {
      clearInterval(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
  }, []);

  const startZoomHold = useCallback((dir: 'in' | 'out') => {
    if (!selectedId) return;
    stopZoomHold();
    const tick = () => {
      if (dir === 'in') zoomIn(selectedId, 0.15);
      else zoomOut(selectedId, 0.15);
    };
    tick();
    zoomTimerRef.current = window.setInterval(tick, 90);
  }, [selectedId, stopZoomHold]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key;

    // 1-4: select camera by index (solo si no hay modal encima)
    if (!modalOpen && key >= '1' && key <= '4') {
      const idx = parseInt(key) - 1;
      if (idx < cameras.length) {
        onSelectedChange?.(cameras[idx].id);
      }
      return;
    }

    // Enter: open detail (solo si no hay modal encima)
    if (!modalOpen && key === 'Enter' && selectedCamera) {
      e.preventDefault();
      onSelect(selectedCamera);
      return;
    }

    // S: toggle audio (store compartido; con modal apunta a la cámara mostrada)
    if (key === 's' || key === 'S') {
      if (selectedCamera) {
        toggleCameraAudio(selectedCamera.id);
      }
      return;
    }

    // T: toggle sidebar
    if (key === 't' || key === 'T') {
      setPanelOpen((p) => !p);
      return;
    }

    // PTZ: solo flechas (hold continuo, ignora el auto-repeat del teclado)
    // Se usa e.code para ser robusto con Shift (+ / = misma tecla física)
    const ptzMap: Record<string, string> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    };
    const act = ptzMap[e.code];
    if (act && selectedCamera && selectedCamera.has_ptz) {
      if (!e.repeat) {
        e.preventDefault();
        activeKeyRef.current = e.code;
        startPtzHold(act);
      }
      return;
    }

    // Zoom digital: + y - (solo requiere cámara seleccionada)
    const zoomMap: Record<string, 'in' | 'out'> = {
      Equal: 'in', Minus: 'out',
      NumpadAdd: 'in', NumpadSubtract: 'out',
    };
    const zdir = zoomMap[e.code];
    if (zdir && selectedId) {
      if (!e.repeat) {
        e.preventDefault();
        activeKeyRef.current = e.code;
        startZoomHold(zdir);
      }
      return;
    }

    // 0: resetear zoom digital
    if (key === '0' && selectedId) {
      resetZoom(selectedId);
      return;
    }
  }, [cameras, selectedId, selectedCamera, onSelect, onSelectedChange, startPtzHold, startZoomHold, modalOpen]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === activeKeyRef.current) {
      activeKeyRef.current = null;
      stopPtzHold();
      stopZoomHold();
    }
  }, [stopPtzHold, stopZoomHold]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (ptzTimerRef.current !== null) {
        clearInterval(ptzTimerRef.current);
        ptzTimerRef.current = null;
      }
      if (zoomTimerRef.current !== null) {
        clearInterval(zoomTimerRef.current);
        zoomTimerRef.current = null;
      }
    };
  }, [handleKeyDown, handleKeyUp]);

  // Clear selection if selected camera disappears
  useEffect(() => {
    if (selectedId && !cameras.find((c) => c.id === selectedId)) {
      onSelectedChange?.(null);
    }
  }, [cameras, selectedId, onSelectedChange]);

  useEffect(() => {
    go2rtcStreams.forEach((data, camId) => {
      const cam = cameras.find((c) => c.id === camId);
      if (cam) pushGo2rtc(camId, cam.name, data);
    });
  }, [go2rtcStreams, cameras]);

  useEffect(() => {
    cameras.forEach((cam) => {
      const st = status[cam.id];
      if (st) pushStatus(cam.id, cam.name, st.ok);
    });
  }, [status, cameras]);

  useEffect(() => {
    const lastMap = new Map<number, { ts: string; type: string }>();
    events.forEach((e) => {
      const camId = e.camera_id;
      if (!lastMap.has(camId) || e.ts > lastMap.get(camId)!.ts) {
        lastMap.set(camId, { ts: e.ts, type: e.type });
      }
    });
    cameras.forEach((cam) => {
      pushLastEvent(cam.id, cam.name, lastMap.get(cam.id) ?? null);
    });
  }, [events, cameras]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cameras.findIndex((c) => c.id === active.id);
    const newIndex = cameras.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(cameras, oldIndex, newIndex);

    onReorder(reordered);

    api.reorderCameras(reordered.map((c) => c.id)).catch(console.error);
  }

  const gridClass = cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : cols === 4 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <>
      {bootVisible && <OpsBoot onDone={onBootDone} />}
      <div className="ops-grid-layout">
        <OpsStatusBar
          camCount={cameras.length}
          eventCount={events.length}
          go2rtcOk={g2rOk}
          go2rtcStreams={g2rStreams}
        />
        <div className="ops-grid-body">
          <div className="ops-grid-main">
            {g2rOk === false && (
              <div className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
                ⚠ go2rtc no responde en 127.0.0.1:1984. Verifica el servicio.
              </div>
            )}
            {cameras.length === 0 ? (
              <div className="py-16 text-center text-muted">
                No hay cámaras habilitadas. Ve a <b>Inventario</b> para añadirlas.
              </div>
            ) : (
              <>
                <LayoutSwitcher value={cols} onChange={onLayoutChange} />
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={cameras.map((c) => c.id)} strategy={rectSortingStrategy}>
                    <div className={`grid gap-3 ${gridClass}`}>
                      {cameras.map((c) => {
                        const dt = downtime.get(c.id);
                        const isDown = dt && dt.sinceDown > dt.sinceUp;
                        return (
                          <SortableTile
                            key={c.id}
                            camera={c}
                            status={status[c.id]}
                            preferMain={preferMain}
                            onSelect={onSelect}
                            downtimeLabel={isDown ? formatDowntime(dt!.sinceDown) : undefined}
                            liveSince={status[c.id]?.live_since}
                            lastCutAt={status[c.id]?.last_cut_at}
                            selected={c.id === selectedId}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>
          <button
            className="ops-panel-toggle"
            onClick={() => setPanelOpen((p) => !p)}
            title={panelOpen ? 'Ocultar panel' : 'Mostrar panel'}
          >
            {panelOpen ? '›' : '‹'}
          </button>
          {panelOpen && <OpsSidePanel cameras={cameras} status={status} />}
        </div>
      </div>
    </>
  );
}
