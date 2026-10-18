(() => {
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ---------- theme ----------
  const saved = store.get("theme");
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;

  // charts come in a light and a dark version
  function syncThemedImages(scope = document) {
    const dark = isDark();
    scope.querySelectorAll("img[data-light]").forEach((img) => {
      const want = dark ? img.dataset.dark : img.dataset.light;
      if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    });
  }
  function themeChanged() {
    syncThemedImages();
    document.dispatchEvent(new Event("themechange"));
  }
  document.querySelector(".theme-btn")?.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    store.set("theme", root.dataset.theme);
    themeChanged();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);
  syncThemedImages();

  // ---------- gallery: play a card's clip while hovered ----------
  document.querySelectorAll(".card").forEach((card) => {
    const v = card.querySelector(".card-media video");
    if (!v) return;
    const play = () => { v.play().catch(() => {}); };
    const stop = () => { v.pause(); };
    card.addEventListener("mouseenter", play);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", play);
    card.addEventListener("focusout", stop);
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
    crumb.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span> / ${tpl.dataset.title}`;
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
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
