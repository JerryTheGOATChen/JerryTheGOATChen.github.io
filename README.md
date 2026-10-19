# Portfolio

Jerry Chen's project portfolio: robotics software and machine learning.
Static site, no build step: `index.html`, `styles.css`, `main.js`, `explore.js` (the hero map), and `assets/`.

Preview locally:

    py -m http.server 8000

then open http://localhost:8000.

## Editing

- Each case study is a `<template id="tpl-...">` at the bottom of `index.html` and opens at `#scout`, `#getaway`,
  `#fleet`, `#tronshot` or `#zip`. The gallery card for each is near the top.
- Media lives in `assets/<project>/`. Videos are H.264 MP4 with a JPG poster of the same name.
- The résumé is `Jerry_Chen_Resume.pdf`; replace the file to update it.
- Link previews use `assets/og.jpg` through an absolute URL in `<head>` (`og:image`). If the site is published
  somewhere other than https://jerrythegoatchen.github.io/, update that URL.
