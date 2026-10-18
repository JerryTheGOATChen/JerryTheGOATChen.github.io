(() => {
  // ---------- appearance: follows the system setting ----------
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // charts come in a light and a dark version
  function syncThemedImages(scope = document) {
    scope.querySelectorAll("img[data-light]").forEach((img) => {
      const want = darkQuery.matches ? img.dataset.dark : img.dataset.light;
      if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    });
  }
  darkQuery.addEventListener("change", () => {
    syncThemedImages();
    document.dispatchEvent(new Event("themechange"));
  });
  syncThemedImages();

  // ---------- gallery ----------
  // card clips play while on screen, so the motion is visible before the hover overview covers it
  const cardClips = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.play().catch(() => {}); else target.pause();
    });
  }, { threshold: 0.5 });
  document.querySelectorAll(".card").forEach((card) => {
    const v = card.querySelector(".card-media video");
    if (v && !reducedMotion) { v.preload = "metadata"; cardClips.observe(v); }
    // the whole card opens its case study, not just the button
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      open(card.dataset.case);
    });
  });

  // ---------- case studies ----------
  const dialog = document.getElementById("case");
  const body = dialog.querySelector(".case-body");
  const crumb = dialog.querySelector(".crumb");
  const order = [...document.querySelectorAll(".card")].map((c) => c.dataset.case);
  let current = null, opener = null;

  function open(id, push = true) {
    const tpl = document.getElementById(`tpl-${id}`);
    if (!tpl) return;
    current = id;
    body.replaceChildren(tpl.content.cloneNode(true));
    const i = order.indexOf(id);
    crumb.innerHTML = `<span>Work /</span> ${tpl.dataset.title}`;
    const next = order[(i + 1) % order.length];
    const nextTitle = document.getElementById(`tpl-${next}`).dataset.title;
    const foot = document.createElement("div");
    foot.className = "wrap";
    foot.innerHTML = `<div class="case-next"><button class="btn ghost" data-close>← All work</button>
      <button class="btn" data-goto="${next}">Next: ${nextTitle} →</button></div>`;
    body.appendChild(foot);
    if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
    body.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    document.body.style.overflow = "hidden";
    if (push) history.pushState({ case: id }, "", `#${id}`);
    setup(body);
  }

  function close(push = true) {
    if (!dialog.open) return;
    body.querySelectorAll("video").forEach((v) => v.pause());
    dialog.close();
    document.body.style.overflow = "";
    current = null;
    if (push && location.hash) history.pushState({}, "", location.pathname + location.search);
    opener?.focus?.();
  }

  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); open(o.dataset.open); return; }
    const g = e.target.closest("[data-goto]");
    if (g) { open(g.dataset.goto); return; }
    if (e.target.closest("[data-close]")) close();
  });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  addEventListener("popstate", () => {
    const id = location.hash.slice(1);
    if (order.includes(id)) open(id, false); else close(false);
  });
  const first = location.hash.slice(1);
  if (order.includes(first)) open(first, false);

  // keyboard: arrow keys move between case studies
  dialog.addEventListener("keydown", (e) => {
    if (e.target.closest("input, iframe")) return;
    const i = order.indexOf(current);
    if (e.key === "ArrowRight") open(order[(i + 1) % order.length]);
    if (e.key === "ArrowLeft") open(order[(i - 1 + order.length) % order.length]);
  });

  // ---------- things inside a case study ----------
  function setup(scope) {
    syncThemedImages(scope);

    // clips play while on screen (muted), pause when scrolled away
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {}); else target.pause();
      });
    }, { root: dialog, threshold: 0.4 });
    if (!reducedMotion) {
      scope.querySelectorAll("video[data-auto]").forEach((v) => io.observe(v));
    }

    // before / after slider
    scope.querySelectorAll(".compare").forEach((c) => {
      const input = c.querySelector("input");
      const setPos = () => c.style.setProperty("--pos", `${input.value}%`);
      input.addEventListener("input", setPos);
      setPos();
    });

    // heavy embeds load on request
    scope.querySelectorAll(".embed [data-src]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.src = btn.dataset.src;
        frame.title = btn.dataset.title || "Embedded demo";
        frame.loading = "lazy";
        btn.closest(".embed").replaceChildren(frame);
      });
    });

    // math
    const render = () => window.renderMathInElement?.(scope, {
      delimiters: [{ left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }],
      throwOnError: false,
    });
    if (window.renderMathInElement) render();
    else document.getElementById("katex-auto")?.addEventListener("load", render, { once: true });
  }
})();
