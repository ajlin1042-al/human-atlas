Build a polished, interactive web app called Human Atlas: a full screen 3D human anatomy explorer that feels like a digital museum or scientific atlas.
 
Use the written spec below as the source of truth. If I attach screenshots, use them as visual reference for spacing, proportions, and feel.
 
Do not build a generic medical dashboard. Do not build a normal webpage with a 3D model in the middle. The anatomy visualization IS the page, with a minimal floating UI on top of it.
 
Create the project in a new folder called human-atlas.
 
==================================================
1. STACK
==================================================
- React + TypeScript + Vite
- three, @react-three/fiber, @react-three/drei
- Framer Motion for interface animation
- Keep all per frame animation inside the render loop (useFrame). Never update React state every frame.
 
==================================================
2. OVERALL EXPERIENCE
==================================================
Full screen canvas (100vw x 100vh). No navbar, no hero section, no card grids, no gradients, no marketing copy.
 
It should feel: scientific, editorial, museum like, premium, minimal, spacious, slightly futuristic but NOT sci fi.
 
Floating UI elements:
1. Branding, upper left
2. Systems panel, left
3. Specimen collections panel, left, below Systems
4. Search, upper right
5. Slim vertical camera toolbar, right edge
6. Explode anatomy control, bottom center
7. Information panel when a structure is selected
8. Tiny hint text along the bottom edge ("Drag to orbit · Scroll to zoom · Tap to inspect") and a "Sources & credits" link bottom right
 
==================================================
3. VISUAL STYLE
==================================================
- Background: pale warm off white, around #F3F3F1. Never pure white.
- Panels: near white, 10 to 14px radius, border 1px solid rgba(0,0,0,0.05), shadow 0 8px 30px rgba(0,0,0,0.04), generous whitespace.
- Primary dark color: desaturated navy/charcoal around #13242D. Use it for active buttons, toggles, tooltips, and primary actions.
- Type: Inter (or a similar neutral sans serif). Small, dark charcoal, understated. No futuristic fonts.
 
==================================================
4. BRANDING (upper left, about 24px from the edges, NOT in a card)
==================================================
- Tiny letter spaced eyebrow: INTERACTIVE ANATOMY
- Title: Human Atlas, semibold, 22 to 28px, with a small "3D" superscript
- Metadata line: "[N] modeled pieces · BodyParts3D"
 
==================================================
5. CENTRAL MODEL
==================================================
- The human stands in anatomical position, centered, with lots of negative space around it.
- Soft neutral studio lighting, subtle ambient occlusion, no dramatic shadows. It should never look like a game character.
- Perspective camera with OrbitControls: enableDamping = true, dampingFactor about 0.05.
- Orbit, zoom, and pan. Every camera move interpolates. Nothing snaps.
 
==================================================
6. ANATOMY ASSETS (BodyParts3D)
==================================================
First inspect the repo for .glb, .gltf, or .obj files and reuse them.
 
I downloaded the BodyParts3D OBJ files (Database Center for Life Science) into /assets/anatomy/raw, along with the name and relationship tables from the same archive. Each OBJ file is named by its element ID.
 
Write a build script (scripts/build-anatomy.ts) that:
- reads every OBJ file
- maps each ID to its English name using the tables
- assigns each piece to one of 8 systems: skeleton, muscles, heart, sensory organs, arteries, veins, nervous system, respiratory
- detects side (left, right, midline) from the name
- converts and compresses the meshes to GLB (gltf-transform with meshopt or draco)
- writes a manifest JSON
 
Manifest entry shape:
{ id, name, system, region, side, meshFile, assembledPosition, explodedPosition }
 
Log any piece the script cannot classify to a file instead of guessing.
 
If assets are missing, build the full architecture with clearly isolated placeholder geometry and a documented loader so real GLB files can be dropped in later. Do not hand model anatomy.
 
==================================================
7. SYSTEMS PANEL
==================================================
Floating card: left about 24px, top about 140px, width 170 to 200px. It is a small detached tool palette, never a full height sidebar.
 
- Title "Systems" with a small "8/8" count badge
- Segmented control: All | Skeleton | Organs (presets)
- One row per system: small colored bullet, name, piece count, tiny toggle on the right
- Toggles: dark when on, light gray when off, thumb animates smoothly
- Rows 27 to 34px tall, tiny compact type
- Footer: "[N] pieces visible" and a "Hide all" text button
- Systems fade in and out (opacity, 200 to 400ms) with a very slight stagger when several change at once
 
==================================================
8. SPECIMEN COLLECTIONS PANEL (below Systems)
==================================================
- Title "Specimen collections" with a collapse chevron, subtitle "Study the body, region by region."
- 2 column grid of region buttons with piece counts: Hand, Shoulder, Thigh, Foot, Heart, Brain
- Segmented control: Both | Left | Right
- Selecting a region frames the camera on it and lays that region out as a specimen sheet
 
