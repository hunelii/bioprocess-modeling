# HUNER BIOFOUNDRY — Phase 8 integration candidate

A stand-alone Vite/React Three Fiber implementation of the Living Factory. This project **does not edit or deploy** the existing HUNER website. The original Phase 6 GLB/camera waypoints remain fixed.

```bash
npm ci # after first npm install and lock generation; or npm install for this delivered source
npm run check
npm run dev
npm run build
```

For integration into an existing Next.js site, make `App` a client component, replace the standalone header/outro with the site's own layout, copy `public/assets`, and import `FactoryScene` only on the client. Preserve scroll authority: exactly one ScrollTrigger should control the stage. No extra GSAP timeline should update model state independently of normalized scroll progress.

Performance changes: `frameloop="demand"`, invalidate only on scroll or scene state changes, poster-first / delayed GLB mount (750px IntersectionObserver margin), DPR <=1.35, WebGL error boundary, context-lost fallback, static mode control, reduced-motion and <=760px posters, throttled React UI updates. Draw calls may remain expensive because the GLB has ~1214 meshes; this is not yet independently GPU-certified.

Note: GLB is not compressed or merged in this phase to protect per-mesh scientific animation names and the locked reference geometry.
