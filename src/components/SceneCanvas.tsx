'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Axis = 'x' | 'y' | 'z';
function getAxis(v: THREE.Vector3, axis: string): number {
  return v[axis as Axis];
}
function setAxis(v: THREE.Vector3, axis: string, val: number): void {
  v[axis as Axis] = val;
}

interface SceneCanvasProps {
  onTransition?: () => void;
}

export default function SceneCanvas({ onTransition }: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current!;
    if (!container) return;

    /* ─── State ─── */
    let scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      renderer: THREE.WebGLRenderer,
      clock: THREE.Clock;
    let model: THREE.Group | null = null;
    let bananaGroup: THREE.Group | null = null;
    let tapeMesh: THREE.Mesh | null = null;

    const tapeUniforms = {
      uPeel: { value: 0.0 },
      uCurlR: { value: 0.12 },
      uPeelNormal: { value: new THREE.Vector3(0, 0, 0) },
      uFlatDir: { value: new THREE.Vector3(0, 0, 0) },
      uPeelEdge: { value: 0.0 },
      uMaxDist: { value: 1.0 },
    };

    let lengthAxis: string, widthAxis: string, flatAxis: string;
    let tapeBB: THREE.Box3;
    const flatDir = new THREE.Vector3();

    // Interaction State
    let isDragging = false;
    let peelConfigured = false;
    let dragLastX = 0, dragLastY = 0;

    let isDeterminingDir = false;
    let dragStartX = 0, dragStartY = 0;
    let dragStartLocalHit: THREE.Vector3 | null = null;
    const mouseNDC = new THREE.Vector2();
    const lastMouseDelta = new THREE.Vector2(0, 1);

    let targetPeelProgress = 0;
    let currentPeelProgress = 0;
    let curPeelAxis: string | null = null;
    let curPeelSign = 0;

    // Physics State
    let bananaFalling = false;
    let fallVel = 0;
    let bananaRotVelX = 2.0;
    let settled = false;
    let bananaFallThreshold = 1.0;
    let bananaBBInTape: THREE.Box3 | null = null;
    let transitionFired = false;

    let isTorn = false;
    const tapeVel = new THREE.Vector3();
    const tapeRotVel = new THREE.Vector3();

    let tapeHitTarget: THREE.Mesh | null = null;
    const raycaster = new THREE.Raycaster();

    let animFrameId: number;
    let disposed = false;

    /* ─── Audio ─── */
    let audioCtx: AudioContext | null = null;
    let peelNode: AudioBufferSourceNode | null = null;
    let peelGain: GainNode | null = null;

    function ensureAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      return audioCtx;
    }

    function startPeelSound() {
      const ctx = ensureAudio();
      if (peelNode) return;
      const bufSize = ctx.sampleRate * 0.1;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

      peelNode = ctx.createBufferSource();
      peelNode.buffer = buf;
      peelNode.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 600;

      peelGain = ctx.createGain();
      peelGain.gain.value = 0.08;

      peelNode.connect(bp); bp.connect(hp); hp.connect(peelGain); peelGain.connect(ctx.destination);
      peelNode.start();
    }

    function stopPeelSound() {
      if (peelNode) { try { peelNode.stop(); } catch (_) { /* noop */ } peelNode = null; }
      peelGain = null;
    }

    function playRipSound() {
      const ctx = ensureAudio();
      const now = ctx.currentTime;
      const bufSize = ctx.sampleRate * 0.15;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start(now); src.stop(now + 0.15);
    }

    function playThudSound() {
      const ctx = ensureAudio();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.25);

      const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(300, now);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.1);
      g2.gain.setValueAtTime(0.15, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.start(now); osc2.stop(now + 0.12);
    }

    /* ─── Responsive helpers ─── */
    const BASE_MODEL_SCALE = 3;
    const CAMERA_Z = 6;
    const BANANA_Z = -0.8;
    let modelBaseSize = 1;
    let modelScreenWidthRatio = 1;

    function getResponsiveScale(aspect: number): number {
      if (aspect >= 1) return 1;
      const dist = CAMERA_Z - BANANA_Z;
      const halfTan = Math.tan(THREE.MathUtils.degToRad(45 / 2));
      const visibleW = 2 * halfTan * dist * aspect;
      const baseW = BASE_MODEL_SCALE * modelScreenWidthRatio;
      return Math.max((visibleW * 0.92) / baseW, 1);
    }

    function updateResponsive() {
      if (!bananaGroup || !container) return;
      const aspect = container.clientWidth / container.clientHeight;
      const s = (BASE_MODEL_SCALE * getResponsiveScale(aspect)) / modelBaseSize;
      bananaGroup.scale.setScalar(s);
    }

    /* ─── Init ─── */
    function init() {
      scene = new THREE.Scene();

      const aspect = container.clientWidth / container.clientHeight;
      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
      camera.position.set(0, 0, CAMERA_Z);

      const isMobile = container.clientWidth < 768;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));

      const shadowRes = isMobile ? 1024 : 2048;
      const d = new THREE.DirectionalLight(0xffffff, 1.5);
      d.position.set(4, 5, 5);
      d.castShadow = true;
      d.shadow.mapSize.width = shadowRes;
      d.shadow.mapSize.height = shadowRes;
      d.shadow.bias = -0.0005;
      scene.add(d);

      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.ShadowMaterial({ opacity: 0.15 })
      );
      wall.position.z = -1.2;
      wall.receiveShadow = true;
      scene.add(wall);

      clock = new THREE.Clock();
      loadModel();

      window.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('resize', onResize);

      animate();
    }

    function loadModel() {
      new GLTFLoader().load('/models/banana.glb', (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        let origTape: THREE.Mesh | null = null;

        model.traverse((obj) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (mesh.name.toLowerCase() === 'defaultmaterial') {
            origTape = mesh;
            // ✨ 重点修改：将颜色调亮，更接近真实的银灰色管道胶布，并增加轻微反光
            if (mesh.material) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.color = new THREE.Color(0xb5b7b9); // 调亮的银灰色
              mat.roughness = 0.45; // 稍微降低粗糙度，增加胶带的光泽感
              mat.metalness = 0.1;  // 微微的金属感辅助高光表现
            }
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        modelBaseSize = Math.max(size.x, size.y, size.z);
        modelScreenWidthRatio = size.x / modelBaseSize;

        model.position.copy(center).multiplyScalar(-1);

        const aspect = container.clientWidth / container.clientHeight;
        const s = (BASE_MODEL_SCALE * getResponsiveScale(aspect)) / modelBaseSize;

        bananaGroup = new THREE.Group();
        bananaGroup.add(model);
        bananaGroup.scale.setScalar(s);
        bananaGroup.rotation.x = Math.PI / 2;
        bananaGroup.position.z = -0.8;

        scene.add(bananaGroup);
        setLoading(false);

        if (origTape) setupTapePeel(origTape);
      });
    }

    function setupTapePeel(mesh: THREE.Mesh) {
      tapeMesh = mesh;
      mesh.frustumCulled = false;

      mesh.geometry.computeBoundingBox();
      tapeBB = mesh.geometry.boundingBox!;
      const bSize = tapeBB.getSize(new THREE.Vector3());
      const bCenter = tapeBB.getCenter(new THREE.Vector3());

      const dims = [
        { axis: 'x', len: bSize.x },
        { axis: 'y', len: bSize.y },
        { axis: 'z', len: bSize.z },
      ].sort((a, b) => b.len - a.len);

      lengthAxis = dims[0].axis;
      widthAxis = dims[1].axis;
      flatAxis = dims[2].axis;

      bananaGroup!.updateMatrixWorld(true);
      const testDir = new THREE.Vector3();
      setAxis(testDir, flatAxis, 1);
      const worldDir = testDir.clone().transformDirection(mesh.matrixWorld);
      flatDir.set(0, 0, 0);
      setAxis(flatDir, flatAxis, worldDir.z >= 0 ? 1 : -1);
      tapeUniforms.uFlatDir.value.copy(flatDir);

      const vertCount = mesh.geometry.getAttribute('position').count;
      if (vertCount < 60) {
        const newGeo = new THREE.PlaneGeometry(
          getAxis(bSize, widthAxis), getAxis(bSize, lengthAxis), 4, 80
        );
        const pa = newGeo.getAttribute('position');
        const tmp = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) {
          tmp.set(0, 0, 0);
          setAxis(tmp, widthAxis, pa.getX(i));
          setAxis(tmp, lengthAxis, pa.getY(i));
          setAxis(tmp, flatAxis, 0);
          tmp.x += bCenter.x; tmp.y += bCenter.y; tmp.z += bCenter.z;
          pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
        }
        pa.needsUpdate = true;
        newGeo.computeVertexNormals();
        newGeo.computeBoundingBox();
        mesh.geometry.dispose();
        mesh.geometry = newGeo;
        tapeBB = newGeo.boundingBox!;
      }

      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.side = THREE.DoubleSide;

      mat.transparent = true;
      mat.depthWrite = true;
      mat.alphaTest = 0.05;

      const patchShader = (shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string }) => {
        shader.uniforms.uPeel = tapeUniforms.uPeel;
        shader.uniforms.uCurlR = tapeUniforms.uCurlR;
        shader.uniforms.uPeelNormal = tapeUniforms.uPeelNormal;
        shader.uniforms.uFlatDir = tapeUniforms.uFlatDir;
        shader.uniforms.uPeelEdge = tapeUniforms.uPeelEdge;
        shader.uniforms.uMaxDist = tapeUniforms.uMaxDist;

        shader.vertexShader = shader.vertexShader.replace(
          'void main() {',
          `
          uniform float uPeel;
          uniform float uCurlR;
          uniform vec3  uPeelNormal;
          uniform vec3  uFlatDir;
          uniform float uPeelEdge;
          uniform float uMaxDist;
          void main() {
          `
        );

        shader.vertexShader = shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
          #include <beginnormal_vertex>
          {
            float _nd  = dot(vec3(position), uPeelNormal) - uPeelEdge;
            float _npl = uPeel * uMaxDist;
            float _ns  = _npl - _nd;
            if (_ns > 0.0 && uMaxDist > 0.0) {
              float _na  = _ns / uCurlR;
              float _c   = cos(_na);
              float _sn  = sin(_na);
              float _nP  = dot(objectNormal, uPeelNormal);
              float _nF  = dot(objectNormal, uFlatDir);
              vec3  _tgt = cross(uPeelNormal, uFlatDir);
              float _nK  = dot(objectNormal, _tgt);
              objectNormal = uPeelNormal * (_nP * _c + _nF * _sn)
                           + uFlatDir   * (-_nP * _sn + _nF * _c)
                           + _tgt       * _nK;
            }
          }
          `
        );

        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          {
            float _d = dot(transformed, uPeelNormal) - uPeelEdge;
            float _peelLine = uPeel * uMaxDist;
            float _s = _peelLine - _d;
            if (_s > 0.0 && uMaxDist > 0.0) {
              float _a  = _s / uCurlR;
              float _dN = _s - uCurlR * sin(_a);
              float _dF = uCurlR * (1.0 - cos(_a));
              transformed += uPeelNormal * _dN + uFlatDir * _dF;
            }
          }
          `
        );
      };

      mat.onBeforeCompile = patchShader;
      mesh.material = mat;
      mat.needsUpdate = true;

      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.1 });
      depthMat.onBeforeCompile = patchShader;
      mesh.customDepthMaterial = depthMat;

      bananaGroup!.updateMatrixWorld(true);
      const tapeInvMatrix = mesh.matrixWorld.clone().invert();
      bananaBBInTape = new THREE.Box3();

      model!.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh || obj === mesh) return;
        const wPos = new THREE.Vector3();
        obj.getWorldPosition(wPos);
        wPos.applyMatrix4(tapeInvMatrix);
        bananaBBInTape!.expandByPoint(wPos);
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.computeBoundingBox();
          const bb = (obj as THREE.Mesh).geometry.boundingBox!;
          const corners = [
            new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
            new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
            new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
            new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
            new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
            new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
            new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
            new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z),
          ];
          const toTapeLocal = tapeInvMatrix.clone().multiply((obj as THREE.Mesh).matrixWorld);
          for (const c of corners) { c.applyMatrix4(toTapeLocal); bananaBBInTape!.expandByPoint(c); }
        }
      });

      const hitGeo = new THREE.PlaneGeometry(getAxis(bSize, widthAxis) * 1.5, getAxis(bSize, lengthAxis) * 1.5);
      const hitPa = hitGeo.getAttribute('position');
      const htmp = new THREE.Vector3();
      for (let i = 0; i < hitPa.count; i++) {
        htmp.set(0, 0, 0);
        setAxis(htmp, widthAxis, hitPa.getX(i));
        setAxis(htmp, lengthAxis, hitPa.getY(i));
        setAxis(htmp, flatAxis, 0);
        htmp.x += bCenter.x; htmp.y += bCenter.y; htmp.z += bCenter.z;
        hitPa.setXYZ(i, htmp.x, htmp.y, htmp.z);
      }
      hitPa.needsUpdate = true;
      hitGeo.computeBoundingBox();

      tapeHitTarget = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      mesh.parent!.add(tapeHitTarget);
      tapeHitTarget.position.copy(mesh.position);
      tapeHitTarget.quaternion.copy(mesh.quaternion);
      tapeHitTarget.scale.copy(mesh.scale);
    }

    function onDown(e: PointerEvent) {
      if (isTorn || !tapeMesh) return;

      mouseNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      raycaster.setFromCamera(mouseNDC, camera);
      const target = tapeHitTarget || tapeMesh;
      const hits = raycaster.intersectObject(target);
      if (!hits.length) return;

      isDragging = true;
      document.body.style.cursor = 'grabbing';
      ensureAudio();
      setHintVisible(false);

      if (currentPeelProgress > 0.05) {
        isDeterminingDir = false;
        peelConfigured = true;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        startPeelSound();
      } else {
        isDeterminingDir = true;
        peelConfigured = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        bananaGroup!.updateMatrixWorld(true);
        dragStartLocalHit = tapeMesh.worldToLocal(hits[0].point.clone());
      }
    }

    function onMove(e: PointerEvent) {
      if (!isDragging || isTorn) return;

      mouseNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      if (isDeterminingDir) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) < 8) return;

        raycaster.setFromCamera(mouseNDC, camera);
        const hits = raycaster.intersectObject(tapeHitTarget || tapeMesh!);

        let chosenAxis = lengthAxis;
        let localDrag = new THREE.Vector3();

        if (hits.length) {
          const newLocalHit = tapeMesh!.worldToLocal(hits[0].point.clone());
          localDrag = newLocalHit.sub(dragStartLocalHit!);
        }

        if (hits.length && localDrag.lengthSq() > 0.0001) {
          const lenMove = Math.abs(getAxis(localDrag, lengthAxis));
          const widMove = Math.abs(getAxis(localDrag, widthAxis));
          chosenAxis = widMove > lenMove ? widthAxis : lengthAxis;
        } else {
          const hitL = getAxis(dragStartLocalHit!, lengthAxis);
          const distL = Math.min(Math.abs(hitL - getAxis(tapeBB.min, lengthAxis)), Math.abs(getAxis(tapeBB.max, lengthAxis) - hitL));
          const hitW = getAxis(dragStartLocalHit!, widthAxis);
          const distW = Math.min(Math.abs(hitW - getAxis(tapeBB.min, widthAxis)), Math.abs(getAxis(tapeBB.max, widthAxis) - hitW));
          chosenAxis = distW < distL ? widthAxis : lengthAxis;
        }

        const hitVal = getAxis(dragStartLocalHit!, chosenAxis);
        const minVal = getAxis(tapeBB.min, chosenAxis);
        const maxVal = getAxis(tapeBB.max, chosenAxis);
        const sign = Math.abs(hitVal - minVal) < Math.abs(maxVal - hitVal) ? 1 : -1;
        const edge = sign === 1 ? minVal : maxVal;
        const span = maxVal - minVal;

        const sameDir = chosenAxis === curPeelAxis && sign === curPeelSign;
        if (!sameDir) {
          targetPeelProgress = 0;
          currentPeelProgress = 0;
          curPeelAxis = chosenAxis;
          curPeelSign = sign;

          const peelNormal = new THREE.Vector3(0, 0, 0);
          setAxis(peelNormal, chosenAxis, sign);

          tapeUniforms.uPeelNormal.value.copy(peelNormal);
          tapeUniforms.uPeelEdge.value = edge * sign;
          tapeUniforms.uMaxDist.value = span;

          if (bananaBBInTape) {
            if (sign === 1)
              bananaFallThreshold = (getAxis(bananaBBInTape.max, chosenAxis) - getAxis(tapeBB.min, chosenAxis)) / span;
            else
              bananaFallThreshold = (getAxis(tapeBB.max, chosenAxis) - getAxis(bananaBBInTape.min, chosenAxis)) / span;
            bananaFallThreshold = Math.min(Math.max(bananaFallThreshold + 0.05, 0.3), 0.95);
          }
        }

        peelConfigured = true;
        isDeterminingDir = false;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        startPeelSound();
        return;
      }

      if (!peelConfigured) return;

      const screenDx = e.clientX - dragLastX;
      const screenDy = dragLastY - e.clientY;
      const dx = screenDx / window.innerWidth;
      const dy = screenDy / window.innerHeight;
      dragLastX = e.clientX;
      dragLastY = e.clientY;

      if (Math.abs(screenDx) > 1 || Math.abs(screenDy) > 1) {
        lastMouseDelta.set(screenDx, screenDy).normalize();
      }

      const dist = Math.sqrt(dx * dx + dy * dy);
      const sensitivity = container.clientWidth < 768 ? 4.5 : 3.5;
      targetPeelProgress += dist * sensitivity;
      targetPeelProgress = Math.max(0, Math.min(1.05, targetPeelProgress));

      if (peelGain) {
        peelGain.gain.value = Math.min(0.04 + dist * 8, 0.2);
      }
    }

    function onUp() {
      isDragging = false;
      document.body.style.cursor = 'grab';
      stopPeelSound();
    }

    function tear() {
      isDragging = false;
      isTorn = true;
      bananaFalling = true;
      document.body.style.cursor = 'default';

      stopPeelSound();
      playRipSound();

      if (tapeHitTarget) tapeHitTarget.visible = false;

      if (tapeMesh) {
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        tapeMesh.getWorldPosition(wp);
        tapeMesh.getWorldQuaternion(wq);
        tapeMesh.getWorldScale(ws);

        tapeMesh.removeFromParent();
        scene.add(tapeMesh);
        tapeMesh.position.copy(wp);
        tapeMesh.quaternion.copy(wq);
        tapeMesh.scale.copy(ws);

        tapeVel.set(lastMouseDelta.x * 2, 0, Math.random() * 1);
        tapeRotVel.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      }

      setTimeout(() => { if (tapeMesh) tapeMesh.visible = false; }, 10000);
    }

    function onResize() {
      if (!container) return;
      const aspect = container.clientWidth / container.clientHeight;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      updateResponsive();
    }

    function animate() {
      if (disposed) return;
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 1 / 30);

      if (!isTorn && peelConfigured) {
        if (!bananaFalling) {
          currentPeelProgress = THREE.MathUtils.lerp(currentPeelProgress, targetPeelProgress, 0.15);
          tapeUniforms.uPeel.value = Math.min(currentPeelProgress, 1.0);
          if (currentPeelProgress >= bananaFallThreshold) {
            bananaFalling = true;
          }
        } else {
          currentPeelProgress = THREE.MathUtils.lerp(currentPeelProgress, 1.05, 0.3);
          tapeUniforms.uPeel.value = Math.min(currentPeelProgress, 1.0);
          if (currentPeelProgress >= 0.99) tear();
        }
      }

      if (isTorn && tapeMesh && tapeMesh.visible) {
        tapeVel.y -= 9.8 * dt;
        tapeMesh.position.addScaledVector(tapeVel, dt);
        tapeMesh.rotation.x += tapeRotVel.x * dt;
        tapeMesh.rotation.y += tapeRotVel.y * dt;
        tapeMesh.rotation.z += tapeRotVel.z * dt;
      }

      if (bananaFalling && bananaGroup && !settled) {
        fallVel -= 9.8 * dt;
        bananaGroup.position.y += fallVel * dt;
        bananaGroup.rotation.x += bananaRotVelX * dt;

        if (!transitionFired && bananaGroup.position.y < -2) {
          transitionFired = true;
          onTransition?.();
        }

        if (bananaGroup.position.y < -3) {
          bananaGroup.position.y = -3;
          fallVel *= -0.45;
          bananaRotVelX *= -0.5;
          playThudSound();

          if (Math.abs(fallVel) < 0.4) {
            fallVel = 0;
            bananaRotVelX = 0;
            settled = true;
          }
        }
      }

      renderer.render(scene, camera);
    }

    init();

    /* ─── Cleanup ─── */
    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);

      stopPeelSound();
      if (audioCtx) { audioCtx.close().catch(() => { }); audioCtx = null; }

      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      if (scene.environment) scene.environment.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [onTransition]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100vw', height: '100svh', overflow: 'hidden', cursor: 'grab', background: '#E8E8E8', touchAction: 'none' }}
    >
      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#999', fontSize: 'clamp(14px, 3vw, 16px)', fontFamily: "'Helvetica Neue', sans-serif",
        }}>
          Loading...
        </div>
      )}

      {/* Title */}
      <h1 style={{
        position: 'absolute', top: 'clamp(1rem, 6vh, 3rem)', width: '100%',
        textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
        fontSize: 'clamp(2.2rem, 10vw, 6rem)', fontWeight: 900,
        letterSpacing: '-0.02em', lineHeight: 0.9, textTransform: 'uppercase',
        color: '#0f0f0f', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        zIndex: 1, padding: '0 1rem',
      }}>
        DON&apos;T PEEL
      </h1>


    </div>
  );
}