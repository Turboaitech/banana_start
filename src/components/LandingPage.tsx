'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import ModelViewer from './ModelViewer';
import s from './LandingPage.module.css';

type MintStatus = 'idle' | 'connecting' | 'done';

export default function LandingPage() {
  const [qty, setQty] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mintStatus, setMintStatus] = useState<MintStatus>('idle');
  const [currentSection, setCurrentSection] = useState<'mint' | 'roadmap'>('mint');
  const qtyRef = useRef<HTMLSpanElement>(null);
  const mintRef = useRef<HTMLElement>(null);
  const roadmapRef = useRef<HTMLElement>(null);
  const revealRefs = useRef<HTMLElement[]>([]);

  // Escape key closes menu
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Track which section is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setCurrentSection(entry.target.id as 'mint' | 'roadmap');
          }
        });
      },
      { threshold: 0.5 }
    );

    if (mintRef.current) observer.observe(mintRef.current);
    if (roadmapRef.current) observer.observe(roadmapRef.current);

    return () => observer.disconnect();
  }, []);

  // IntersectionObserver for scroll reveal with staggered delays
  useEffect(() => {
    const els = revealRefs.current;
    // Set staggered transition-delay per element
    els.forEach((el, i) => {
      el.style.transitionDelay = `${i * 0.08}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.revealVisible);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    els.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = useCallback((el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  }, []);

  // Qty bounce animation
  const bounceQty = useCallback(() => {
    if (qtyRef.current) {
      qtyRef.current.style.transform = 'scale(1.15)';
      setTimeout(() => {
        if (qtyRef.current) qtyRef.current.style.transform = 'scale(1)';
      }, 120);
    }
  }, []);

  const decrement = useCallback(() => {
    setQty((q) => {
      if (q > 1) { bounceQty(); return q - 1; }
      return q;
    });
  }, [bounceQty]);

  const increment = useCallback(() => {
    setQty((q) => {
      if (q < 20) { bounceQty(); return q + 1; }
      return q;
    });
  }, [bounceQty]);

  const handleMint = useCallback(() => {
    if (mintStatus !== 'idle') return;
    setMintStatus('connecting');
    setTimeout(() => {
      setMintStatus('done');
      setTimeout(() => setMintStatus('idle'), 2000);
    }, 1200);
  }, [mintStatus]);

  return (
    <div className={s.wrapper}>
      {/* Edge Glow */}
      <div className={s.edgeGlow} />

      {/* ═══ Hero + Mint ═══ */}
      <section id="mint" className={s.hero} ref={mintRef}>
        <div className={s.heroLayout}>

          {/* LEFT: Title + Rotating 3D Model */}
          <div className={s.heroLeft}>
            {/* 3D Model with Glow Rings */}
            <div className={s.rotatingWrap}>
              <div className={s.glowRing} />
              <div className={`${s.glowRing} ${s.glowRing2}`} />
              <ModelViewer className={s.modelContainer} />
            </div>
          </div>

          {/* RIGHT: Mint Box */}
          <div className={s.heroRight}>
            <div className={`${s.mintBox} ${s.reveal}`} ref={addRevealRef}>
              <div className={s.mintHeader}>
                <div className={s.mintTitle}>Mint</div>
                <div className={s.liveIndicator}>
                  <span className={s.liveDot} />
                  Not ready yet
                </div>
              </div>

              <div className={s.priceRow}>
                <div className={s.priceBlock}>
                  <div className={s.priceLabel}>Price</div>
                  <div className={s.priceVal}>25 USDC</div>
                </div>
                <div className={s.priceDivider} />
                <div className={s.priceBlock}>
                  <div className={s.priceLabel}>Remaining</div>
                  <div className={s.priceVal}>500 / 500</div>
                </div>
              </div>

              <div className={s.progressWrap}>
                <div className={s.progressBar}>
                  <div className={s.progressFill} style={{ width: '0%' }} />
                </div>
              </div>

              <div className={s.qtySelector}>
                <button className={s.qtyBtn} onClick={decrement} aria-label="Decrease quantity">
                  &minus;
                </button>
                <span className={s.qtyValue} ref={qtyRef}>{qty}</span>
                <button className={s.qtyBtn} onClick={increment} aria-label="Increase quantity">
                  +
                </button>
              </div>

              <button
                className={
                  mintStatus === 'connecting'
                    ? s.mintBtnConnecting
                    : mintStatus === 'done'
                      ? s.mintBtnDone
                      : s.mintBtn
                }
                onClick={handleMint}
              >
                {mintStatus === 'idle' && 'Connect Wallet & Mint'}
                {mintStatus === 'connecting' && 'Connecting...'}
                {mintStatus === 'done' && 'Coming soon \u2726'}
              </button>

              <div className={s.note}>
                Wallet integration coming soon.
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══ Roadmap ═══ */}
      <section id="roadmap" className={s.roadmap} ref={roadmapRef}>
        <h1 className={`${s.headline} ${s.reveal}`} ref={addRevealRef}>
          ROADMAP
        </h1>

        <div className={s.phaseGrid}>
          <div
            className={`${s.phaseCardActive} ${s.reveal}`}
            ref={addRevealRef}
          >
            <div className={s.phaseLabelActive}>Phase 0 &mdash; (NOW)</div>
            <div className={s.phaseTitle}>Foundation</div>
            <div className={s.phaseDesc}>
              <s>Made By Ape brand license</s><br />
              Start Marketing<br />
              Select licensed manufacturing partner<br />
              Finalize merch designs and suppliers<br />
              Launch Utility NFT
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Bottom Nav ═══ */}
      <nav className={s.bottomNav}>
        <a href="#mint" className={s.navBrand}>BoredVape</a>
        <div className={s.navLinks}>
          {currentSection === 'mint'
            ? <a href="#roadmap" className={s.navLink}>Roadmap</a>
            : <a href="#mint" className={s.navLink}>Mint</a>
          }
        </div>
        <button className={s.navMenu} onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      </nav>

      {/* ═══ Menu Overlay ═══ */}
      <div className={menuOpen ? s.menuOverlayOpen : s.menuOverlay}>
        <div className={s.menuInner}>
          <a href="#mint" className={s.menuLink} onClick={() => setMenuOpen(false)}>Mint</a>
          <a href="#roadmap" className={s.menuLink} onClick={() => setMenuOpen(false)}>Roadmap</a>
        </div>
        <button className={s.menuClose} onClick={() => setMenuOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}
