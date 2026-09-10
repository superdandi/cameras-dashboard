import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Constants ───────────────────────────────────────────────────────
const XGRID = 20;
const YGRID = 10;
const ASSEMBLE_DURATION = 4.0; // seconds — cinematic pacing
const SCATTER_DISTANCE = 1200;


// ─── Public API ──────────────────────────────────────────────────────
export interface VideoScene {
  dispose: () => void;
  resize: () => void;
  startAssembly: () => void;
}

// ─── Easing ──────────────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── UV helper ───────────────────────────────────────────────────────
function changeUvs(
  geometry: THREE.BoxGeometry,
  unitx: number,
  unity: number,
  offsetx: number,
  offsety: number,
): void {
  const uvs = geometry.attributes.uv.array;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = (uvs[i] + offsetx) * unitx;
    uvs[i + 1] = (uvs[i + 1] + offsety) * unity;
  }
}

// ─── Scene init ──────────────────────────────────────────────────────
export function initVideoScene(
  container: HTMLElement,
  video: HTMLVideoElement,
): VideoScene {
  // ─── Renderer ────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  container.appendChild(renderer.domElement);

  // ─── Camera ──────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    1,
    10000,
  );
  camera.position.z = 500;

  // ─── Scene ───────────────────────────────────────────────────────
  const scene = new THREE.Scene();

  // ─── Lighting ────────────────────────────────────────────────────
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(0.5, 1, 1).normalize();
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0x446688, 0.5);
  scene.add(ambient);

  // ─── Video texture ───────────────────────────────────────────────
  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  // ─── Grid of cubes ──────────────────────────────────────────────
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.MeshLambertMaterial[] = [];
  const targetPositions: THREE.Vector3[] = [];
  const startPositions: THREE.Vector3[] = [];
  const startRotations: THREE.Euler[] = [];

  const ux = 1 / XGRID;
  const uy = 1 / YGRID;
  const xsize = 480 / XGRID;
  const ysize = 204 / YGRID;

  const parameters = { color: 0xffffff, map: videoTexture };

  let idx = 0;
  for (let i = 0; i < XGRID; i++) {
    for (let j = 0; j < YGRID; j++) {
      const geometry = new THREE.BoxGeometry(xsize, ysize, xsize);
      changeUvs(geometry, ux, uy, i, j);

      const mat = new THREE.MeshLambertMaterial({ ...parameters });
      mat.hue = i / XGRID;
      mat.saturation = 1 - j / YGRID;
      mat.color.setHSL(mat.hue, mat.saturation, 0.5);

      const mesh = new THREE.Mesh(geometry, mat);

      // Target position: flat grid with slight random offset (imperfect assembly)
      const jitterX = (Math.random() - 0.5) * xsize * 0.3;
      const jitterY = (Math.random() - 0.5) * ysize * 0.3;
      const jitterZ = (Math.random() - 0.5) * xsize * 0.15;
      const tx = (i - XGRID / 2) * xsize + jitterX;
      const ty = (j - YGRID / 2) * ysize + jitterY;
      const tz = jitterZ;
      targetPositions.push(new THREE.Vector3(tx, ty, tz));

      // Start position: scattered randomly
      const sx = (Math.random() - 0.5) * SCATTER_DISTANCE * 2;
      const sy = (Math.random() - 0.5) * SCATTER_DISTANCE * 2;
      const sz = (Math.random() - 0.5) * SCATTER_DISTANCE;
      startPositions.push(new THREE.Vector3(sx, sy, sz));

      // Start rotation: random
      startRotations.push(new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      ));

      // Place at start position (scattered, visible)
      mesh.position.copy(startPositions[idx]);
      mesh.rotation.copy(startRotations[idx]);
      mesh.scale.set(0.5, 0.5, 0.5);

      scene.add(mesh);
      meshes.push(mesh);
      materials.push(mat);
      idx++;
    }
  }

  // ─── Post-processing ─────────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.6,  // strength
    0.3,  // radius
    0.5,  // threshold
  );
  composer.addPass(bloomPass);

  // ─── Assembly animation (delayed until visible) ─────────────────
  let assembleStartTime = 0;
  let assembleProgress = 0;
  let assembled = false;
  let assemblyStarted = false;

  // ─── State ───────────────────────────────────────────────────────
  let disposed = false;
  let lastTime = performance.now();
  let mouseX = 0;
  let mouseY = 0;

  // ─── Resize handler ──────────────────────────────────────────────
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // ─── Mouse tracking (parallax) ──────────────────────────────────
  const onMouseMove = (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseX *= 400;  // range ±400 on X
    mouseY *= 120;  // range ±120 on Y (0.3 factor)
  };
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  // ─── Animate ─────────────────────────────────────────────────────
  const animate = () => {
    if (disposed) return;
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Assembly animation
    if (!assembled && assemblyStarted) {
      const elapsed = (now - assembleStartTime) / 1000;
      assembleProgress = Math.min(elapsed / ASSEMBLE_DURATION, 1);
      const eased = easeOutCubic(assembleProgress);

      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        mesh.position.lerpVectors(startPositions[i], targetPositions[i], eased);
        mesh.rotation.x = startRotations[i].x * (1 - eased);
        mesh.rotation.y = startRotations[i].y * (1 - eased);
        mesh.rotation.z = startRotations[i].z * (1 - eased);
        const s = 0.5 + eased * 0.5;
        mesh.scale.set(s, s, s);
      }

      if (assembleProgress >= 1) {
        assembled = true;
      }
    } else if (assembled) {
      // Subtle floating after assembly
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const row = Math.floor(i / XGRID);
        const col = i % XGRID;
        mesh.position.y = targetPositions[i].y + Math.sin(now * 0.001 + col * 0.3 + row * 0.5) * 0.5;
      }
    }

    // Color shift
    const time = now * 0.00005;
    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      const h = (360 * ((mat.hue + time) % 360)) / 360;
      mat.color.setHSL(h, mat.saturation, 0.5);
    }

    // Mouse parallax (smooth camera follow)
    camera.position.x += (mouseX - camera.position.x) * 0.05;
    camera.position.y += (-mouseY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.clear();
    composer.render();
  };

  animate();

  // ─── Public API ──────────────────────────────────────────────────
  return {
    dispose: () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      meshes.forEach((m) => {
        (m.material as THREE.MeshLambertMaterial).map?.dispose();
        m.geometry.dispose();
        m.material.dispose();
        scene.remove(m);
      });
      renderer.dispose();
      composer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    },

    resize: () => {
      onResize();
    },

    startAssembly: () => {
      if (!assemblyStarted) {
        assemblyStarted = true;
        assembleStartTime = performance.now();
      }
    },
  };
}
