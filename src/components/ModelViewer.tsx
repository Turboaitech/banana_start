'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface ModelViewerProps {
  className?: string;
}

export default function ModelViewer({ className }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animFrameId: number;
    let autoRotate = true;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Lighting — product-style
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xccccff, 0.5);
    fillLight.position.set(-3, 2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, -2, -4);
    scene.add(rimLight);

    // Model
    let model: THREE.Group | null = null;
    const clock = new THREE.Clock();

    // Mouse interaction state
    let mouseX = 0;
    let mouseY = 0;
    let targetRotY = 0;
    let targetRotX = 0;
    let currentRotY = 0;
    let currentRotX = 0;
    let autoAngle = 0;

    new GLTFLoader().load(
      '/models/e_cigarette.glb',
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;

        // Auto-center and scale
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.2 / maxDim;
        model.scale.setScalar(scale);

        scene.add(model);

        // Hide loading indicator
        const loadingEl = container.querySelector('[data-loading]');
        if (loadingEl) (loadingEl as HTMLElement).style.display = 'none';
      },
      undefined,
      (err) => {
        console.error('Failed to load e_cigarette.glb:', err);
      }
    );

    // Animation loop
    function animate() {
      if (disposed) return;
      animFrameId = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 1 / 30);

      if (model) {
        if (autoRotate) {
          // 10 seconds per revolution
          autoAngle += ((Math.PI * 2) / 10) * dt;
          model.rotation.y = autoAngle;
          model.rotation.x = 0;
          currentRotY = autoAngle;
          currentRotX = 0;
        } else {
          // Mouse-driven rotation
          targetRotY = mouseX * Math.PI;
          targetRotX = mouseY * Math.PI * 0.3;
          currentRotY += (targetRotY - currentRotY) * 0.08;
          currentRotX += (targetRotX - currentRotX) * 0.08;
          model.rotation.y = currentRotY;
          model.rotation.x = currentRotX;
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    // Mouse events
    function onMouseEnter() {
      autoRotate = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }

    function onMouseLeave() {
      autoRotate = true;
      autoAngle = currentRotY;
    }

    // Touch events
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 0 || !container) return;
      autoRotate = false;
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      mouseX = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = ((touch.clientY - rect.top) / rect.height) * 2 - 1;
    }

    function onTouchEnd() {
      autoRotate = true;
      autoAngle = currentRotY;
    }

    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd);

    // Resize
    function onResize() {
      if (!container || disposed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameId);

      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      resizeObserver.disconnect();

      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}
    >
      <div
        data-loading
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.75rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        Loading...
      </div>
    </div>
  );
}
