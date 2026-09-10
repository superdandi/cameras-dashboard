import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { initSphereMatrix, type SphereMatrix } from './cyberSphereMatrix';
import CyberVideoDetail from './CyberVideoDetail';

interface Props {
  cameras: Camera[];
  status: Record<number, CamStatus>;
  preferMain: boolean;
  onSelect: (c: Camera) => void;
}

export default function CyberSpheres({ cameras, status, preferMain, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const matrixRef = useRef<SphereMatrix | null>(null);
  const [hoveredCamera, setHoveredCamera] = useState<Camera | null>(null);
  const [pendingCamera, setPendingCamera] = useState<Camera | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [ready, setReady] = useState(false);

  // Initialize sphere matrix
  useEffect(() => {
    if (!containerRef.current || cameras.length === 0) return;
    let disposed = false;

    initSphereMatrix(containerRef.current, cameras).then((matrix) => {
      if (disposed) { matrix.dispose(); return; }
      matrixRef.current = matrix;

      matrix.onHover((index) => {
        setHoveredCamera(index !== null ? cameras[index] : null);
      });

      matrix.onClick((index) => {
        const cam = cameras[index];
        if (cam) {
          setPendingCamera(cam); // mount detail immediately (hidden)
          matrix.zoomToSphere(index).then(() => {
            setSelectedCamera(cam); // fade in
            setPendingCamera(null);
          });
        }
      });

      setReady(true);
    });

    return () => {
      disposed = true;
      matrixRef.current?.dispose();
      matrixRef.current = null;
    };
  }, [cameras]);

  // Handle escape to close detail
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (selectedCamera || pendingCamera)) {
        matrixRef.current?.resetCamera().then(() => {
          setSelectedCamera(null);
          setPendingCamera(null);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCamera, pendingCamera]);

  const handleCloseDetail = useCallback(() => {
    matrixRef.current?.resetCamera().then(() => {
      setSelectedCamera(null);
      setPendingCamera(null);
    });
  }, []);

  const handleExpand = useCallback(() => {
    if (selectedCamera) {
      onSelect(selectedCamera);
    }
  }, [selectedCamera, onSelect]);

  return (
    <div className="cyber-spheres">
      <div ref={containerRef} className="cyber-spheres-canvas" />

      {/* Minimal HUD */}
      <div className="cyber-spheres-hud">
        <div className="cyber-spheres-mode-label">
          SENTINEL CYP // CAMERA MATRIX
        </div>
        <div className="cyber-spheres-stats">
          {cameras.length} NODE{cameras.length !== 1 ? 'S' : ''} ONLINE
        </div>
      </div>

      {/* Hover label */}
      {hoveredCamera && !selectedCamera && (
        <div className="cyber-spheres-hover-label">
          <span className="cyber-spheres-hover-name">{hoveredCamera.name}</span>
          <span className="cyber-spheres-hover-ip">{hoveredCamera.ip}</span>
          <span className="cyber-spheres-hover-loc">{hoveredCamera.location}</span>
        </div>
      )}

      {/* Crosshair */}
      {!selectedCamera && (
        <div className="cyber-spheres-crosshair">
          <div className="cyber-spheres-crosshair-h" />
          <div className="cyber-spheres-crosshair-v" />
        </div>
      )}

      {/* Detail overlay — video mosaic (pending = hidden, selected = visible) */}
      {(pendingCamera || selectedCamera) && (
        <CyberVideoDetail
          key={(selectedCamera || pendingCamera)!.id}
          camera={(selectedCamera || pendingCamera)!}
          status={status[(selectedCamera || pendingCamera)!.id]}
          preferMain={preferMain}
          onClose={handleCloseDetail}
          visible={!!selectedCamera}
        />
      )}
    </div>
  );
}
