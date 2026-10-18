# Portfolio

Jerry Chen's project portfolio: robotics software and machine learning.
Static site, no build step: `index.html`, `styles.css`, `main.js`, `explore.js`, and `assets/`.

Preview locally:

    py -m http.server 8000

then open http://localhost:8000.

## Adding things

- Photos: drop them in `assets/<project>/` and replace the matching `<div class="placeholder">` in `index.html`
  with an `<img>` (or `<video muted loop playsinline data-auto controls>`).
- Résumé: add `resume.pdf` here and uncomment the Résumé link in the About section.
- Each case study is a `<template id="tpl-...">` at the bottom of `index.html`; it opens at `#scout`, `#getaway`,
  `#fleet` or `#tronshot`.
