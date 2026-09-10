import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Constants ───────────────────────────────────────────────────────
const NB_PARTICLES = 2048;
const BOX_SIZE = 4;
const BOOT_DURATION = 8.0;

// ─── Public API ──────────────────────────────────────────────────────
export interface CyberScene {
  dispose: () => void;
}

export async function initCyberSceneWebGL(container: HTMLElement): Promise<CyberScene> {
  // ─── Renderer ────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x050812);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // ─── Camera ──────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    200,
  );
  camera.position.set(0, 0, 16);

  // ─── Scene ───────────────────────────────────────────────────────
  const scene = new THREE.Scene();

  // ─── Particle positions + velocities (JS-side) ───────────────────
  const positions = new Float32Array(NB_PARTICLES * 3);
  const colors = new Float32Array(NB_PARTICLES * 3);
  const velocities = new Float32Array(NB_PARTICLES * 3);
  const lifetimes = new Float32Array(NB_PARTICLES);

  for (let i = 0; i < NB_PARTICLES; i++) {
    const i3 = i * 3;
    // Random start position in a sphere
    const r = Math.random() * BOX_SIZE;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Random velocity
    const speed = 0.5 + Math.random() * 2;
    const vTheta = Math.random() * Math.PI * 2;
    const vPhi = Math.acos(2 * Math.random() - 1);
    velocities[i3] = speed * Math.sin(vPhi) * Math.cos(vTheta);
    velocities[i3 + 1] = speed * Math.sin(vPhi) * Math.sin(vTheta);
    velocities[i3 + 2] = speed * Math.cos(vPhi);

    // Cyan/blue color with variation
    const hue = 0.5 + (Math.random() - 0.5) * 0.15; // 0.425–0.575
    const sat = 0.8 + Math.random() * 0.2;
    const lig = 0.5 + Math.random() * 0.3;
    const c = new THREE.Color().setHSL(hue, sat, lig);
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;

    lifetimes[i] = 1.0;
  }

  // ─── Points geometry ─────────────────────────────────────────────
  const pointsGeom = new THREE.BufferGeometry();
  pointsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointsGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pointsMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(pointsGeom, pointsMat);
  scene.add(points);

  // ─── Links geometry (line segments between nearby particles) ──────
  // Pre-allocate max possible links: each particle links to 1 nearest
  const MAX_LINKS = NB_PARTICLES;
  const linkPositions = new Float32Array(MAX_LINKS * 6); // 2 vertices × 3 components
  const linkColors = new Float32Array(MAX_LINKS * 6);
  const linkGeom = new THREE.BufferGeometry();
  linkGeom.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
  linkGeom.setAttribute('color', new THREE.BufferAttribute(linkColors, 3));

  const linkMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const links = new THREE.LineSegments(linkGeom, linkMat);
  scene.add(links);

  // ─── Background (inverted icosahedron) ───────────────────────────
  const bgGeom = new THREE.IcosahedronGeometry(100, 5)
    .applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const bgMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.4,
    metalness: 0.9,
    flatShading: true,
  });
  const bgMesh = new THREE.Mesh(bgGeom, bgMat);
  scene.add(bgMesh);

  const light = new THREE.PointLight(0xffffff, 3000);
  scene.add(light);

  // ─── Post-processing: Bloom ──────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    1.5,  // strength
    0.5,  // radius
    0.3,  // threshold
  );
  composer.addPass(bloomPass);

  // ─── State ───────────────────────────────────────────────────────
  let elapsed = 0;
  let lastTime = performance.now();
  let disposed = false;
  let linkCount = 0;

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

  // ─── Animation loop ──────────────────────────────────────────────
  const animate = () => {
    if (disposed) return;

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = now;
    elapsed += dt;

    // Update particles (JS physics)
    for (let i = 0; i < NB_PARTICLES; i++) {
      const i3 = i * 3;

      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
      positions[i3 + 2] += velocities[i3 + 2] * dt;

      // Bounce off box boundaries
      for (let j = 0; j < 3; j++) {
        if (Math.abs(positions[i3 + j]) > BOX_SIZE) {
          positions[i3 + j] = Math.sign(positions[i3 + j]) * BOX_SIZE;
          velocities[i3 + j] *= -0.8;
        }
      }
    }
    pointsGeom.attributes.position.needsUpdate = true;

    // Update links (find 1 nearest neighbor per particle, every 3 frames)
    if (Math.floor(elapsed * 60) % 3 === 0) {
      linkCount = 0;
      const maxDistSq = 3.0; // max link distance squared

      for (let i = 0; i < NB_PARTICLES && linkCount < MAX_LINKS; i++) {
        let bestDist = maxDistSq;
        let bestJ = -1;
        const i3 = i * 3;

        // Check a subset for performance (every 4th particle)
        for (let j = i + 1; j < NB_PARTICLES; j += 1) {
          if (j === i) continue;
          const j3 = j * 3;
          const dx = positions[i3] - positions[j3];
          const dy = positions[i3 + 1] - positions[j3 + 1];
          const dz = positions[i3 + 2] - positions[j3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < bestDist) {
            bestDist = distSq;
            bestJ = j;
          }
        }

        if (bestJ >= 0) {
          const lIdx = linkCount * 6;
          const i3_ = i * 3;
          const j3_ = bestJ * 3;

          linkPositions[lIdx] = positions[i3_];
          linkPositions[lIdx + 1] = positions[i3_ + 1];
          linkPositions[lIdx + 2] = positions[i3_ + 2];
          linkPositions[lIdx + 3] = positions[j3_];
          linkPositions[lIdx + 4] = positions[j3_ + 1];
          linkPositions[lIdx + 5] = positions[j3_ + 2];

          // Color from particle, with opacity based on distance
          const opacity = 1 - Math.sqrt(bestDist) / Math.sqrt(maxDistSq);
          linkColors[lIdx] = colors[i3_] * opacity;
          linkColors[lIdx + 1] = colors[i3_ + 1] * opacity;
          linkColors[lIdx + 2] = colors[i3_ + 2] * opacity;
          linkColors[lIdx + 3] = colors[j3_] * opacity;
          linkColors[lIdx + 4] = colors[j3_ + 1] * opacity;
          linkColors[lIdx + 5] = colors[j3_ + 2] * opacity;

          linkCount++;
        }
      }

      // Zero out remaining
      for (let k = linkCount * 6; k < MAX_LINKS * 6; k++) {
        linkPositions[k] = 0;
        linkColors[k] = 0;
      }
      linkGeom.setDrawRange(0, linkCount * 2);
      linkGeom.attributes.position.needsUpdate = true;
      linkGeom.attributes.color.needsUpdate = true;
    }

    // Rotate colors
    for (let i = 0; i < NB_PARTICLES; i++) {
      const i3 = i * 3;
      const c = new THREE.Color(colors[i3], colors[i3 + 1], colors[i3 + 2]);
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      hsl.h += dt * 0.05;
      c.setHSL(hsl.h, hsl.s, hsl.l);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }
    pointsGeom.attributes.color.needsUpdate = true;

    // Animate light
    light.position.set(
      Math.sin(elapsed * 0.5) * 30,
      Math.cos(elapsed * 0.3) * 30,
      Math.sin(elapsed * 0.2) * 30,
    );

    // Camera animation: dolly-in z=16→5 in first 8s, then sway
    const dollyProgress = Math.min(elapsed / 8.0, 1.0);
    const eased = 1 - Math.pow(1 - dollyProgress, 3);
    camera.position.z = 16 - eased * 11;
    camera.position.x = Math.sin(elapsed * 0.15) * 0.3;
    camera.position.y = Math.cos(elapsed * 0.1) * 0.2;
    camera.lookAt(0, 0, 0);

    // Bloom burst: ramp strength in last 0.5s before boot ends
    if (elapsed > BOOT_DURATION - 0.5) {
      const burstProgress = Math.min((elapsed - (BOOT_DURATION - 0.5)) / 0.5, 1.0);
      bloomPass.strength = 1.5 + burstProgress * 2.0; // 1.5 → 3.5
    }

    // Render with bloom
    composer.render();
  };

  renderer.setAnimationLoop(animate);

  // ─── Dispose ─────────────────────────────────────────────────────
  const dispose = () => {
    if (disposed) return;
    disposed = true;

    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);

    pointsGeom.dispose();
    pointsMat.dispose();
    linkGeom.dispose();
    linkMat.dispose();
    bgGeom.dispose();
    bgMat.dispose();
    composer.dispose();
    renderer.dispose();

    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };

  return { dispose };
}
