import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Camera } from '../../types';
import { snapshotUrl } from '../../api';

const SPHERE_RADIUS = 1;
const SPHERE_SEGMENTS = 64;
const SPACING = 3;
const TEXTURE_REFRESH_MS = 5000;

export interface EventSphere {
  dispose: () => void;
  refreshTextures: () => void;
  zoomToSphere: (index: number) => Promise<void>;
  resetCamera: () => Promise<void>;
  onHover: (cb: (index: number | null) => void) => void;
  onClick: (cb: (index: number) => void) => void;
}

function gridPositions(n: number): [x: number, y: number, z: number][] {
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const points: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    points.push([
      (col - (cols - 1) / 2) * SPACING,
      (row - (rows - 1) / 2) * SPACING,
      0,
    ]);
  }
  return points;
}

function createFallbackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#1a3a5a';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(128, 80); ctx.lineTo(128, 176); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(80, 128); ctx.lineTo(176, 128); ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function loadCameraTexture(cam: Camera, onLoad: (tex: THREE.Texture) => void): THREE.Texture {
  const loader = new THREE.TextureLoader();
  const url = snapshotUrl(cam.id);
  const fallback = createFallbackTexture();
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    onLoad(tex);
  }, undefined, () => onLoad(fallback));
  return fallback;
}

export async function initEventsScene(
  container: HTMLElement,
  cameras: Camera[],
): Promise<EventSphere> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
  camera.position.set(0, 0, 10);

  const scene = new THREE.Scene();

  const ambient = new THREE.AmbientLight(0x6688aa, 1);
  scene.add(ambient);
  const pointLight = new THREE.PointLight(0x00ccff, 5, 25);
  pointLight.position.set(3, 5, 5);
  scene.add(pointLight);
  const pointLight2 = new THREE.PointLight(0xff0066, 2, 20);
  pointLight2.position.set(-3, -3, -3);
  scene.add(pointLight2);

  const positions = gridPositions(cameras.length);
  const spheres: THREE.Mesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const sphereGeom = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2);

  for (let i = 0; i < cameras.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      map: createFallbackTexture(),
      roughness: 0.4,
      metalness: 0.0,
      emissive: new THREE.Color(0x112244),
      emissiveIntensity: 0.5,
    });
    loadCameraTexture(cameras[i], (realTex) => {
      const old = mat.map;
      mat.map = realTex;
      mat.needsUpdate = true;
      old?.dispose();
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(sphereGeom, mat);
    mesh.position.set(...positions[i]);
    mesh.userData = { cameraIndex: i, camera: cameras[i] };
    scene.add(mesh);
    spheres.push(mesh);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight), 0.8, 0.3, 0.6,
  );
  composer.addPass(bloomPass);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoverCb: (index: number | null) => void = () => {};
  let clickCb: (index: number) => void = () => {};
  let hoveredIndex: number | null = null;

  const onMouseMove = (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(spheres);
    const newHovered = intersects.length > 0 ? intersects[0].object.userData.cameraIndex : null;
    if (newHovered !== hoveredIndex) {
      hoveredIndex = newHovered;
      spheres.forEach((s, i) => {
        (s.material as THREE.MeshStandardMaterial).emissiveIntensity = i === hoveredIndex ? 0.4 : 0.1;
      });
      hoverCb(hoveredIndex);
    }
  };

  const onMouseClick = () => { if (hoveredIndex !== null) clickCb(hoveredIndex); };
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('click', onMouseClick);

  const textureLoader = new THREE.TextureLoader();
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  const refreshTextures = () => {
    for (let i = 0; i < cameras.length; i++) {
      textureLoader.load(snapshotUrl(cameras[i].id), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const old = materials[i].map;
        materials[i].map = tex;
        materials[i].needsUpdate = true;
        old?.dispose();
      }, undefined, () => {});
    }
  };

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  function animateCamera(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const startPos = camera.position.clone();
      const startTime = performance.now();
      const tick = () => {
        const now = performance.now();
        const progress = Math.min((now - startTime) / (duration * 1000), 1);
        camera.position.lerpVectors(startPos, targetPos, easeOutCubic(progress));
        camera.lookAt(targetLookAt);
        if (progress < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  const centerOfSpheres = new THREE.Vector3();
  spheres.forEach((s) => centerOfSpheres.add(s.position));
  centerOfSpheres.divideScalar(spheres.length || 1);

  let disposed = false;
  let lastTime = performance.now();

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  const animate = () => {
    if (disposed) return;
    requestAnimationFrame(animate);
    const now = performance.now();
    lastTime = now;
    for (let i = 0; i < spheres.length; i++) {
      spheres[i].position.y = positions[i][1] + Math.sin(now * 0.001 + i * 0.5) * 0.1;
    }
    camera.position.x += Math.sin(now * 0.0003) * 0.001;
    camera.position.y += Math.cos(now * 0.0002) * 0.0005;
    camera.lookAt(centerOfSpheres);
    composer.render();
  };
  animate();
  refreshInterval = setInterval(refreshTextures, TEXTURE_REFRESH_MS);

  return {
    dispose: () => {
      disposed = true;
      if (refreshInterval) clearInterval(refreshInterval);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
      window.removeEventListener('resize', onResize);
      materials.forEach((m) => m.map?.dispose());
      sphereGeom.dispose();
      renderer.dispose();
      composer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    },
    refreshTextures,
    zoomToSphere: (index: number) => {
      const target = spheres[index];
      if (!target) return Promise.resolve();
      const camPos = target.position.clone();
      camPos.z += 3;
      return animateCamera(camPos, target.position, 1.0);
    },
    resetCamera: () => animateCamera(new THREE.Vector3(0, 0, 10), centerOfSpheres, 0.8),
    onHover: (cb) => { hoverCb = cb; },
    onClick: (cb) => { clickCb = cb; },
  };
}
