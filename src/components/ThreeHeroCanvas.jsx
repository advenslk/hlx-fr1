import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const _targetVec = new THREE.Vector3();

function createSvgShape(buildFn) {
  const shape = new THREE.Shape();
  buildFn(shape);
  return shape;
}

// Coordinate helper mapping SVG viewBox space (centered ~390, 208) into Three.js world space (+Y up)
const CX = 390;
const CY = 208;
const SCALE = 0.0115;
const sx = (x) => (x - CX) * SCALE;
const sy = (y) => -(y - CY) * SCALE;

function buildHShape() {
  return createSvgShape((s) => {
    s.moveTo(sx(174), sy(103));
    s.quadraticCurveTo(sx(174), sy(70), sx(207), sy(70));
    s.lineTo(sx(218), sy(70));
    s.quadraticCurveTo(sx(251), sy(70), sx(251), sy(103));
    s.lineTo(sx(251), sy(165));
    s.lineTo(sx(367), sy(165));
    s.quadraticCurveTo(sx(389), sy(165), sx(405), sy(181));
    s.lineTo(sx(424), sy(200));
    s.lineTo(sx(405), sy(219));
    s.quadraticCurveTo(sx(389), sy(235), sx(367), sy(235));
    s.lineTo(sx(251), sy(235));
    s.lineTo(sx(251), sy(316));
    s.quadraticCurveTo(sx(251), sy(349), sx(218), sy(349));
    s.lineTo(sx(207), sy(349));
    s.quadraticCurveTo(sx(174), sy(349), sx(174), sy(316));
    s.closePath();
  });
}

function buildSlashShape() {
  return createSvgShape((s) => {
    s.moveTo(sx(338), sy(345));
    s.quadraticCurveTo(sx(328), sy(345), sx(334), sy(335));
    s.lineTo(sx(510), sy(82));
    s.quadraticCurveTo(sx(520), sy(66), sx(539), sy(66));
    s.lineTo(sx(577), sy(66));
    s.quadraticCurveTo(sx(596), sy(66), sx(585), sy(84));
    s.lineTo(sx(417), sy(334));
    s.quadraticCurveTo(sx(409), sy(345), sx(391), sy(345));
    s.closePath();
  });
}

