(function () {
  const cfg = window.OPENPAJOBS_CONFIG || {};
  const themeToggle = document.getElementById("theme-toggle");
  const yearEl = document.getElementById("y");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
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
    } catch (e) {  }
    updateToggleLabel(next);
  }
  updateToggleLabel(getTheme());
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      setTheme(getTheme() === "dark" ? "light" : "dark");
    });
  }
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
  var ICON_SEARCH =
    '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  var ICON_PEOPLE =
    '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var ICON_PIN =
    '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var ICON_CAL =
    '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  function companyInitials(name) {
    var parts = String(name || "")
      .replace(/[()]/g, " ")
      .split(/\s+/)
      .filter(function (w) {
        return w && !/^(and|&|the|of|a|an)$/i.test(w);
      });
    if (!parts.length) return "PA";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  function relativeTime(iso) {
    if (!iso) return "";
    var posted = new Date(iso + (String(iso).length <= 10 ? "T12:00:00" : ""));
    if (isNaN(posted.getTime())) return "";
    var now = new Date();
    var diffMs = now.getTime() - posted.getTime();
    if (diffMs < 0) diffMs = 0;
    var days = Math.floor(diffMs / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "1d ago";
    if (days < 30) return days + "d ago";
    var months = Math.floor(days / 30);
    if (months < 12) return months + "mo ago";
    return Math.floor(months / 12) + "y ago";
  }
  function isFeatured(j) {
    return j.featured === true || j.type === "Featured";
  }
  function withinDays(iso, days) {
    if (!iso) return false;
    var posted = new Date(iso + (String(iso).length <= 10 ? "T12:00:00" : ""));
    if (isNaN(posted.getTime())) return false;
    var cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    return posted.getTime() >= cutoff.getTime();
  }
  var listEl = document.getElementById("job-list");
  var countEl = document.getElementById("count");
  var qEl = document.getElementById("q");
  var timeEl = document.getElementById("filter-time");
  var sortEl = document.getElementById("filter-sort");
  var typeEl = document.getElementById("filter-type");
  var jobs = [];
  function renderJobCard(j) {
    var href = j.id ? "/jobs/" + encodeURIComponent(j.id) + ".html" : (j.url || "#");
    var external = false;
    var tagList = j.tags || [];
    var tags = tagList
      .filter(function (t) {
        return !/^founding$/i.test(String(t));
      })
      .map(function (t) {
        return '<span class="tag">' + escapeHtml(String(t).toUpperCase()) + "</span>";
      })
      .join("");
    var initials = companyInitials(j.company);
    var when = relativeTime(j.posted);
    var featured = isFeatured(j);
    var hasFounding = tagList.some(function (t) {
      return /^founding$/i.test(String(t));
    });
    var typeClass = "job-type" + (featured ? " is-featured" : "");
    var typeHtml = j.type
      ? '<span class="' + typeClass + '">' + escapeHtml(String(j.type || "").toUpperCase()) + "</span>"
      : "";
    var badgeHtml = hasFounding
      ? '<span class="job-badge is-founding">Founding</span>'
      : "";
    var markHtml = j.logo
      ? '<div class="job-mark has-logo" aria-hidden="true"><img src="' +
        escapeAttr(j.logo) +
        '" alt="" /></div>'
      : '<div class="job-mark" aria-hidden="true">' + escapeHtml(initials) + "</div>";
    var salaryHtml = j.salary
      ? '<div class="job-salary"><span class="job-salary-icon" aria-hidden="true">$</span><span>' +
        escapeHtml(j.salary) +
        "</span></div>"
      : "";
    return (
      '<article class="job' +
      (featured ? " job-featured" : "") +
      '">' +
      markHtml +
      '<div class="job-body">' +
      '<h2 class="job-title"><a href="' +
      escapeAttr(href) +
      '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : "") +
      ">" +
      escapeHtml(j.title) +
      "</a></h2>" +
      salaryHtml +
      '<div class="job-sub">' +
      '<span class="job-sub-item">' +
      ICON_PEOPLE +
      '<span class="job-company">' +
      escapeHtml(j.company) +
      "</span></span>" +
      '<span class="job-sub-item">' +
      ICON_PIN +
      "<span>" +
      escapeHtml(j.location || "") +
      "</span></span>" +
      "</div>" +
      "</div>" +
      '<div class="job-tags">' +
      tags +
      "</div>" +
      '<div class="job-aside">' +
      badgeHtml +
      typeHtml +
      (when
        ? '<span class="job-date">' + ICON_CAL + "<span>" + escapeHtml(when) + "</span></span>"
        : "") +
      "</div>" +
      "</article>"
    );
  }
  function getFiltered() {
    var q = qEl ? (qEl.value || "").trim().toLowerCase() : "";
    var type = typeEl ? typeEl.value : "";
    var time = timeEl ? timeEl.value : "all";
    var sort = sortEl ? sortEl.value : "recent";
    var filtered = jobs.filter(function (j) {
      if (type && j.type !== type) return false;
      if (time === "7" && !withinDays(j.posted, 7)) return false;
      if (time === "30" && !withinDays(j.posted, 30)) return false;
      if (!q) return true;
      var hay = [j.title, j.company, j.location, j.blurb, j.type]
        .concat(j.tags || [])
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    filtered = filtered.slice();
    if (sort === "company") {
      filtered.sort(function (a, b) {
        return String(a.company || "").localeCompare(String(b.company || ""), undefined, {
          sensitivity: "base",
        });
      });
    } else {
      filtered.sort(function (a, b) {
        var da = a.posted || "";
        var db = b.posted || "";
        if (da !== db) return db < da ? -1 : 1;
        return 0;
      });
    }
    return filtered;
  }
  function render() {
    if (!listEl) return;
    var filtered = getFiltered();
    if (countEl) {
      countEl.textContent =
        filtered.length + (filtered.length === 1 ? " job found" : " jobs found");
    }
    if (!filtered.length) {
      listEl.innerHTML =
        '<div class="jobs-empty">No roles match that search. Try clearing filters.</div>';
      return;
    }
    var featured = [];
    var rest = [];
    filtered.forEach(function (j) {
      if (isFeatured(j)) featured.push(j);
      else rest.push(j);
    });
    var html = "";
    if (featured.length) {
      html += '<p class="jobs-label">Featured</p>';
      html += '<div class="jobs-group">' + featured.map(renderJobCard).join("") + "</div>";
    }
    if (rest.length) {
      if (featured.length) {
        html += '<div class="section-wave" aria-hidden="true"></div>';
        html += '<p class="jobs-label">All jobs</p>';
      }
      html += '<div class="jobs-group">' + rest.map(renderJobCard).join("") + "</div>";
    }
    listEl.innerHTML = html;
  }
  async function loadJobs() {
    if (!listEl) return;
    try {
      var res = await fetch("jobs.json?v=20260926m");
      if (!res.ok) throw new Error("HTTP " + res.status);
      jobs = await res.json();
      if (!Array.isArray(jobs)) throw new Error("Invalid jobs payload");
      render();
    } catch (e) {
      jobs = [];
      if (countEl) countEl.textContent = "";
      listEl.innerHTML =
        '<div class="jobs-empty">Couldn’t load listings right now. Refresh the page or try again shortly.</div>';
    }
  }
  if (qEl) qEl.addEventListener("input", render);
  if (timeEl) timeEl.addEventListener("change", render);
  if (sortEl) sortEl.addEventListener("change", render);
  if (typeEl) typeEl.addEventListener("change", render);
  async function submitWeb3(form, statusEl, formName, extra) {
    if (!statusEl) return;
    statusEl.textContent = "Sending…";
    var key = cfg.web3formsAccessKey;
    if (!key || key.length < 20) {
      statusEl.textContent =
        "Form not configured yet — email joshua.gray.read@gmail.com";
      return;
    }
    var fd = new FormData(form);
    var payload = Object.assign(
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
      var res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
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
  var formAlerts = document.getElementById("form-alerts");
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
  var formPost = document.getElementById("form-post");
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
