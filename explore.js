// Hero: a robot doing frontier exploration on a house it has never seen.
// The house is hidden; the lidar reveals it; the robot drives to the nearest frontier
// (a known-free cell next to an unknown one) until there are none left, then starts a new house.
(() => {
  const canvas = document.getElementById("explore");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const readout = document.getElementById("explore-readout");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const UNKNOWN = 0, FREE = 1, WALL = 2;
  const RAYS = 140, RANGE = 16, SPEED = 0.42;
  let W, H, CELL, truth, known, robot, path, target, colors, t0, frame, doneAt, visible = true;

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    colors = { paper: v("--paper"), free: v("--free"), wall: v("--ink"), dot: v("--rule"),
               signal: v("--signal"), ray: v("--ray"), ink2: v("--ink-2") };
  }

  // --- the hidden house: recursive room splits with doors, a little furniture ---
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function makeHouse() {
    truth = new Uint8Array(W * H).fill(FREE);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) truth[y * W + x] = v; };
    for (let x = 0; x < W; x++) { set(x, 0, WALL); set(x, H - 1, WALL); }
    for (let y = 0; y < H; y++) { set(0, y, WALL); set(W - 1, y, WALL); }
    const MIN = 9;
    const rooms = [];
    (function split(x0, y0, x1, y1, depth) {
      const w = x1 - x0, h = y1 - y0;
      const canV = w > MIN * 2, canH = h > MIN * 2;
      if ((!canV && !canH) || (depth > 3 && Math.random() < 0.3)) { rooms.push([x0, y0, x1, y1]); return; }
      const vertical = canV && (!canH || w / Math.max(h, 1) > 1.15 || Math.random() < 0.5);
      if (vertical) {
        const sx = rnd(x0 + MIN, x1 - MIN);
        const door = rnd(y0 + 2, y1 - 6);
        for (let y = y0; y <= y1; y++) if (y < door || y > door + 4) set(sx, y, WALL);
        split(x0, y0, sx, y1, depth + 1); split(sx, y0, x1, y1, depth + 1);
      } else {
        const sy = rnd(y0 + MIN, y1 - MIN);
        const door = rnd(x0 + 2, x1 - 6);
        for (let x = x0; x <= x1; x++) if (x < door || x > door + 4) set(x, sy, WALL);
        split(x0, y0, x1, sy, depth + 1); split(x0, sy, x1, y1, depth + 1);
      }
    })(0, 0, W - 1, H - 1, 0);
    // furniture, kept off the walls so doors stay open
    for (const [x0, y0, x1, y1] of rooms) {
      if (Math.random() < 0.35 || x1 - x0 < 14 || y1 - y0 < 12) continue;
      const fw = rnd(3, Math.min(8, x1 - x0 - 10)), fh = rnd(2, Math.min(5, y1 - y0 - 9));
      const fx = rnd(x0 + 5, x1 - 5 - fw), fy = rnd(y0 + 5, y1 - 5 - fh);
      for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) set(x, y, WALL);
    }
    known = new Uint8Array(W * H);
    // start in a free spot near the left middle
    let sx = 4, sy = Math.floor(H / 2);
    for (let tries = 0; tries < 500; tries++) {
      const x = rnd(3, Math.floor(W / 3)), y = rnd(3, H - 4);
      if (clear(x, y, truth)) { sx = x; sy = y; break; }
    }
    robot = { x: sx + 0.5, y: sy + 0.5, th: 0 };
    path = []; target = -1; t0 = performance.now(); frame = 0; doneAt = 0;
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
        if (truth[i] === WALL) { known[i] = WALL; hit = true; break; }
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
    ctx.fillStyle = c.signal;
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
        ? `map complete · ${pct}% known · new house in 3 s`
        : `known ${String(pct).padStart(2, " ")}% · frontier cells ${frontiers} · ${RAYS} rays · t ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    CELL = rect.width < 600 ? 6 : 8;
    W = Math.max(40, Math.floor(rect.width / CELL));
    H = Math.max(24, Math.floor(rect.height / CELL));
    canvas.width = W * CELL * dpr; canvas.height = H * CELL * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
    makeHouse();
    if (reduced) { for (let k = 0; k < 4000 && !doneAt; k++) step(); draw(); }
  }

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden || reduced) return;
    if (now - last < 1000 / 30) return;   // 30 fps is plenty
    last = now;
    if (doneAt && now - doneAt > 3000) makeHouse();
    step();
    draw();
  }

  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 200); });
  document.addEventListener("themechange", () => { readColors(); draw(); });
  resize();
  requestAnimationFrame(loop);
})();
