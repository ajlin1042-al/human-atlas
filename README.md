# Human Atlas

An interactive 3D anatomy explorer. Rotate the body, toggle anatomical systems, search any structure, and drag one slider to pull the whole body apart into an organized specimen atlas.

**Live demo:** https://human-atlas-ivory-delta.vercel.app

## Features

- Full-screen 3D human body with smooth orbit, pan and zoom
- 9 toggleable systems: skeleton, muscles, heart, sensory organs, arteries, veins, nervous system, respiratory, and other organs
- Explode slider that moves every piece from the assembled body into a catalogued atlas layout, with every piece still clickable
- Hover labels, an information panel, and isolate mode for any structure
- Search that flies the camera straight to a structure (try "gracilis")
- Specimen collections (hand, shoulder, thigh, foot, heart, brain) with left/right filtering
- Camera toolbar: zoom, front view, orbit/pan modes, reset, fullscreen

## Tech stack

React, TypeScript, Vite, Three.js, @react-three/fiber, @react-three/drei

## How it works

- **Data pipeline:** raw BodyParts3D OBJ files are matched to English names, classified into systems with rule-based scripts, converted to compressed GLB files, and listed in a manifest (`scripts/`).
- **Rendering:** each piece is loaded separately and animated inside the Three.js render loop, so React state is never updated per frame.
- **Explode view:** the app measures every piece's bounding box, packs the pieces into rows (largest at the top), and interpolates each piece between its assembled and atlas positions using one eased slider value.
- **Camera focus:** the camera flies to a structure by computing its bounding box and tweening position and target.

## Run it locally