(function () {
  const cfg = window.OPENPAJOBS_CONFIG || {};
  const listEl = document.getElementById("job-list");
  const countEl = document.getElementById("count");
  const qEl = document.getElementById("q");
  const typeEl = document.getElementById("type");
  document.getElementById("y").textContent = new Date().getFullYear();

  let jobs = [];

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
    listEl.innerHTML = filtered
      .map((j) => {
        const href = j.url || "#";
        const tags = (j.tags || [])
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("");
        return `<article class="job">
          <div class="job-top">
            <h2><a href="${escapeAttr(href)}" ${href.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(j.title)}</a></h2>
            <span class="company">${escapeHtml(j.company)}</span>
          </div>
          <div class="meta">${escapeHtml(j.location)} · ${escapeHtml(j.type || "")}</div>
          <p class="blurb">${escapeHtml(j.blurb || "")}</p>
          <div class="tags">${tags}</div>
        </article>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function loadJobs() {
    const res = await fetch("jobs.json?v=20260926a");
    jobs = await res.json();
    render();
  }

  qEl.addEventListener("input", render);
  typeEl.addEventListener("change", render);

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