function FallbackSvgLogo() {
  return (
    <div className="hx-logo-stage">
      <svg className="hx-logo-svg" viewBox="0 0 800 500" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="hxMetalFace" x1="0" y1="0" x2=".9" y2="1">
            <stop offset="0" stopColor="#f4fbff" />
            <stop offset=".12" stopColor="#c5d7ed" />
            <stop offset=".27" stopColor="#64758f" />
            <stop offset=".42" stopColor="#202a3c" />
            <stop offset=".54" stopColor="#9da9c3" />
            <stop offset=".69" stopColor="#41425d" />
            <stop offset=".84" stopColor="#242637" />
            <stop offset=".94" stopColor="#d3a66b" />
            <stop offset="1" stopColor="#fff0ce" />
          </linearGradient>
          <linearGradient id="hxMetalEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4fbff" />
            <stop offset=".22" stopColor="#8fc7ff" />
            <stop offset=".48" stopColor="#b5a0ff" />
            <stop offset=".72" stopColor="#535b88" />
            <stop offset=".9" stopColor="#dba95f" />
            <stop offset="1" stopColor="#fff0c6" />
          </linearGradient>
          <linearGradient id="hxMetalSheen" x1="0" y1="0" x2="1" y2=".2">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset=".22" stopColor="#d9edff" stopOpacity=".12" />
            <stop offset=".52" stopColor="#8b9dff" stopOpacity=".02" />
            <stop offset=".82" stopColor="#f7c66d" stopOpacity=".12" />
            <stop offset="1" stopColor="#fff" stopOpacity=".42" />
          </linearGradient>
          <linearGradient id="hxSweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".46" stopColor="#d9f2ff" stopOpacity=".08" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
            <stop offset=".56" stopColor="#b8a6ff" stopOpacity=".24" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id="hxGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="hx-logo-side" fill="#0d111b" stroke="#242c40" strokeWidth="7" strokeLinejoin="round">
          <path d="M174 103 Q174 70 207 70 H218 Q251 70 251 103 V165 H367 Q389 165 405 181 L424 200 L405 219 Q389 235 367 235 H251 V316 Q251 349 218 349 H207 Q174 349 174 316 Z" transform="translate(-8 28)" />
          <path d="M338 345 Q328 345 334 335 L510 82 Q520 66 539 66 H577 Q596 66 585 84 L417 334 Q409 345 391 345 Z" transform="translate(-8 28)" />
          <path d="M174 103 Q174 70 207 70 H218 Q251 70 251 103 V165 H367 Q389 165 405 181 L424 200 L405 219 Q389 235 367 235 H251 V316 Q251 349 218 349 H207 Q174 349 174 316 Z" transform="translate(-4 14)" fill="#242b3b" stroke="#65718c" strokeWidth="5" />
          <path d="M338 345 Q328 345 334 335 L510 82 Q520 66 539 66 H577 Q596 66 585 84 L417 334 Q409 345 391 345 Z" transform="translate(-4 14)" fill="#242b3b" stroke="#65718c" strokeWidth="5" />
        </g>
        <g className="hx-logo-face" fill="url(#hxMetalFace)" stroke="url(#hxMetalEdge)" strokeWidth="4" strokeLinejoin="round">
          <path d="M174 103 Q174 70 207 70 H218 Q251 70 251 103 V165 H367 Q389 165 405 181 L424 200 L405 219 Q389 235 367 235 H251 V316 Q251 349 218 349 H207 Q174 349 174 316 Z" />
          <path d="M338 345 Q328 345 334 335 L510 82 Q520 66 539 66 H577 Q596 66 585 84 L417 334 Q409 345 391 345 Z" />
        </g>
        <g className="hx-logo-sheen" fill="url(#hxMetalSheen)">
          <path d="M174 103 Q174 70 207 70 H218 Q251 70 251 103 V165 H367 Q389 165 405 181 L424 200 L405 219 Q389 235 367 235 H251 V316 Q251 349 218 349 H207 Q174 349 174 316 Z" />
          <path d="M338 345 Q328 345 334 335 L510 82 Q520 66 539 66 H577 Q596 66 585 84 L417 334 Q409 345 391 345 Z" />
        </g>
        <path className="hx-logo-bevel-line" d="M190 95 Q190 86 207 86 H218 Q235 86 235 103 V151 H364 Q383 151 397 169 M350 328 L519 88 Q526 78 542 78 H574" fill="none" stroke="#f2f8ff" strokeOpacity=".82" strokeWidth="3" strokeLinecap="round" />
        <path className="hx-logo-highlight" d="M183 112 V305 Q183 338 211 338 H218 Q241 338 241 312 V226 H367 Q389 226 405 210 L414 200 M349 333 L518 91 Q526 78 542 78 H574" fill="none" stroke="url(#hxSweep)" strokeWidth="7" strokeLinecap="round" filter="url(#hxGlow)" />
        <g className="hx-copyright" fill="none" stroke="url(#hxMetalEdge)" strokeWidth="5">
          <circle cx="641" cy="88" r="29" />
          <path d="M652 75 A16 16 0 1 0 652 101" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

export default function ThreeHeroCanvas() {
  const containerRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    let isSoftwareGl = false;
    try {
      const probe = document.createElement('canvas').getContext('webgl2')
        || document.createElement('canvas').getContext('webgl');
      if (!probe) {
        setWebglFailed(true);
        return undefined;
      }
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param) || '');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      setWebglFailed(true);
      return undefined;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'hx-three-canvas';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const initialW = Math.max(container.clientWidth || 560, 260);
    const initialH = Math.max(container.clientHeight || 420, 220);
    renderer.setSize(initialW, initialH, false);

    const camera = new THREE.PerspectiveCamera(34, initialW / initialH, 0.1, 100);
    camera.position.set(0, 0.05, 8.6);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Studio Lighting with Warm Gold + Cool Titanium contrast
    const hemiLight = new THREE.HemisphereLight(0xc2dcff, 0x1d140c, 1.05);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffdf9e, 3.2);
    keyLight.position.set(5.5, 6.2, 6.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7fb4ff, 2.5);
    rimLight.position.set(-6.0, 2.8, -4.5);
    scene.add(rimLight);

    const goldUnderLight = new THREE.PointLight(0xf5b041, 14, 18, 1.8);
    goldUnderLight.position.set(2.8, -2.5, 3.6);
    scene.add(goldUnderLight);

    const violetAccentLight = new THREE.PointLight(0xa569bd, 11, 16, 1.8);
    violetAccentLight.position.set(-3.4, 2.4, 2.8);
    scene.add(violetAccentLight);

    // Master hero 3D group (composite multi-part assembly)
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    const hShape = buildHShape();
    const slashShape = buildSlashShape();

    // 1. Primary Extruded Titanium-Chrome Front Face
    const frontExtrudeSettings = {
      depth: 0.42,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 2,
      bevelSize: 0.065,
      bevelThickness: 0.095,
      curveSegments: 24
    };
    const hFrontGeo = new THREE.ExtrudeGeometry(hShape, frontExtrudeSettings);
    const slashFrontGeo = new THREE.ExtrudeGeometry(slashShape, frontExtrudeSettings);
    hFrontGeo.computeVertexNormals();
    slashFrontGeo.computeVertexNormals();

    const chromeFaceMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9e6f6,
      metalness: 0.94,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      anisotropy: 0.85,
      anisotropyRotation: 0.35,
      envMapIntensity: 1.55
    });

    const goldSlashMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6c382,
      metalness: 0.96,
      roughness: 0.19,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      anisotropy: 0.75,
      envMapIntensity: 1.5
    });

    const hFrontMesh = new THREE.Mesh(hFrontGeo, chromeFaceMat);
    hFrontMesh.position.z = -0.14;
    hFrontMesh.castShadow = !isSoftwareGl;
    hFrontMesh.receiveShadow = true;

    const slashFrontMesh = new THREE.Mesh(slashFrontGeo, goldSlashMat);
    slashFrontMesh.position.z = -0.10; // slightly proud in Z for authentic layered relief
    slashFrontMesh.castShadow = !isSoftwareGl;
    slashFrontMesh.receiveShadow = true;

    // 2. Stepped Dark Anodized Obsidian-Steel Rear Backing Chassis
    const backExtrudeSettings = {
      depth: 0.62,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.11,
      bevelThickness: 0.12,
      curveSegments: 20
    };
    const hBackGeo = new THREE.ExtrudeGeometry(hShape, backExtrudeSettings);
    const slashBackGeo = new THREE.ExtrudeGeometry(slashShape, backExtrudeSettings);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x161b26,
      metalness: 0.82,
      roughness: 0.44,
      envMapIntensity: 1.1
    });

    const hBackMesh = new THREE.Mesh(hBackGeo, chassisMat);
    hBackMesh.position.z = -0.58;
    const slashBackMesh = new THREE.Mesh(slashBackGeo, chassisMat);
    slashBackMesh.position.z = -0.54;

    // 3. Registered (C) Emblem in upper right matching brand mark
    const copyrightGroup = new THREE.Group();
    copyrightGroup.position.set(sx(641), sy(88), 0.14);

    const outerRingGeo = new THREE.TorusGeometry(29 * SCALE, 3.2 * SCALE, 16, 48);
    const outerRingMat = new THREE.MeshPhysicalMaterial({
      color: 0xc2d7f0,
      metalness: 0.95,
      roughness: 0.14,
      clearcoat: 1.0,
      envMapIntensity: 1.6
    });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);

    const innerArcGeo = new THREE.TorusGeometry(15.5 * SCALE, 2.8 * SCALE, 14, 36, Math.PI * 1.42);
    const innerArcMesh = new THREE.Mesh(innerArcGeo, goldSlashMat);
    innerArcMesh.rotation.z = Math.PI * 0.29;
    innerArcMesh.position.z = 0.04;

    copyrightGroup.add(outerRingMesh, innerArcMesh);

    // 4. Precision Gyroscopic Orbital Rings framing the monument
    const ringOneGeo = new THREE.TorusGeometry(3.05, 0.018, 12, 110);
    const ringOneMat = new THREE.MeshStandardMaterial({
      color: 0x9ab8e8,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x1b2d4f,
      emissiveIntensity: 0.55
    });
    const ringOne = new THREE.Mesh(ringOneGeo, ringOneMat);
    ringOne.rotation.set(Math.PI * 0.38, Math.PI * 0.14, 0);
    ringOne.position.z = -0.35;

    const ringTwoGeo = new THREE.TorusGeometry(2.58, 0.015, 12, 100);
    const ringTwoMat = new THREE.MeshStandardMaterial({
      color: 0xf5b041,
      metalness: 0.88,
      roughness: 0.28,
      emissive: 0x5c3608,
      emissiveIntensity: 0.6
    });
    const ringTwo = new THREE.Mesh(ringTwoGeo, ringTwoMat);
    ringTwo.rotation.set(-Math.PI * 0.34, Math.PI * 0.26, 0);
    ringTwo.position.z = -0.25;

    // 5. Instanced 3D Geometric Dust / Satellites for volumetric depth
    const nodeCount = 26;
    const nodeGeo = new THREE.OctahedronGeometry(0.055, 0);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xf6cf7c,
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0x704810,
      emissiveIntensity: 0.55
    });
    const nodesMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
    const nodeOrbitData = [];
    const _dummyMat = new THREE.Matrix4();
    const _dummyQuat = new THREE.Quaternion();
    const _dummyEuler = new THREE.Euler();
    const _dummyPos = new THREE.Vector3();
    const _dummyScale = new THREE.Vector3();

    for (let i = 0; i < nodeCount; i += 1) {
      const angle = (i / nodeCount) * Math.PI * 2;
      const radius = 2.35 + (i % 5) * 0.36;
      const ySpread = ((i % 7) - 3) * 0.42;
      const zSpread = ((i % 4) - 1.5) * 0.55;
      const sc = 0.65 + (i % 4) * 0.22;
      nodeOrbitData.push({ angle, radius, ySpread, zSpread, speed: 0.18 + (i % 3) * 0.08, sc });
    }
    nodesMesh.frustumCulled = false;

    const emblemPivot = new THREE.Group();
    emblemPivot.add(hBackMesh, slashBackMesh, hFrontMesh, slashFrontMesh, copyrightGroup);
    emblemPivot.rotation.set(0.06, -0.22, 0.01);

    heroGroup.add(emblemPivot, ringOne, ringTwo, nodesMesh);

    // Interactive pointer tilt + click-drag 3D inspection state
    const pointer = {
      targetRotY: -0.18,
      targetRotX: 0.06,
      dragging: false,
      lastX: 0,
      lastY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0
    };

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (pointer.dragging) {
        const dx = e.clientX - pointer.lastX;
        const dy = e.clientY - pointer.lastY;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
        pointer.dragOffsetY += dx * 0.008;
        pointer.dragOffsetX += dy * 0.006;
        pointer.dragOffsetX = THREE.MathUtils.clamp(pointer.dragOffsetX, -0.65, 0.65);
        pointer.dragOffsetY = THREE.MathUtils.clamp(pointer.dragOffsetY, -0.95, 0.95);
        return;
      }
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.targetRotY = -0.14 + nx * 0.36;
      pointer.targetRotX = 0.05 + ny * 0.24;
    };

    const onPointerDown = (e) => {
      pointer.dragging = true;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      container.style.cursor = 'grabbing';
    };

    const onPointerUp = () => {
      pointer.dragging = false;
      container.style.cursor = 'grab';
    };

    const onPointerLeave = () => {
      pointer.dragging = false;
      pointer.targetRotY = -0.18;
      pointer.targetRotX = 0.06;
      container.style.cursor = 'grab';
    };

    container.style.cursor = 'grab';
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);

    const onContextLost = (e) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(Math.round(entry.contentRect.width), 240);
        const h = Math.max(Math.round(entry.contentRect.height), 200);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function updateScene(elapsed, delta) {
      if (!pointer.dragging) {
        pointer.dragOffsetX = THREE.MathUtils.damp(pointer.dragOffsetX, 0, 2.2, delta);
        pointer.dragOffsetY = THREE.MathUtils.damp(pointer.dragOffsetY, 0, 2.2, delta);
      }

      const idleBreathY = prefersReducedMotion ? 0 : Math.sin(elapsed * 0.95) * 0.14;
      const idleBreathX = prefersReducedMotion ? 0 : Math.cos(elapsed * 0.72) * 0.06;
      const idleFloat = prefersReducedMotion ? 0 : Math.sin(elapsed * 1.15) * 0.14;

      const desiredY = pointer.targetRotY + pointer.dragOffsetY + idleBreathY;
      const desiredX = pointer.targetRotX + pointer.dragOffsetX + idleBreathX;

      heroGroup.rotation.y = THREE.MathUtils.damp(heroGroup.rotation.y, desiredY, 5.5, delta);
      heroGroup.rotation.x = THREE.MathUtils.damp(heroGroup.rotation.x, desiredX, 5.5, delta);
      heroGroup.position.y = THREE.MathUtils.damp(heroGroup.position.y, idleFloat, 4.5, delta);

      if (!prefersReducedMotion) {
        ringOne.rotation.z = elapsed * 0.24;
        ringTwo.rotation.z = -elapsed * 0.19;

        goldUnderLight.position.x = Math.cos(elapsed * 0.7) * 3.1;
        goldUnderLight.position.y = Math.sin(elapsed * 0.55) * 2.2;

        for (let i = 0; i < nodeCount; i += 1) {
          const item = nodeOrbitData[i];
          const a = item.angle + elapsed * item.speed;
          _dummyPos.set(
            Math.cos(a) * item.radius,
            item.ySpread + Math.sin(elapsed * 1.1 + i) * 0.18,
            item.zSpread + Math.sin(a) * (item.radius * 0.42)
          );
          _dummyEuler.set(elapsed * 0.7 + i, elapsed * 0.9 + i, 0);
          _dummyQuat.setFromEuler(_dummyEuler);
          _dummyScale.setScalar(item.sc);
          _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
          nodesMesh.setMatrixAt(i, _dummyMat);
        }
        nodesMesh.instanceMatrix.needsUpdate = true;
      } else {
        for (let i = 0; i < nodeCount; i += 1) {
          const item = nodeOrbitData[i];
          _dummyPos.set(
            Math.cos(item.angle) * item.radius,
            item.ySpread,
            item.zSpread + Math.sin(item.angle) * (item.radius * 0.42)
          );
          _dummyEuler.set(0.4, item.angle, 0);
          _dummyQuat.setFromEuler(_dummyEuler);
          _dummyScale.setScalar(item.sc);
          _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
          nodesMesh.setMatrixAt(i, _dummyMat);
        }
        nodesMesh.instanceMatrix.needsUpdate = true;
      }

      _targetVec.set(0, 0, 0);
      camera.lookAt(_targetVec);
    }

    function afterDraw(cb) {
      const gl = renderer.getContext();
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      updateScene(elapsed, delta);
      renderer.render(scene, camera);

      if (prefersReducedMotion && !pointer.dragging) {
        return;
      }
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    updateScene(0, 0.016);
    renderer.render(scene, camera);
    if (!prefersReducedMotion) {
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      hFrontGeo.dispose();
      slashFrontGeo.dispose();
      hBackGeo.dispose();
      slashBackGeo.dispose();
      outerRingGeo.dispose();
      innerArcGeo.dispose();
      ringOneGeo.dispose();
      ringTwoGeo.dispose();
      nodeGeo.dispose();

      chromeFaceMat.dispose();
      goldSlashMat.dispose();
      chassisMat.dispose();
      outerRingMat.dispose();
      ringOneMat.dispose();
      ringTwoMat.dispose();
      nodeMat.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className="hx-hero-scene"
      role="img"
      aria-label="HelzerX HX 3D interactive chrome and gold monument"
    >
      <div className="hx-hero-volumetric-aura" aria-hidden="true" />
      {webglFailed ? (
        <FallbackSvgLogo />
      ) : (
        <div
          ref={containerRef}
          className="hx-three-mount"
          title="Move or drag to inspect HX 3D emblem"
        />
      )}
    </div>
  );
}
