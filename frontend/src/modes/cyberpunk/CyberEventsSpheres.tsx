import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useEvents } from '../../hooks/useEvents';
import { initEventsScene, type EventSphere } from './cyberEventsScene';
import CyberEventDetail from './CyberEventDetail';

export default function CyberEventsSpheres() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EventSphere | null>(null);
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ type: string; ts: string } | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{ type: string; ts: string; payload: string } | null>(null);
  const { events } = useEvents(100);

  const cameras: Camera[] = [];
  const cameraMap = new Map<number, { camera: Camera; lastEvent: { type: string; ts: string; payload: string } | null }>();

  useEffect(() => {
    if (!containerRef.current) return;

    import('../../api').then(({ api }) => {
      api.listCameras().then((cams: Camera[]) => {
        if (!containerRef.current) return;

        const lastEventsByCamera = new Map<number, { type: string; ts: string; payload: string }>();
        for (const ev of events) {
          if (!lastEventsByCamera.has(ev.camera_id)) {
            lastEventsByCamera.set(ev.camera_id, { type: ev.type, ts: ev.ts, payload: ev.payload });
          }
        }

        const enabled = cams.filter((c) => c.enabled);
        enabled.forEach((c) => {
          cameraMap.set(c.id, { camera: c, lastEvent: lastEventsByCamera.get(c.id) || null });
        });

        initEventsScene(containerRef.current, enabled).then((scene) => {
          sceneRef.current = scene;
          scene.onHover((index) => {
            if (index !== null) {
              const cam = enabled[index];
              setHoveredCamera(cam);
              const entry = cameraMap.get(cam.id);
              setHoveredEvent(entry?.lastEvent || null);
            } else {
              setHoveredCamera(null);
              setHoveredEvent(null);
            }
          });
          scene.onClick((index) => {
            const cam = enabled[index];
            if (cam) {
              const entry = cameraMap.get(cam.id);
              scene.zoomToSphere(index).then(() => {
                setSelectedCamera(cam);
                setSelectedEvent(entry?.lastEvent || null);
              });
            }
          });
        });
      });
    });

    return () => { sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [events]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCamera) {
        sceneRef.current?.resetCamera().then(() => {
          setSelectedCamera(null);
          setSelectedEvent(null);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCamera]);

  const handleClose = useCallback(() => {
    sceneRef.current?.resetCamera().then(() => {
      setSelectedCamera(null);
      setSelectedEvent(null);
    });
  }, []);

  return (
    <div className="cyber-spheres">
      <div ref={containerRef} className="cyber-spheres-canvas" />
      <div className="cyber-spheres-hud">
        <div className="cyber-spheres-mode-label">SENTINEL CYP // EVENT MATRIX</div>
        <div className="cyber-spheres-stats">{cameraMap.size || '...'} NODES ONLINE</div>
      </div>
      {hoveredCamera && !selectedCamera && (
        <div className="cyber-spheres-hover-label">
          <span className="cyber-spheres-hover-name">{hoveredCamera.name}</span>
          <span className="cyber-spheres-hover-ip">
            {hoveredEvent ? `${hoveredEvent.type} — ${hoveredEvent.ts}` : 'Sin eventos'}
          </span>
        </div>
      )}
      {!selectedCamera && (
        <div className="cyber-spheres-crosshair">
          <div className="cyber-spheres-crosshair-h" />
          <div className="cyber-spheres-crosshair-v" />
        </div>
      )}
      {selectedCamera && (
        <CyberEventDetail
          camera={selectedCamera}
          event={selectedEvent}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
