(function () {
  const cfg = window.OPENPAJOBS_CONFIG || {};
  const themeToggle = document.getElementById("theme-toggle");
  const yearEl = document.getElementById("y");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* —— Theme (early; never blocked by jobs/forms) —— */
  const THEME_KEY = "openpajobs-theme";

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function updateToggleLabel(theme) {
    if (!themeToggle) return;
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) { /* ignore */ }
    updateToggleLabel(next);
  }

  updateToggleLabel(getTheme());

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      setTheme(getTheme() === "dark" ? "light" : "dark");
    });
  }

  /* —— Escape helpers (concat so MCP/HTML pipelines cannot strip entities) —— */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&" + "#39;");
  }

  /* —— Jobs (homepage only) —— */
  const listEl = document.getElementById("job-list");
  const countEl = document.getElementById("count");
  const statJobsEl = document.getElementById("stat-jobs");
  const qEl = document.getElementById("q");
  const typeEl = document.getElementById("type");
  let jobs = [];

  function render() {
    if (!listEl || !countEl || !qEl || !typeEl) return;
    const q = (qEl.value || "").trim().toLowerCase();
    const type = typeEl.value;
    const filtered = jobs.filter(function (j) {
      if (type && j.type !== type) return false;
      if (!q) return true;
      const hay = [j.title, j.company, j.location, j.blurb]
        .concat(j.tags || [])
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    countEl.textContent = filtered.length + " open";

    if (!filtered.length) {
      listEl.innerHTML =
        '<div class="jobs-empty">No roles match that search. Try clearing filters.</div>';
      return;
    }

    listEl.innerHTML = filtered
      .map(function (j) {
        const href = j.url || "#";
        const external = href.startsWith("http");
        const tags = (j.tags || [])
          .map(function (t) {
            return '<span class="tag">' + escapeHtml(t) + "</span>";
          })
          .join("");
        return (
          '<article class="job">' +
          '<div class="job-top">' +
          '<h2 class="job-title"><a href="' +
          escapeAttr(href) +
          '"' +
          (external ? ' target="_blank" rel="noopener noreferrer"' : "") +
          ">" +
          escapeHtml(j.title) +
          "</a></h2>" +
          '<span class="job-company">' +
          escapeHtml(j.company) +
          "</span>" +
          "</div>" +
          '<div class="job-meta">' +
          "<span>" +
          escapeHtml(j.location) +
          "</span>" +
          '<span class="sep" aria-hidden="true">·</span>' +
          "<span>" +
          escapeHtml(j.type || "") +
          "</span>" +
          "</div>" +
          '<p class="job-blurb">' +
          escapeHtml(j.blurb || "") +
          "</p>" +
          (tags ? '<div class="job-tags">' + tags + "</div>" : "") +
          "</article>"
        );
      })
      .join("");
  }

  async function loadJobs() {
    if (!listEl) return;
    try {
      const res = await fetch("jobs.json?v=20260926c");
      if (!res.ok) throw new Error("HTTP " + res.status);
      jobs = await res.json();
      if (!Array.isArray(jobs)) throw new Error("Invalid jobs payload");
      if (statJobsEl) statJobsEl.textContent = String(jobs.length);
      render();
    } catch (e) {
      jobs = [];
      if (statJobsEl) statJobsEl.textContent = "—";
      if (countEl) countEl.textContent = "";
      listEl.innerHTML =
        '<div class="jobs-empty">Couldn\u2019t load listings right now. Refresh the page or try again shortly.</div>';
    }
  }

  if (qEl) qEl.addEventListener("input", render);
  if (typeEl) typeEl.addEventListener("change", render);

  /* —— Forms —— */
  async function submitWeb3(form, statusEl, formName, extra) {
    if (!statusEl) return;
    statusEl.textContent = "Sending\u2026";
    const key = cfg.web3formsAccessKey;
    if (!key || key.length < 20) {
      statusEl.textContent =
        "Form not configured yet — email joshua.gray.read@gmail.com";
      return;
    }
    const fd = new FormData(form);
    const payload = Object.assign(
      {
        access_key: key,
        subject: formName,
        from_name: "Open PA Jobs",
      },
      extra || {}
    );
    fd.forEach(function (v, k) {
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

  const formAlerts = document.getElementById("form-alerts");
  if (formAlerts) {
    formAlerts.addEventListener("submit", function (e) {
      e.preventDefault();
      submitWeb3(
        e.target,
        document.getElementById("alert-status"),
        cfg.alertFormName || "Open PA Jobs alerts",
        { form_type: "alerts" }
      );
    });
  }

  const formPost = document.getElementById("form-post");
  if (formPost) {
    formPost.addEventListener("submit", function (e) {
      e.preventDefault();
      submitWeb3(
        e.target,
        document.getElementById("post-status"),
        cfg.postFormName || "Open PA Jobs post",
        { form_type: "post_job" }
      );
    });
  }

  loadJobs();
})();
