/**
 * api.js  –  Backend integration for the Qatar Foundation Admin Portal
 *
 * Drop this file next to admin.js and add:
 *   <script src="api.js"></script>
 * BEFORE the <script src="admin.js"></script> line in admin.html.
 *
 * This file:
 *  - Provides a thin API client (window.API)
 *  - Overrides the form submit handlers defined in admin.js so auth and
 *    opportunity actions hit the Flask backend instead of running client-only.
 *  - Replaces the hard-coded opportunity cards with cards fetched from the DB.
 *  - Adds Edit / Delete buttons to each opportunity card.
 *
 * The original admin.css and admin.html are NOT modified.
 */

(() => {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────
     1.  CONFIG
  ───────────────────────────────────────────────────────────────────────── */
 const BASE_URL = "http://127.0.0.1:5000/api";

  /* ─────────────────────────────────────────────────────────────────────────
     2.  TOKEN STORAGE
  ───────────────────────────────────────────────────────────────────────── */
  const Token = {
    key: "qf_access_token",
    get() { return sessionStorage.getItem(this.key) || localStorage.getItem(this.key); },
    set(token, persist) {
      if (persist) localStorage.setItem(this.key, token);
      else sessionStorage.setItem(this.key, token);
    },
    clear() {
      sessionStorage.removeItem(this.key);
      localStorage.removeItem(this.key);
    },
  };

  /* ─────────────────────────────────────────────────────────────────────────
     3.  HTTP CLIENT
  ───────────────────────────────────────────────────────────────────────── */
  const API = {
    async _req(method, path, body, auth = true) {
      const headers = { "Content-Type": "application/json" };
      if (auth) {
        const t = Token.get();
        if (t) headers["Authorization"] = `Bearer ${t}`;
      }
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    },

    get:    (path)        => API._req("GET",    path),
    post:   (path, body, auth) => API._req("POST",   path, body, auth),
    put:    (path, body)  => API._req("PUT",    path, body),
    delete: (path)        => API._req("DELETE", path),
  };

  window.API = API;

  /* ─────────────────────────────────────────────────────────────────────────
     4.  WAIT FOR DOM + ADMIN.JS
  ───────────────────────────────────────────────────────────────────────── */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(() => {
    // Give admin.js a tick to register its handlers first, then we override.
    setTimeout(init, 0);
  });

  /* ─────────────────────────────────────────────────────────────────────────
     5.  INIT
  ───────────────────────────────────────────────────────────────────────── */
  function init() {
    hookLoginForm();
    hookSignupForm();
    hookForgotForm();
    hookOpportunityForm();
    hookLogout();
    hookNavOpportunity();

    // If a token already exists (page reload while logged in), restore dashboard
    if (Token.get()) {
      restoreDashboardSession();
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6.  AUTH HOOKS
  ───────────────────────────────────────────────────────────────────────── */

  function hookLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation(); // prevent admin.js handler from also firing

      const email    = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
      const remember = form.querySelector('input[type="checkbox"]')?.checked ?? false;
      const captchaInput = document.getElementById("loginCaptchaInput").value.trim();

      // Front-end captcha check still runs (unchanged from admin.js logic)
      // We only skip the client-side "success → dashboard" redirect and use the API instead.

      // Captcha validation (reuse existing captchas object from admin.js)
      if (!captchaInput || captchaInput !== window._captchas?.login) {
        // Let admin.js handle the captcha error display
        return;
      }

      const { ok, data } = await API.post("/auth/login", {
        email, password, remember_me: remember,
      }, false);

      if (!ok) {
        // Show error in the password field area (reuse admin.js helper if available)
        const errEl = document.getElementById("loginPasswordErr");
        if (errEl) {
          errEl.querySelector("span").textContent = data.message || "Invalid email or password.";
          errEl.classList.add("show");
        }
        if (typeof showToast === "function") showToast(data.message || "Login failed.");
        return;
      }

      Token.set(data.access_token, remember);
      sessionStorage.setItem("qf_admin_email", email);
      sessionStorage.setItem("qf_admin_name", data.admin?.full_name || email);

      if (typeof showToast === "function") showToast("Login successful!");
      setTimeout(() => {
        if (typeof showDashboard === "function") showDashboard(email);
        loadOpportunities();
      }, 800);
    }, true); // capture phase so we run first
  }

  function hookSignupForm() {
    const form = document.getElementById("signupForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const name     = document.getElementById("signupName").value.trim();
      const email    = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value.trim();
      const confirm  = document.getElementById("signupConfirmPassword").value.trim();
      const captchaInput = document.getElementById("signupCaptchaInput").value.trim();

      if (!captchaInput || captchaInput !== window._captchas?.signup) return;

      const { ok, data } = await API.post("/auth/signup", {
        full_name: name,
        email,
        password,
        confirm_password: confirm,
      }, false);

      if (!ok) {
        if (typeof showToast === "function") showToast(data.message || "Signup failed.");
        // Show near confirm-password error as a catch-all
        const errEl = document.getElementById("signupConfirmPasswordErr");
        if (errEl) {
          errEl.querySelector("span").textContent = data.message || "Signup failed.";
          errEl.classList.add("show");
        }
        return;
      }

      if (typeof showToast === "function") showToast("Account created successfully!");
      if (typeof generateCaptcha === "function") generateCaptcha("signup");
      form.reset();
      if (typeof checkStrength === "function") checkStrength("");
      setTimeout(() => { if (typeof showPage === "function") showPage("loginPage"); }, 1500);
    }, true);
  }

  function hookForgotForm() {
    const form = document.getElementById("forgotForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const email = document.getElementById("forgotEmail").value.trim();
      const captchaInput = document.getElementById("forgotCaptchaInput").value.trim();

      if (!captchaInput || captchaInput !== window._captchas?.forgot) return;

      const { data } = await API.post("/auth/forgot-password", { email }, false);

      if (typeof showToast === "function") showToast(data.message || "Reset link sent if email exists.");
      if (typeof generateCaptcha === "function") generateCaptcha("forgot");
      form.reset();
    }, true);
  }

  function hookLogout() {
    // admin.js calls handleLogout() which is defined globally. We wrap it.
    const originalLogout = window.handleLogout;
    window.handleLogout = function () {
      Token.clear();
      sessionStorage.removeItem("qf_admin_email");
      sessionStorage.removeItem("qf_admin_name");
      if (typeof originalLogout === "function") originalLogout();
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     7.  OPPORTUNITY HOOKS
  ───────────────────────────────────────────────────────────────────────── */

  function hookNavOpportunity() {
    // When the nav item for Opportunity is clicked, reload cards from API
    document.querySelectorAll('.nav-item[data-page="opportunity"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        setTimeout(loadOpportunities, 100); // after admin.js shows the section
      });
    });
  }

  function hookOpportunityForm() {
    const form = document.getElementById("opportunityForm");
    if (!form) return;

    // We use a data attribute to track editing state
    form._editingId = null;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const name        = document.getElementById("oppName").value.trim();
      const duration    = document.getElementById("oppDuration").value.trim();
      const startDate   = document.getElementById("oppStartDate").value.trim();
      const description = document.getElementById("oppDescription").value.trim();
      const skills      = document.getElementById("oppSkills").value.trim();
      const category    = document.getElementById("oppCategory").value.trim();
      const future      = document.getElementById("oppFuture").value.trim();
      const maxApp      = document.getElementById("oppMaxApplicants").value.trim();

      if (!name || !duration || !startDate || !description || !skills || !category || !future) {
        if (typeof showToast === "function") showToast("Please fill all required fields.");
        return;
      }

      const payload = {
        name, duration, start_date: startDate,
        description, skills, category,
        future_opportunities: future,
        max_applicants: maxApp ? parseInt(maxApp, 10) : null,
      };

      let result;
      const editId = form._editingId;

      if (editId) {
        result = await API.put(`/opportunities/${editId}`, payload);
      } else {
        result = await API.post("/opportunities/", payload);
      }

      const { ok, data } = result;

      if (!ok) {
        if (typeof showToast === "function") showToast(data.message || "Failed to save opportunity.");
        return;
      }

      if (typeof showToast === "function") showToast(editId ? "Opportunity updated!" : "Opportunity created!");
      if (typeof closeOpportunityModal === "function") closeOpportunityModal();
      form.reset();
      form._editingId = null;

      // Reset modal title back to "Add New Opportunity"
      const modalTitle = document.querySelector("#opportunityModal .modal-header h3");
      if (modalTitle) modalTitle.textContent = "Add New Opportunity";

      loadOpportunities();
    }, true);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     8.  LOAD & RENDER OPPORTUNITIES FROM API
  ───────────────────────────────────────────────────────────────────────── */

  async function loadOpportunities() {
    if (!Token.get()) return;

    const grid = document.querySelector(".opportunities-grid");
    if (!grid) return;

    const { ok, data } = await API.get("/opportunities/");

    // Clear existing cards (hardcoded + previously rendered)
    grid.innerHTML = "";

    if (!ok) {
      grid.innerHTML = `<p style="color:var(--qf-text-light);padding:20px;">Could not load opportunities. Please try again.</p>`;
      return;
    }

    const opps = data.opportunities || [];

    if (opps.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--qf-text-light);">
          <svg viewBox="0 0 24 24" style="width:56px;height:56px;stroke:var(--qf-border);fill:none;stroke-width:1.5;margin-bottom:16px;">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          <p style="font-size:16px;font-weight:600;margin-bottom:8px;">No opportunities yet</p>
          <p style="font-size:14px;">Click "Add New Opportunity" to create your first one.</p>
        </div>`;
      return;
    }

    opps.forEach((opp) => grid.appendChild(buildCard(opp)));
  }

  function buildCard(opp) {
    const card = document.createElement("div");
    card.className = "opportunity-card";
    card.dataset.oppId = opp.id;

    const skills = Array.isArray(opp.skills) ? opp.skills : [opp.skills];
    const skillTags = skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("");
    const applicantsText = opp.max_applicants ? `${opp.max_applicants} max applicants` : "Open enrollment";

    // Friendly date display
    const dateDisplay = opp.start_date
      ? new Date(opp.start_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
      : opp.start_date;

    card.innerHTML = `
      <div class="opportunity-card-header">
        <h5>${esc(opp.name)}</h5>
        <div class="opportunity-meta">
          <span>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${esc(opp.duration)}
          </span>
          <span>
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${esc(dateDisplay)}
          </span>
          <span style="text-transform:capitalize;background:var(--qf-mint-pale);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;color:var(--qf-green-dark);">
            ${esc(opp.category)}
          </span>
        </div>
      </div>
      <p class="opportunity-description">${esc(opp.description)}</p>
      <div class="opportunity-skills">
        <div class="opportunity-skills-label">Skills You'll Gain</div>
        <div class="skills-tags">${skillTags}</div>
      </div>
      <div class="opportunity-footer">
        <span class="applicants-count">${esc(applicantsText)}</span>
        <div style="display:flex;gap:8px;">
          <button class="view-course-btn" style="width:auto;padding:8px 14px;" data-action="view">View Details</button>
          <button class="view-course-btn" style="width:auto;padding:8px 14px;background:var(--qf-green-dark);" data-action="edit">Edit</button>
          <button class="view-course-btn" style="width:auto;padding:8px 14px;background:var(--qf-red);" data-action="delete">Delete</button>
        </div>
      </div>`;

    // Wire up buttons
    card.querySelector('[data-action="view"]').addEventListener("click", () => viewOpportunity(opp));
    card.querySelector('[data-action="edit"]').addEventListener("click", () => editOpportunity(opp));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteOpportunity(opp.id, opp.name, card));

    return card;
  }

  function viewOpportunity(opp) {
    if (typeof openOpportunityDetails === "function") {
      openOpportunityDetails(opp.name, {
        duration: opp.duration,
        startDate: opp.start_date,
        description: opp.description,
        skills: Array.isArray(opp.skills) ? opp.skills : [opp.skills],
        applicants: opp.max_applicants || 0,
        futureOpportunities: opp.future_opportunities,
        prerequisites: "",
      });
    }
  }

  function editOpportunity(opp) {
    // Pre-fill the Add/Edit modal
    document.getElementById("oppName").value             = opp.name || "";
    document.getElementById("oppDuration").value         = opp.duration || "";
    document.getElementById("oppStartDate").value        = opp.start_date || "";
    document.getElementById("oppDescription").value      = opp.description || "";
    document.getElementById("oppSkills").value           = Array.isArray(opp.skills)
      ? opp.skills.join(", ")
      : opp.skills || "";
    document.getElementById("oppCategory").value         = opp.category || "";
    document.getElementById("oppFuture").value           = opp.future_opportunities || "";
    document.getElementById("oppMaxApplicants").value    = opp.max_applicants != null ? opp.max_applicants : "";

    // Mark form as editing
    document.getElementById("opportunityForm")._editingId = opp.id;

    // Update modal title
    const modalTitle = document.querySelector("#opportunityModal .modal-header h3");
    if (modalTitle) modalTitle.textContent = "Edit Opportunity";

    if (typeof openOpportunityModal === "function") openOpportunityModal();
  }

  async function deleteOpportunity(id, name, cardEl) {
    const confirmed = window.confirm(`Are you sure you want to permanently delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;

    const { ok, data } = await API.delete(`/opportunities/${id}`);

    if (!ok) {
      if (typeof showToast === "function") showToast(data.message || "Failed to delete opportunity.");
      return;
    }

    if (typeof showToast === "function") showToast("Opportunity deleted.");
    cardEl.remove();

    // Show empty state if no cards left
    const grid = document.querySelector(".opportunities-grid");
    if (grid && grid.querySelectorAll(".opportunity-card").length === 0) {
      loadOpportunities(); // will render empty state
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     9.  SESSION RESTORE
  ───────────────────────────────────────────────────────────────────────── */

  async function restoreDashboardSession() {
    const { ok, data } = await API.get("/auth/me");
    if (!ok) {
      Token.clear();
      return;
    }
    const email = data.admin?.email || sessionStorage.getItem("qf_admin_email") || "";
    if (typeof showDashboard === "function") showDashboard(email);
    loadOpportunities();
  }

  /* ─────────────────────────────────────────────────────────────────────────
     10.  PATCH captchas OBJECT so our hooks can read it
  ───────────────────────────────────────────────────────────────────────── */

  // admin.js stores captchas in a local `captchas` const — not on window.
  // We monkey-patch generateCaptcha to mirror the value onto window._captchas.
  ready(() => {
    setTimeout(() => {
      const original = window.generateCaptcha;
      if (typeof original === "function") {
        window.generateCaptcha = function (type) {
          original(type);
          // Read back the rendered text
          const textEl = document.getElementById(type + "CaptchaText");
          if (textEl) {
            if (!window._captchas) window._captchas = {};
            window._captchas[type] = textEl.textContent;
          }
        };
        // Capture initial values
        ["login", "signup", "forgot"].forEach((t) => {
          const el = document.getElementById(t + "CaptchaText");
          if (el) {
            if (!window._captchas) window._captchas = {};
            window._captchas[t] = el.textContent;
          }
        });
      }
    }, 50);
  });

  /* ─────────────────────────────────────────────────────────────────────────
     11.  UTILITY
  ───────────────────────────────────────────────────────────────────────── */

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Expose loadOpportunities globally so it can be called from console or other scripts
  window.loadOpportunities = loadOpportunities;
})();