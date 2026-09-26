(function () {
  const cfg = window.OPENPAJOBS_CONFIG || {};
  const listEl = document.getElementById("job-list");
  const countEl = document.getElementById("count");
  const statJobsEl = document.getElementById("stat-jobs");
  const qEl = document.getElementById("q");
  const typeEl = document.getElementById("type");
  const themeToggle = document.getElementById("theme-toggle");
  document.getElementById("y").textContent = new Date().getFullYear();

  let jobs = [];

  /* —— Theme —— */
  const THEME_KEY = "openpajobs-theme";

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) { /* ignore */ }
    updateToggleLabel(next);
  }

  function updateToggleLabel(theme) {
    if (!themeToggle) return;
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }

  updateToggleLabel(getTheme());

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      setTheme(getTheme() === "dark" ? "light" : "dark");
    });
  }

  /* —— Jobs —— */
  function render() {
    const q = (qEl.value || "").trim().toLowerCase();
    const type = typeEl.value;
    const filtered = jobs.filter((j) => {
      if (type && j.type !== type) return false;
      if (!q) return true;
      const hay = [j.title, j.company, j.location, j.blurb, ...(j.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    countEl.textContent = filtered.length + " open";

    if (!filtered.length) {
      listEl.innerHTML = `<div class="jobs-empty">No roles match that search. Try clearing filters.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((j) => {
        const href = j.url || "#";
        const external = href.startsWith("http");
        const tags = (j.tags || [])
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("");
        return `<article class="job">
          <div class="job-top">
            <h2 class="job-title"><a href="${escapeAttr(href)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(j.title)}</a></h2>
            <span class="job-company">${escapeHtml(j.company)}</span>
          </div>
          <div class="job-meta">
            <span>${escapeHtml(j.location)}</span>
            <span class="sep" aria-hidden="true">·</span>
            <span>${escapeHtml(j.type || "")}</span>
          </div>
          <p class="job-blurb">${escapeHtml(j.blurb || "")}</p>
          ${tags ? `<div class="job-tags">${tags}</div>` : ""}
        </article>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """);
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function loadJobs() {
    const res = await fetch("jobs.json?v=20260926b");
    jobs = await res.json();
    if (statJobsEl) statJobsEl.textContent = String(jobs.length);
    render();
  }

  qEl.addEventListener("input", render);
  typeEl.addEventListener("change", render);

  /* —— Forms —— */
  async function submitWeb3(form, statusEl, formName, extra) {
    statusEl.textContent = "Sending…";
    const key = cfg.web3formsAccessKey;
    if (!key || key.length < 20) {
      statusEl.textContent = "Form not configured yet — email joshua.gray.read@gmail.com";
      return;
    }
    const fd = new FormData(form);
    const payload = {
      access_key: key,
      subject: formName,
      from_name: "Open PA Jobs",
      ...extra,
    };
    fd.forEach((v, k) => {
      payload[k] = v;
    });
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        statusEl.textContent = "Got it — check your inbox soon.";
        form.reset();
      } else {
        statusEl.textContent = data.message || "Something went wrong. Try again.";
      }
    } catch (e) {
      statusEl.textContent = "Network error — try again in a minute.";
    }
  }

  document.getElementById("form-alerts").addEventListener("submit", (e) => {
    e.preventDefault();
    submitWeb3(e.target, document.getElementById("alert-status"), cfg.alertFormName || "Open PA Jobs alerts", {
      form_type: "alerts",
    });
  });
  document.getElementById("form-post").addEventListener("submit", (e) => {
    e.preventDefault();
    submitWeb3(e.target, document.getElementById("post-status"), cfg.postFormName || "Open PA Jobs post", {
      form_type: "post_job",
    });
  });

  loadJobs();
})();