==================================================
9. EXPLODED ANATOMY (THE MOST IMPORTANT FEATURE)
==================================================
- Every mesh stores an assembledPosition and an explodedPosition.
- explodedPosition comes from an organized atlas layout: a huge specimen sheet with pieces in catalogued rows. Larger structures toward the top, smaller structures denser toward the bottom. It can span several screen widths.
- Real 3D geometry only, never a flat image. Every piece stays hoverable, selectable, focusable, and isolatable.
- The camera pulls back as the explode value increases.
- Interpolate with easeInOutCubic (or a low bounce spring). Full transitions take 1 to 2 seconds. Collapsing animates every piece back to its anatomical position.
 
==================================================
10. EXPLODE CONTROL (bottom center)
==================================================
Floating card: bottom about 24px, centered, width 300 to 440px.
- Small icon, label "Explode anatomy", percentage readout on the right
- Thin continuous slider. 0% = "Assembled" (label under the left end). 100% = "Every piece" (label under the right end).
- Small Reset button separated by a thin vertical divider
- Tiny caption above the card: ANATOMICAL POSITION · FRONT
 
==================================================
11. HOVER AND SELECTION
==================================================
- Raycast every mesh.
- On hover: subtle highlight, pointer cursor, small dark navy tooltip with the structure name and its category under it (for example "Long Head Of Right Biceps Brachii" / "Muscle").
- On click: emphasize the structure, slightly dim everything else, open the information panel, and focus the camera on it.
 
==================================================
12. INFORMATION PANEL
==================================================
Floating card on the right, width 260 to 320px.
- Tiny category label (Bone, Muscle, Artery)
- Large bold structure name
- 2 to 4 lines of description
- Metadata rows with thin dividers: ID, System, Region, Side
- Relationships: for muscles with verified attachment data, list clickable attachment bones and supporting vessels. Bones link back to their attached muscles. Label anything that is only nearby as "nearby", never as a verified connection. Never invent anatomical relationships.
- Full width dark "Isolate structure" button with an icon, plus a small "Clear selection" text button
- On small screens this becomes a compact bottom sheet
 
==================================================
13. ISOLATE MODE
==================================================
Keep the selected structure visible, fade everything else, move the camera to center it, and allow orbiting around it. Clearing restores everything with smooth transitions.
 
==================================================
14. CAMERA TOOLBAR
==================================================
Right edge about 20px, vertically centered, 36 to 42px wide, rounded container.
Small square icon buttons: zoom in, front view (F), zoom out, orbit mode, pan mode, reset camera, fullscreen.
The active tool uses the dark navy background.
 
==================================================
15. SEARCH
==================================================
Upper right, 200 to 260px wide.
- Magnifying glass icon, placeholder "Find a structure", "/" keyboard shortcut hint
- Results appear in a small floating dropdown
- Selecting a result focuses the camera, highlights the structure, and opens the information panel
 
==================================================
16. CAMERA FOCUS
==================================================
Create a reusable focusOnObject(mesh) function: compute the bounding box and center, calculate a good viewing distance, and tween camera.position and controls.target over 600 to 1000ms.
 
==================================================
17. CREDITS
==================================================
Add a "Sources & credits" panel that shows the BodyParts3D attribution exactly as its license requires, with a link to the license page.
 
==================================================
18. PERFORMANCE
==================================================
GLTF caching, memoization, frustum culling, instancing and LOD where useful, and no React rerenders per frame. Target 60fps on a modern laptop.
 
==================================================
19. MICROINTERACTIONS
==================================================
Button hovers about 150ms, panel fades 200 to 300ms, springy toggles, tooltip fades, camera easing.
Do NOT add bouncy animations, neon effects, large shadows, gradients, or oversized text.
 
==================================================
20. INITIAL LOAD
==================================================
Full body centered, all panels visible. The UI and model fade in subtly. Nothing dramatic.
 
==================================================
21. IMPLEMENTATION ORDER
==================================================
1. Inspect the repo and dependencies
2. Asset build script and manifest
3. Full screen canvas and layout
4. Scene, lighting, orbit camera
5. Systems panel and visibility
6. Hover and raycasting
7. Selection and information panel
8. Camera focus
9. Atlas layout
10. Explode slider and animation
11. Search
12. Specimen collections
13. Camera toolbar
14. Isolate mode
15. Credits panel
16. Microinteractions
17. Performance
18. Visual polish pass
 
==================================================
22. QUALITY BAR
==================================================
Do not stop when it merely works. Before finishing:
- run the app and fix all TypeScript and build errors
- check the console for errors
- test every system toggle, search, selection, isolate mode, explode and collapse, zoom and orbit
- check the layout at common desktop sizes and on mobile
- do a final polish pass on spacing, type sizes, corner radii, camera framing, shadows, animation speed, and atlas density
 
It should feel like a production quality product, not a hackathon prototype or a generic Three.js demo.

