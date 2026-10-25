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
    if (!j || j.featured !== true || typeof j.featured_until !== "string") return false;
    var u = j.featured_until;
    var end = /^\d{4}-\d{2}-\d{2}$/.test(u) ? new Date(u + "T23:59:59.999Z") : new Date(u);
    return !isNaN(end.getTime()) && Date.now() <= end.getTime();
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
  var locEl = document.getElementById("filter-loc");
  var jobs = [];
  function normLoc(v) {
    v = String(v || "").trim();
    return /^remote$/i.test(v) ? "remote" : v.toUpperCase();
  }
  function hasLocOption(v) {
    if (!locEl) return false;
    for (var i = 0; i < locEl.options.length; i++) if (locEl.options[i].value === v) return true;
    return false;
  }
  if (locEl) {
    try {
      var initLoc = normLoc(new URLSearchParams(location.search).get("loc"));
      if (initLoc && hasLocOption(initLoc)) locEl.value = initLoc;
    } catch (e) {}
  }
  function syncLocParam() {
    try {
      var u = new URL(location.href);
      if (locEl && locEl.value) u.searchParams.set("loc", locEl.value);
      else u.searchParams.delete("loc");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }
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
    var typeClass = "job-type";
    var typeHtml = j.type
      ? '<span class="' + typeClass + '">' + escapeHtml(String(j.type || "").toUpperCase()) + "</span>"
      : "";
    var badgeHtml = featured
      ? '<span class="job-badge is-featured">Featured</span>'
      : hasFounding
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
  function matchesNonLoc(j, q, type, time) {
    if (type === "Featured" ? !isFeatured(j) : type && j.type !== type) return false;
    if (time === "7" && !withinDays(j.posted, 7)) return false;
    if (time === "30" && !withinDays(j.posted, 30)) return false;
    if (!q) return true;
    var hay = [j.title, j.company, j.location, j.blurb, j.type]
      .concat(j.tags || [])
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }
  // Location option counts follow the other active filters (time, type, search). The build-time
  // counts in index.html stay as the no-JS fallback. Zero-match options are hidden + disabled,
  // except the currently selected one.
  function updateLocCounts() {
    if (!locEl || !jobs.length) return;
    var q = qEl ? (qEl.value || "").trim().toLowerCase() : "";
    var type = typeEl ? typeEl.value : "";
    var time = timeEl ? timeEl.value : "all";
    var counts = {};
    jobs.forEach(function (j) {
      if (!matchesNonLoc(j, q, type, time)) return;
      (j.locs || []).forEach(function (l) {
        counts[l] = (counts[l] || 0) + 1;
      });
    });
    for (var i = 0; i < locEl.options.length; i++) {
      var o = locEl.options[i];
      if (!o.value) continue;
      var base = o.getAttribute("data-label");
      if (!base) {
        base = o.textContent.replace(/\s*\(\d+\)\s*$/, "");
        o.setAttribute("data-label", base);
      }
      var n = counts[o.value] || 0;
      o.textContent = base + " (" + n + ")";
      var hide = n === 0 && o.value !== locEl.value;
      o.hidden = hide;
      o.disabled = hide;
    }
  }
  function getFiltered() {
    var q = qEl ? (qEl.value || "").trim().toLowerCase() : "";
    var type = typeEl ? typeEl.value : "";
    var time = timeEl ? timeEl.value : "all";
    var sort = sortEl ? sortEl.value : "recent";
    var loc = locEl ? locEl.value : "";
    var filtered = jobs.filter(function (j) {
      if (loc && (j.locs || []).indexOf(loc) === -1) return false;
      return matchesNonLoc(j, q, type, time);
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
    updateLocCounts();
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
      var res = await fetch("jobs.active.json?v=20261025a");
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
  if (locEl) {
    locEl.addEventListener("change", function () {
      render();
      syncLocParam();
      track("filter_location", { loc: locEl.value || "all" });
    });
  }
  var FEATURE_HOST = "https://buy.stripe.com/";
  function track(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      var clean = {};
      Object.keys(params || {}).forEach(function (k) {
        var v = params[k];
        if (v !== undefined && v !== null && v !== "") clean[k] = v;
      });
      window.gtag("event", name, clean);
    } catch (e) {}
  }
  function pageJobParams() {
    var el = document.querySelector("[data-job-id]");
    if (!el) return {};
    var badge = document.querySelector(".job-page-featured");
    return {
      job_id: el.getAttribute("data-job-id"),
      company: el.getAttribute("data-company"),
      state: el.getAttribute("data-state"),
      remote: el.getAttribute("data-remote") === "true",
      featured: el.getAttribute("data-featured") === "true" && !(badge && badge.hidden),
    };
  }
  function formLocationParams(location) {
    var loc = String(location || "");
    var m = loc.match(/,\s*([A-Z]{2})\b/) || loc.match(/\b([A-Z]{2})\b/);
    return { state: m ? m[1] : "", remote: /\bremote\b/i.test(loc) };
  }
  function isOutbound(a) {
    try {
      var u = new URL(a.href, location.href);
      return /^https?:$/.test(u.protocol) && u.host !== location.host;
    } catch (e) {
      return false;
    }
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf(FEATURE_HOST) === 0) {
      track("featured_click", pageJobParams());
      return;
    }
    var slotEl = a.closest("[data-sponsor-slot]");
    if (slotEl) {
      var slot = slotEl.getAttribute("data-sponsor-slot");
      if (a.classList.contains("sponsor-link")) {
        track("sponsor_click", { slot: slot, sponsor: a.getAttribute("data-sponsor"), transport_type: "beacon" });
      } else if (a.classList.contains("sponsor-open")) {
        track("sponsor_cta_click", { slot: slot });
      }
      return;
    }
    var inApplyBar = a.closest(".job-apply-bar") && a.classList.contains("btn-primary");
    var inSourceLink = a.closest(".job-body-prose");
    if ((inApplyBar || inSourceLink) && isOutbound(a)) {
      var p = pageJobParams();
      p.link_location = inApplyBar ? "apply_button" : "source_link";
      p.transport_type = "beacon";
      track("apply_click", p);
    }
  });
  async function submitWeb3(form, statusEl, formName, extra, onSuccess) {
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
        if (onSuccess) onSuccess(payload);
        form.reset();
      } else {
        statusEl.textContent = data.message || "Something went wrong. Try again.";
      }
    } catch (e) {
      statusEl.textContent = "Network error — try again in a minute.";
    }
  }
  // Kit (kit.com) forms: plain POST with FormData (email_address), JSON reply. If fetch itself fails
  // (network/CORS), fall back to a normal form post to the same Kit action URL.
  function submitKit(form, statusEl, opts) {
    if (!form || form.getAttribute("data-busy") === "1") return;
    var btn = form.querySelector('button[type="submit"]');
    function done() {
      form.removeAttribute("data-busy");
      if (btn) btn.disabled = false;
    }
    function say(html) {
      if (statusEl) statusEl.innerHTML = html;
    }
    form.setAttribute("data-busy", "1");
    if (btn) btn.disabled = true;
    say("Sending…");
    var fd = new FormData(form);
    fd.append("referrer", document.referrer || "");
    fd.append("host", location.href);
    fetch(form.action, { method: "POST", body: fd, headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        done();
        if (data && data.status === "success") {
          form.reset();
          form.classList.add("is-done");
          say(escapeHtml(opts.success));
          if (opts.onSuccess) opts.onSuccess();
        } else if (data && data.status === "quarantined" && data.url) {
          say(
            'One more step: <a href="' +
              escapeAttr(data.url) +
              '" target="_blank" rel="noopener">complete a quick security check</a> to finish signing up.'
          );
          if (opts.onSuccess) opts.onSuccess({ quarantined: true });
        } else {
          var msg = "";
          try {
            msg = (data.errors && (data.errors.messages || []).join(" ")) || "";
          } catch (e) {}
          say(escapeHtml(msg || "That didn’t go through. Check the email address and try again."));
        }
      })
      .catch(function () {
        done();
        say("Sending…");
        try {
          HTMLFormElement.prototype.submit.call(form);
        } catch (e) {
          say("Network error. Try again in a minute.");
        }
      });
  }
  var formAlerts = document.getElementById("form-alerts");
  if (formAlerts) {
    formAlerts.addEventListener("submit", function (e) {
      e.preventDefault();
      submitKit(formAlerts, document.getElementById("alert-status"), {
        success: "Almost done: check your email and click the confirm link to start getting PA job alerts.",
        onSuccess: function (x) {
          track("alert_signup", { form: "kit_job_alerts", quarantined: x && x.quarantined ? true : undefined });
        },
      });
    });
  }
  document.querySelectorAll("form[data-kit-guide]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      submitKit(f, f.querySelector(".status"), {
        success: "Almost done: check your email and click the confirm link to get your PDF download.",
        onSuccess: function (x) {
          track("guide_signup", {
            form: "kit_pa_licensing_guide",
            placement: f.getAttribute("data-kit-guide"),
            quarantined: x && x.quarantined ? true : undefined,
          });
        },
      });
    });
  });
  var formPost = document.getElementById("form-post");
  if (formPost) {
    formPost.addEventListener("submit", function (e) {
      e.preventDefault();
      submitWeb3(
        e.target,
        document.getElementById("post-status"),
        cfg.postFormName || "Open PA Jobs post",
        { form_type: "post_job" },
        function (payload) {
          var p = formLocationParams(payload.location);
          p.company = payload.firm;
          track("post_job_submit", p);
        }
      );
    });
  }
  document.querySelectorAll("[data-featured-until]").forEach(function (el) {
    var end = new Date(el.getAttribute("data-featured-until"));
    if (isNaN(end.getTime()) || Date.now() > end.getTime()) el.hidden = true;
  });
  // Sponsor windows are re-checked in the browser so a slot starts/ends on the right day without a rebuild.
  document.querySelectorAll("[data-sponsor-start]").forEach(function (el) {
    var start = Date.parse(el.getAttribute("data-sponsor-start") + "T00:00:00Z");
    var endAttr = el.getAttribute("data-sponsor-end");
    var end = endAttr ? Date.parse(endAttr + "T23:59:59Z") : Infinity;
    var live = !isNaN(start) && Date.now() >= start && Date.now() <= end;
    var body = el.querySelector(".sponsor-body");
    var open = el.querySelector(".sponsor-open");
    if (body) body.hidden = !live;
    if (open) open.hidden = live;
  });
  // sponsor.html: refresh build-time counts from the live feed (same numbers the board shows).
  if (document.querySelector("[data-live-stat]")) {
    fetch("/jobs.active.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (jobs) {
      if (!Array.isArray(jobs) || !jobs.length) return;
      var firms = {};
      jobs.forEach(function (j) { var c = String(j.company || "").trim().toLowerCase(); if (c) firms[c] = 1; });
      var vals = { listings: jobs.length, firms: Object.keys(firms).length };
      document.querySelectorAll("[data-live-stat]").forEach(function (el) {
        var k = el.getAttribute("data-live-stat");
        if (vals[k] !== undefined) el.textContent = String(vals[k]);
      });
    }).catch(function () {});
  }
  if (document.querySelector("[data-job-id]")) track("listing_view", pageJobParams());
  if (document.querySelector('[data-ga-event="featured_purchase"]')) {
    var sent = false;
    try {
      sent = sessionStorage.getItem("opj-featured-purchase") === "1";
      if (!sent) sessionStorage.setItem("opj-featured-purchase", "1");
    } catch (e) {}
    if (!sent) track("featured_purchase", { value: 49, currency: "USD" });
  }
  loadJobs();
})();
