// Hero: a robot doing frontier exploration in a room it has never seen. The room is hidden; the lidar
// reveals it; the robot drives to the nearest frontier (a known-free cell next to an unknown one) until
// there are none left. The walls it finds spell the name. Each letter fills in once a ray touches it.
(() => {
  const canvas = document.getElementById("explore");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const readout = document.getElementById("explore-readout");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const UNKNOWN = 0, FREE = 1, WALL = 2;
  const RAYS = 200;
  let RANGE = 20, SPEED = 0.55;   // in cells; set from the cell size so the look is the same on any screen
  const NAME = ["JERRY", "CHEN"];
  let W, H, CELL, truth, known, comp, compCells, compSeen, robot, path, target, colors, frame, doneAt,
      visible = true, paused = reduced;
  const toggle = document.getElementById("explore-toggle");
  function setPaused(p) {
    paused = p;
    if (toggle) { toggle.textContent = p ? "Play" : "Pause"; toggle.setAttribute("aria-pressed", String(p)); }
  }
  toggle?.addEventListener("click", () => setPaused(!paused));

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    colors = { paper: v("--paper"), free: v("--free"), wall: v("--ink"), dot: v("--unknown"),
               signal: v("--signal"), ray: v("--ray"), ink2: v("--ink-2") };
  }

  // --- the hidden room: four walls, and the name drawn into the grid as solid letters ---
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function makeHouse() {
    truth = new Uint8Array(W * H).fill(FREE);
    for (let x = 0; x < W; x++) { truth[x] = WALL; truth[(H - 1) * W + x] = WALL; }
    for (let y = 0; y < H; y++) { truth[y * W] = WALL; truth[y * W + W - 1] = WALL; }

    // rasterize the name at one pixel per cell
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d");
    const font = (px) => `800 ${px}px Archivo, "Arial Narrow", sans-serif`;
    const gap = 0.45;   // space between lines, in cap heights, so the robot can drive between them
    // one line or two, whichever gives the bigger letters
    let lines, px = 0;
    for (const option of [[NAME.join(" ")], NAME]) {
      o.font = font(100);
      if ("letterSpacing" in o) o.letterSpacing = "6px";
      const widest = Math.max(...option.map((l) => o.measureText(l).width));
      const capH = o.measureText("H").actualBoundingBoxAscent || 72;
      const byW = (W * 0.84) / widest * 100;
      const byH = (H * 0.62) / ((capH / 100) * (option.length + gap * (option.length - 1)));
      const size = Math.floor(Math.min(byW, byH));
      if (size > px) { px = size; lines = option; }
    }
    px = Math.max(8, px);
    o.font = font(px);
    if ("letterSpacing" in o) o.letterSpacing = `${Math.max(1, Math.round(px * 0.06))}px`;
    const cap = o.measureText("H").actualBoundingBoxAscent || px * 0.72;
    const block = cap * lines.length + cap * gap * (lines.length - 1);
    let y = Math.round((H - block) / 2 + cap);
    o.fillStyle = "#000";
    o.textBaseline = "alphabetic";
    for (const l of lines) {
      const w = o.measureText(l).width;
      o.fillText(l, Math.round((W - w) / 2), y);
      y += Math.round(cap * (1 + gap));
    }
    const img = o.getImageData(0, 0, W, H).data;

    // group letter cells into connected pieces, so a letter appears whole once any of it is seen
    comp = new Int32Array(W * H).fill(-1);
    compCells = [];
    for (let i = 0; i < W * H; i++) {
      if (img[i * 4 + 3] < 110 || truth[i] === WALL || comp[i] >= 0) continue;
      const id = compCells.length, cells = [i], stack = [i];
      comp[i] = id;
      while (stack.length) {
        const c = stack.pop(), cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || comp[n] >= 0 || img[n * 4 + 3] < 110) continue;
          comp[n] = id; cells.push(n); stack.push(n);
        }
      }
      compCells.push(cells);
    }
    for (const cells of compCells) for (const c of cells) truth[c] = WALL;
    compSeen = new Uint8Array(compCells.length);

    known = new Uint8Array(W * H);
    // start somewhere along the bottom-left
    let sx = 4, sy = H - 5;
    for (let tries = 0; tries < 500; tries++) {
      const x = rnd(3, Math.floor(W / 4)), yy = rnd(Math.floor(H * 0.7), H - 4);
      if (clear(x, yy, truth)) { sx = x; sy = yy; break; }
    }
    robot = { x: sx + 0.5, y: sy + 0.5, th: 0 };
    path = []; target = -1; frame = 0; doneAt = 0;
    scan();
  }

  function clear(x, y, grid) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = (y + dy) * W + (x + dx);
      if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || grid[i] === WALL) return false;
    }
    return true;
  }

  // --- lidar: march each ray until it hits a wall or runs out of range ---
  const hits = [];
  function scan() {
    hits.length = 0;
    for (let r = 0; r < RAYS; r++) {
      const a = (r / RAYS) * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      let d = 0, hit = false, x = robot.x, y = robot.y;
      while (d < RANGE) {
        x = robot.x + dx * d; y = robot.y + dy * d;
        const cx = x | 0, cy = y | 0;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        const i = cy * W + cx;
        if (truth[i] === WALL) {
          known[i] = WALL; hit = true;
          const id = comp[i];
          if (id >= 0 && !compSeen[id]) { compSeen[id] = 1; for (const c of compCells[id]) known[c] = WALL; }
          break;
        }
        known[i] = FREE;
        d += 0.35;
      }
      hits.push([x, y, hit]);
    }
  }

  function isFrontier(i) {
    if (known[i] !== FREE) return false;
    const x = i % W, y = (i / W) | 0;
    return (x > 0 && known[i - 1] === UNKNOWN) || (x < W - 1 && known[i + 1] === UNKNOWN) ||
           (y > 0 && known[i - W] === UNKNOWN) || (y < H - 1 && known[i + W] === UNKNOWN);
  }

  // --- planning: one BFS from the robot over known free space (kept a cell off known walls) ---
  function plan() {
    const start = (robot.y | 0) * W + (robot.x | 0);
    const prev = new Int32Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    q[tail++] = start; prev[start] = start;
    const passable = (i) => {
      if (known[i] !== FREE) return false;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
        if (known[ny * W + nx] === WALL) return false;
      }
      return true;
    };
    let goal = -1, skipped = 0;
    while (head < tail) {
      const i = q[head++];
      // skip frontier cells right next to the robot: they are lidar speckle
      if (isFrontier(i) && i !== start) {
        const gx = i % W, gy = (i / W) | 0;
        if (Math.hypot(gx - robot.x, gy - robot.y) > 3 || skipped > 40) { goal = i; break; }
        skipped++;
      }
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -1) continue;
        if (!passable(n) && !isFrontier(n)) continue;
        prev[n] = i; q[tail++] = n;
      }
    }
    if (goal < 0) return false;
    const p = [];
    for (let i = goal; i !== start; i = prev[i]) p.push(i);
    p.reverse();
    path = p; target = goal;
    return true;
  }

  function step() {
    if (doneAt) return;
    if (target < 0 || !isFrontier(target) || path.length === 0) {
      if (!plan()) { doneAt = performance.now(); return; }
    }
    let move = SPEED;
    while (move > 0 && path.length) {
      const n = path[0];
      const tx = (n % W) + 0.5, ty = ((n / W) | 0) + 0.5;
      const dx = tx - robot.x, dy = ty - robot.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) robot.th = Math.atan2(dy, dx);
      if (d <= move) { robot.x = tx; robot.y = ty; path.shift(); move -= d; }
      else { robot.x += (dx / d) * move; robot.y += (dy / d) * move; move = 0; }
    }
    scan();
    frame++;
  }

  // --- drawing ---
  function draw() {
    const c = colors;
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // unknown: a faint dot grid, like graph paper
    ctx.fillStyle = c.dot;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (known[y * W + x] === UNKNOWN) ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
    }
    let freeCount = 0, frontiers = 0;
    for (let i = 0; i < W * H; i++) {
      const k = known[i];
      if (k === UNKNOWN) continue;
      const x = (i % W) * CELL, y = ((i / W) | 0) * CELL;
      if (k === FREE) {
        freeCount++;
        if (isFrontier(i)) { frontiers++; ctx.fillStyle = c.signal; }
        else ctx.fillStyle = c.free;
      } else ctx.fillStyle = c.wall;
      ctx.fillRect(x, y, CELL, CELL);
    }
    // lidar rays (every other one) and their hit points
    const rx = robot.x * CELL, ry = robot.y * CELL;
    ctx.strokeStyle = c.ray; ctx.lineWidth = 1;
    ctx.beginPath();
    hits.forEach(([x, y], k) => { if (k % 2 === 0) { ctx.moveTo(rx, ry); ctx.lineTo(x * CELL, y * CELL); } });
    ctx.stroke();
    ctx.fillStyle = c.ink2;
    for (const [x, y, hit] of hits) if (hit) ctx.fillRect(x * CELL - 1, y * CELL - 1, 2, 2);
    // planned path
    if (path.length) {
      ctx.strokeStyle = c.wall; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(rx, ry);
      for (const n of path) ctx.lineTo((n % W + 0.5) * CELL, (((n / W) | 0) + 0.5) * CELL);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // the robot
    const r = Math.max(4, CELL * 0.9);
    ctx.fillStyle = c.wall;
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.paper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(robot.th) * r, ry + Math.sin(robot.th) * r); ctx.stroke();

    if (readout) {
      let total = 0;
      for (let i = 0; i < W * H; i++) if (truth[i] === FREE) total++;
      const pct = Math.min(100, Math.round((freeCount / total) * 100));
      const secs = Math.floor(frame / 30);
      readout.textContent = doneAt
        ? `map complete · ${pct}% known`
        : `known ${String(pct).padStart(2, " ")}% · frontier cells ${frontiers} · ${RAYS} rays · t ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    CELL = rect.width < 600 ? 4 : 5;
    RANGE = Math.round(120 / CELL);
    SPEED = 3.6 / CELL;
    W = Math.max(40, Math.floor(rect.width / CELL));
    H = Math.max(24, Math.floor(rect.height / CELL));
    canvas.width = W * CELL * dpr; canvas.height = H * CELL * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
    makeHouse();
    if (reduced) { for (let k = 0; k < 4000 && !doneAt; k++) step(); }
    draw();
  }

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden || paused) return;
    if (now - last < 1000 / 30) return;   // 30 fps is plenty
    last = now;
    if (doneAt && now - doneAt > 6000) makeHouse();
    step();
    draw();
  }

  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
  let rt;
  let lastWidth = 0;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {   // phones fire resize while scrolling; only rebuild when the width changes
      const w = canvas.getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) > 1) resize();
    }, 200);
  });
  document.addEventListener("themechange", () => { readColors(); draw(); });
  setPaused(paused);
  // draw the name in the real typeface once it has loaded (falls back after a second)
  Promise.race([document.fonts?.load('800 100px "Archivo"') ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1000))])
    .catch(() => {})
    .then(() => { resize(); lastWidth = canvas.getBoundingClientRect().width; requestAnimationFrame(loop); });
})();
