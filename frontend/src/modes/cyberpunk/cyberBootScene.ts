import * as THREE from 'three/webgpu';
import {
  Fn, uniform, storage, vec2, vec3, color, hue,
  pass, time, deltaTime, instanceIndex, Loop,
  hash, pcurve, sin, cos, PI, TWO_PI, float, atan, fract, floor,
  mx_fractal_noise_vec3, mx_fractal_noise_float,
  If, step, uv, clamp, max, min, mix,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { dof } from 'three/examples/jsm/tsl/display/DepthOfFieldNode.js';
// ─── Constants ───────────────────────────────────────────────────────
const NB_PARTICLES = 2 ** 12; // 4096
const NB_VERTICES_PER_PARTICLE = 8;
const NB_TOTAL_VERTICES = NB_PARTICLES * NB_VERTICES_PER_PARTICLE;
const BOOT_DURATION = 8.0;

// ─── TSL CRT subpixel mask (pure TSL, no WGSL, no re-sampling) ──────
// Applies RGB subpixel mask + scanline pulse directly on the color node
// using screen-space pixel coordinates. No texture re-sampling needed.
// Note: Fn typed as any because @types/three doesn't model TSL's named-param calling convention.
// @ts-ignore — TSL Fn params are NodeBuilder at type level but work as named params at runtime
const crtMask: any = Fn(({ inputColor, crtWidth, crtHeight, cellSize, borderMask, pulseIntensity, pulseWidth, pulseRate }) => {
  const dimensions = vec2(crtWidth, crtHeight);
  const pixel = uv().mul(0.5).add(0.5).mul(dimensions);

  const coord = pixel.div(cellSize);
  const subCoord = coord.mul(vec2(3.0, 1.0));

  // RGB subpixel mask
  const ind = floor(subCoord.x).mod(3);
  let maskColor = vec3(
    ind.equal(0.0),
    ind.equal(1.0),
    ind.equal(2.0),
  ).mul(3.0);

  // Cell border rounding
  const cellUV = fract(coord).mul(2.0).sub(1.0);
  const border = float(1.0).sub(cellUV.mul(cellUV).mul(borderMask));
  const clampX = clamp(border.x, 0.0, 1.0);
  const clampY = clamp(border.y, 0.0, 1.0);
  maskColor = maskColor.mul(clampX.mul(clampY));

  // Vertical scanline pulse
  const pulse = sin(pixel.y.div(pulseWidth).add(time.mul(pulseRate))).mul(pulseIntensity);

  return inputColor.mul(maskColor).mul(float(1.0).add(pulse));
});

// ─── Public API ──────────────────────────────────────────────────────
export interface CyberScene {
  dispose: () => void;
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in (navigator as any);
}

export async function initCyberScene(container: HTMLElement): Promise<CyberScene> {
  if (!isWebGPUAvailable()) {
    // Fall back to WebGL2 particle system
    const { initCyberSceneWebGL } = await import('./cyberBootSceneWebGL');
    return initCyberSceneWebGL(container);
  }

  // ─── Renderer ────────────────────────────────────────────────────
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x050812);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);
  await renderer.init();

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

  // ─── Uniforms ────────────────────────────────────────────────────
  const timeScale = uniform(1.0);
  const particleLifetime = uniform(0.8);
  const particleSize = uniform(1.0);
  const linksWidth = uniform(0.008);
  const colorOffset = uniform(0.0);
  const colorVariance = uniform(2.0);
  const colorRotationSpeed = uniform(1.0);
  const spawnIndex = uniform(0);
  const nbToSpawn = uniform(15);
  const spawnPosition = uniform(vec3(0.0));
  const previousSpawnPosition = uniform(vec3(0.0));
  const turbFrequency = uniform(0.5);
  const turbAmplitude = uniform(0.3);
  const turbOctaves = uniform(2);
  const turbLacunarity = uniform(2.0);
  const turbGain = uniform(0.5);
  const turbFriction = uniform(0.01);

  // CRT uniforms
  const crtWidthUniform = uniform(container.clientWidth);
  const crtHeightUniform = uniform(container.clientHeight);
  const cellSizeUniform = uniform(6);
  const borderMaskUniform = uniform(1.0);
  const pulseIntensityUniform = uniform(0.06);
  const pulseWidthUniform = uniform(60);
  const pulseRateUniform = uniform(20);

  // DoF uniforms
  const focusDistance = uniform(500);
  const focalLength = uniform(200);
  const bokehScale = uniform(8);

  // ─── Color function ──────────────────────────────────────────────
  const getInstanceColor = Fn(([i]: [typeof instanceIndex]) => {
    return hue(
      color(0x0066ff),
      colorOffset.add(mx_fractal_noise_float(i.toFloat().mul(0.1), 2, 2.0, 0.5, colorVariance)),
    );
  });

  // ─── Storage buffers ─────────────────────────────────────────────
  const particlePositions = storage(
    new THREE.StorageInstancedBufferAttribute(NB_PARTICLES, 4),
    'vec4',
    NB_PARTICLES,
  );
  const particleVelocities = storage(
    new THREE.StorageInstancedBufferAttribute(NB_PARTICLES, 4),
    'vec4',
    NB_PARTICLES,
  );

  // Init particles (dead)
  renderer.compute(
    Fn(() => {
      particlePositions.element(instanceIndex).xyz.assign(vec3(10000.0));
      particlePositions.element(instanceIndex).w.assign(vec3(-1.0));
    })().compute(NB_PARTICLES),
  );

  // ─── Particle output ─────────────────────────────────────────────
  const particleGeom = new THREE.PlaneGeometry(0.05, 0.05);

  const particleMaterial = new THREE.SpriteNodeMaterial();
  particleMaterial.blending = THREE.AdditiveBlending;
  particleMaterial.depthWrite = false;
  particleMaterial.positionNode = particlePositions.toAttribute();
  particleMaterial.scaleNode = vec2(particleSize);
  particleMaterial.rotationNode = atan(
    particleVelocities.toAttribute().y,
    particleVelocities.toAttribute().x,
  );

  particleMaterial.colorNode = Fn(() => {
    const life = particlePositions.toAttribute().w;
    const modLife = pcurve(life.oneMinus(), 8.0, 1.0);
    const pulse = pcurve(
      sin(hash(instanceIndex).mul(TWO_PI).add(time.mul(0.5).mul(TWO_PI))).mul(0.5).add(0.5),
      0.25,
      0.25,
    ).mul(10.0).add(1.0);
    return getInstanceColor(instanceIndex).mul(pulse.mul(modLife));
  })();

  particleMaterial.opacityNode = Fn(() => {
    const circle = step(uv().xy.sub(0.5).length(), 0.5);
    const life = particlePositions.toAttribute().w;
    return circle.mul(life);
  })();

  const particleMesh = new THREE.InstancedMesh(particleGeom, particleMaterial, NB_PARTICLES);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  scene.add(particleMesh);

  // ─── Links geometry ──────────────────────────────────────────────
  const linksIndices: number[] = [];
  for (let i = 0; i < NB_PARTICLES; i++) {
    const base = i * NB_VERTICES_PER_PARTICLE;
    for (let j = 0; j < 2; j++) {
      const off = base + j * 4;
      linksIndices.push(off, off + 1, off + 2, off, off + 2, off + 3);
    }
  }

  const linksVerticesSBA = new THREE.StorageBufferAttribute(NB_TOTAL_VERTICES, 4);
  const linksColorsSBA = new THREE.StorageBufferAttribute(NB_TOTAL_VERTICES, 4);

  const linksGeom = new THREE.BufferGeometry();
  linksGeom.setAttribute('position', linksVerticesSBA);
  linksGeom.setAttribute('color', linksColorsSBA);
  linksGeom.setIndex(linksIndices);

  const linksMaterial = new THREE.MeshBasicNodeMaterial();
  linksMaterial.vertexColors = true;
  linksMaterial.side = THREE.DoubleSide;
  linksMaterial.transparent = true;
  linksMaterial.depthWrite = false;
  linksMaterial.depthTest = false;
  linksMaterial.blending = THREE.AdditiveBlending;
  linksMaterial.opacityNode = storage(linksColorsSBA, 'vec4', linksColorsSBA.count).toAttribute().w;

  const linksMesh = new THREE.Mesh(linksGeom, linksMaterial);
  linksMesh.frustumCulled = false;
  scene.add(linksMesh);

  // ─── Compute: update particles ───────────────────────────────────
  const updateParticles = Fn(() => {
    const position = particlePositions.element(instanceIndex).xyz;
    const life = particlePositions.element(instanceIndex).w;
    const velocity = particleVelocities.element(instanceIndex).xyz;
    const dt = deltaTime.mul(0.1).mul(timeScale);

    If(life.greaterThan(0.0), () => {
      const localVel = mx_fractal_noise_vec3(
        position.mul(turbFrequency),
        turbOctaves,
        turbLacunarity,
        turbGain,
        turbAmplitude,
      ).mul(life.add(0.01));
      velocity.addAssign(localVel);
      velocity.mulAssign(turbFriction.oneMinus());
      position.addAssign(velocity.mul(dt));
      life.subAssign(dt.mul(particleLifetime.reciprocal()));

      // Find 2 closest alive particles
      const closestDist1 = float(10000.0).toVar();
      const closestPos1 = vec3(0.0).toVar();
      const closestLife1 = float(0.0).toVar();
      const closestDist2 = float(10000.0).toVar();
      const closestPos2 = vec3(0.0).toVar();
      const closestLife2 = float(0.0).toVar();

      Loop(NB_PARTICLES, ({ i }) => {
        const otherPart = particlePositions.element(i);
        If(i.notEqual(instanceIndex).and(otherPart.w.greaterThan(0.0)), () => {
          const otherPosition = otherPart.xyz;
          const dist = position.sub(otherPosition).lengthSq();
          const moreThanZero = dist.greaterThan(0.0);

          If(dist.lessThan(closestDist1).and(moreThanZero), () => {
            closestDist1.assign(dist);
            closestPos1.assign(otherPosition.xyz);
            closestLife1.assign(otherPart.w);
          }).ElseIf(dist.lessThan(closestDist2).and(moreThanZero), () => {
            closestDist2.assign(dist);
            closestPos2.assign(otherPosition.xyz);
            closestLife2.assign(otherPart.w);
          });
        });
      });

      // Update link quads
      const linksPositions = storage(linksVerticesSBA, 'vec4', linksVerticesSBA.count);
      const linksColors = storage(linksColorsSBA, 'vec4', linksColorsSBA.count);
      const firstLinkIndex = instanceIndex.mul(NB_VERTICES_PER_PARTICLE);
      const secondLinkIndex = firstLinkIndex.add(4);

      // Link 1 positions
      linksPositions.element(firstLinkIndex).xyz.assign(position);
      linksPositions.element(firstLinkIndex).y.addAssign(linksWidth);
      linksPositions.element(firstLinkIndex.add(1)).xyz.assign(position);
      linksPositions.element(firstLinkIndex.add(1)).y.addAssign(linksWidth.negate());
      linksPositions.element(firstLinkIndex.add(2)).xyz.assign(closestPos1);
      linksPositions.element(firstLinkIndex.add(2)).y.addAssign(linksWidth.negate());
      linksPositions.element(firstLinkIndex.add(3)).xyz.assign(closestPos1);
      linksPositions.element(firstLinkIndex.add(3)).y.addAssign(linksWidth);

      // Link 2 positions
      linksPositions.element(secondLinkIndex).xyz.assign(position);
      linksPositions.element(secondLinkIndex).y.addAssign(linksWidth);
      linksPositions.element(secondLinkIndex.add(1)).xyz.assign(position);
      linksPositions.element(secondLinkIndex.add(1)).y.addAssign(linksWidth.negate());
      linksPositions.element(secondLinkIndex.add(2)).xyz.assign(closestPos2);
      linksPositions.element(secondLinkIndex.add(2)).y.addAssign(linksWidth.negate());
      linksPositions.element(secondLinkIndex.add(3)).xyz.assign(closestPos2);
      linksPositions.element(secondLinkIndex.add(3)).y.addAssign(linksWidth);

      // Link colors
      const linkColor = getInstanceColor(instanceIndex);
      const l1 = max(0.0, min(closestLife1, life)).pow(0.8);
      const l2 = max(0.0, min(closestLife2, life)).pow(0.8);

      Loop(4, ({ i }) => {
        // @ts-ignore — TSL swizzle/assign not in @types/three
        linksColors.element(firstLinkIndex.add(i)).xyz.assign(linkColor);
        // @ts-ignore — TSL swizzle/assign not in @types/three
        linksColors.element(firstLinkIndex.add(i)).w.assign(l1);
        // @ts-ignore — TSL swizzle/assign not in @types/three
        linksColors.element(secondLinkIndex.add(i)).xyz.assign(linkColor);
        // @ts-ignore — TSL swizzle/assign not in @types/three
        linksColors.element(secondLinkIndex.add(i)).w.assign(l2);
      });
    });
  })().compute(NB_PARTICLES);

  // ─── Compute: spawn particles ────────────────────────────────────
  const spawnParticles = Fn(() => {
    const particleIndex = spawnIndex.add(instanceIndex).mod(NB_PARTICLES).toInt();
    const position = particlePositions.element(particleIndex).xyz;
    const life = particlePositions.element(particleIndex).w;
    const velocity = particleVelocities.element(particleIndex).xyz;

    life.assign(1.0);

    // Random spherical direction
    const rTheta = hash(particleIndex).mul(TWO_PI);
    const rPhi = hash(particleIndex.add(1)).mul(PI);
    const rx = sin(rTheta).mul(cos(rPhi));
    const ry = sin(rTheta).mul(sin(rPhi));
    const rz = cos(rTheta);
    const rDir = vec3(rx, ry, rz);

    // Interpolate spawn position
    const pos = mix(
      previousSpawnPosition,
      spawnPosition,
      instanceIndex.toFloat().div(nbToSpawn.sub(1).toFloat()).clamp(),
    );
    position.assign(pos.add(rDir.mul(0.01)));
    velocity.assign(rDir.mul(5.0));
  })().compute(nbToSpawn.value);

  // ─── Background ──────────────────────────────────────────────────
  const bgGeom = new THREE.IcosahedronGeometry(100, 5)
    .applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const bgMaterial = new THREE.MeshStandardNodeMaterial();
  bgMaterial.roughness = 0.4;
  bgMaterial.metalness = 0.9;
  bgMaterial.flatShading = true;
  bgMaterial.colorNode = color(0x000000);
  const bgMesh = new THREE.Mesh(bgGeom, bgMaterial);
  scene.add(bgMesh);

  const light = new THREE.PointLight(0xffffff, 3000);
  scene.add(light);

  // ─── Post-processing pipeline ────────────────────────────────────
  const renderPipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassViewZ = scenePass.getViewZNode();

  // 1. DoF
  const dofPass = (dof as any)(scenePassColor, scenePassViewZ, focusDistance, focalLength, bokehScale);

  // 2. Bloom (strength animated via uniform for burst effect)
  const bloomStrengthUniform = uniform(0.75);
  const bloomPass = (bloom as any)(dofPass, bloomStrengthUniform, 0.1, 0.5);

  // 3. CRT subpixel mask (applied per-fragment on bloom output)
  const crtOutput = crtMask({
    inputColor: bloomPass,
    crtWidth: crtWidthUniform,
    crtHeight: crtHeightUniform,
    cellSize: cellSizeUniform,
    borderMask: borderMaskUniform,
    pulseIntensity: pulseIntensityUniform,
    pulseWidth: pulseWidthUniform,
    pulseRate: pulseRateUniform,
  });

  renderPipeline.outputNode = crtOutput;

  // ─── State ───────────────────────────────────────────────────────
  let elapsed = 0;
  let lastTime = performance.now();
  let disposed = false;

  // ─── Resize handler ──────────────────────────────────────────────
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    crtWidthUniform.value = w;
    crtHeightUniform.value = h;
  };
  window.addEventListener('resize', onResize);

  // ─── Animation loop ──────────────────────────────────────────────
  renderer.setAnimationLoop(() => {
    if (disposed) return;

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    elapsed += dt;

    // Compute
    renderer.compute(updateParticles);
    renderer.compute(spawnParticles);

    // Update spawn index
    spawnIndex.value = (spawnIndex.value + nbToSpawn.value) % NB_PARTICLES;

    // Auto-spawn origin: Lissajous curve
    const t = elapsed * 0.3;
    previousSpawnPosition.value.copy(spawnPosition.value);
    spawnPosition.value.set(
      Math.sin(t * 1.1) * 3,
      Math.sin(t * 0.7) * 2,
      Math.sin(t * 0.5) * 1,
    );

    // Rotate colors
    colorOffset.value += dt * colorRotationSpeed.value * timeScale.value;

    // Animate light
    light.position.set(
      Math.sin(elapsed * 0.5) * 30,
      Math.cos(elapsed * 0.3) * 30,
      Math.sin(elapsed * 0.2) * 30,
    );

    // Camera animation: dolly-in z=16→5 in first 8s, then sway
    const dollyProgress = Math.min(elapsed / 8.0, 1.0);
    const eased = 1 - Math.pow(1 - dollyProgress, 3); // ease-out cubic
    camera.position.z = 16 - eased * 11; // 16 → 5
    camera.position.x = Math.sin(elapsed * 0.15) * 0.3;
    camera.position.y = Math.cos(elapsed * 0.1) * 0.2;
    camera.lookAt(0, 0, 0);

    // Bloom burst: ramp strength in last 0.5s before boot ends
    if (elapsed > BOOT_DURATION - 0.5) {
      const burstProgress = Math.min((elapsed - (BOOT_DURATION - 0.5)) / 0.5, 1.0);
      bloomStrengthUniform.value = 0.75 + burstProgress * 1.5; // 0.75 → 2.25
    }

    // Render via pipeline
    renderPipeline.render();
  });

  // ─── Dispose ─────────────────────────────────────────────────────
  const dispose = () => {
    if (disposed) return;
    disposed = true;

    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize);

    particleMesh.geometry.dispose();
    particleMaterial.dispose();
    linksGeom.dispose();
    linksMaterial.dispose();
    bgGeom.dispose();
    bgMaterial.dispose();
    renderer.dispose();

    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };

  return { dispose };
}
