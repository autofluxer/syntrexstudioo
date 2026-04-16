const userEl = document.getElementById("user");
const passEl = document.getElementById("pass");
const loginForm = document.getElementById("loginForm");
const msgEl = document.getElementById("msg");
const listEl = document.getElementById("list");
const vouchListEl = document.getElementById("vouchList");
const adminGridEl = document.getElementById("adminGrid");
let canDeleteVouches = false;

function msg(text, kind) {
  msgEl.textContent = text;
  msgEl.className = "admin-msg" + (kind ? " " + kind : "");
}

function setDashboardVisible(visible) {
  if (!adminGridEl) return;
  adminGridEl.classList.toggle("is-hidden", !visible);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function escLines(s) {
  return String(s)
    .split("\n")
    .map((line) => esc(line))
    .join("<br>");
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-admin-user": userEl.value.trim(),
    "x-admin-password": passEl.value
  };
}

function explainWrongServer() {
  const { href, hostname, port, protocol } = window.location;
  const p = port || "(default)";
  let hint =
    "The API answered with a web page instead of data. That means this tab is NOT talking to the Node app.\n\n";
  hint += `You opened: ${href}\n\n`;
  if (port === "5500" || port === "5501" || port === "5502") {
    hint +=
      "Port 5500/5501 is usually VS Code Live Server. It cannot run /api. Stop using Live Server for this project.\n\n";
  }
  if (protocol === "file:") {
    hint += "You opened the file from disk (file://). That never works with the API.\n\n";
  }
  hint +=
    "Fix: in the terminal where you ran npm start, copy the URL it prints (e.g. http://localhost:3000). " +
    "Paste that into the address bar, then go to /admin.html on that same host and port only.\n" +
    "Example: http://localhost:3000/admin.html (use the port YOUR terminal shows.)";
  return hint;
}

async function readJson(res) {
  const t = await res.text();
  const x = t.trim();
  if (!x) {
    throw new Error(
      "Empty response from server. Use the exact URL from your npm start terminal (e.g. http://localhost:3000/admin.html)."
    );
  }
  if (x.startsWith("<!DOCTYPE") || x.startsWith("<!doctype") || x.startsWith("<html")) {
    throw new Error(explainWrongServer());
  }
  try {
    return JSON.parse(t);
  } catch {
    throw new Error("Bad response from server. Check username/password and that npm start is running.");
  }
}

function render(apps) {
  if (!apps.length) {
    listEl.innerHTML = '<p class="admin-empty">No applications yet.</p>';
    return;
  }
  listEl.innerHTML = apps
    .map((a) => {
      const st = a.status || "pending";
      const pending = st === "pending";
      const idAttr = esc(a.id);
      const body = escLines(
        `Age: ${a.age}\nPortfolio: ${a.portfolio}\nAvailability: ${a.availability}\n\nExperience:\n${a.experience}\n\nMotivation:\n${a.motivation}`
      );
      return `
      <article class="app-card" data-id="${idAttr}">
        <h2>${esc(a.fullName)}</h2>
        <p class="app-meta">${esc(a.email)} · ${esc(a.discord)} · ${esc(a.timezone)}</p>
        <span class="app-status ${esc(st)}">${esc(st)}</span>
        <div class="app-body">${body}</div>
        <div class="app-actions">
          <button type="button" class="accept" data-act="accept" ${pending ? "" : "disabled"}>Accept</button>
          <button type="button" class="reject" data-act="reject" ${pending ? "" : "disabled"}>Reject</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderVouches(vouches, canDelete) {
  if (!vouchListEl) return;
  if (!vouches.length) {
    vouchListEl.innerHTML = '<p class="admin-empty">No vouches yet.</p>';
    return;
  }
  vouchListEl.innerHTML = vouches
    .map((entry) => {
      const idAttr = esc(entry.id);
      const stars = "★".repeat(Math.max(1, Math.min(5, Number(entry.rating) || 0)));
      return `
      <article class="app-card vouch-card" data-vouch-id="${idAttr}">
        <h2>${esc(entry.name || "Anonymous")}</h2>
        <p class="app-meta">${esc(stars)} · ${esc(new Date(entry.createdAt).toLocaleString())}</p>
        <div class="app-body">${escLines(entry.message || "")}</div>
        ${
          canDelete
            ? `<div class="app-actions">
          <button type="button" class="reject" data-vouch-act="delete">Delete vouch</button>
        </div>`
            : '<p class="admin-locked-note">Owner-only action: delete disabled for this account.</p>'
        }
      </article>`;
    })
    .join("");
}

async function load() {
  msg("Loading…");
  setDashboardVisible(false);
  listEl.innerHTML = "";
  if (vouchListEl) vouchListEl.innerHTML = "";
  try {
    const [resApps, resVouches] = await Promise.all([
      fetch("/api/admin/applications", { headers: headers() }),
      fetch("/api/admin/vouches", { headers: headers() })
    ]);
    const [appsData, vouchesData] = await Promise.all([readJson(resApps), readJson(resVouches)]);
    if (!resApps.ok || !appsData.success) throw new Error(appsData.message || "Failed to load applications.");
    if (!resVouches.ok || !vouchesData.success) throw new Error(vouchesData.message || "Failed to load vouches.");
    canDeleteVouches = Boolean(vouchesData.canDeleteVouches);
    render(appsData.applications || []);
    renderVouches(vouchesData.vouches || [], canDeleteVouches);
    setDashboardVisible(true);
    msg("Loaded.", "ok");
  } catch (e) {
    canDeleteVouches = false;
    setDashboardVisible(false);
    msg(e.message || "Error.", "err");
  }
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  load();
});

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const card = btn.closest(".app-card");
  const id = card?.getAttribute("data-id");
  if (!id) return;
  const act = btn.dataset.act;
  if (act === "accept" && !confirm("Accept and email this applicant?")) return;
  if (act === "reject" && !confirm("Reject this application?")) return;
  msg("Saving…");
  try {
    const res = await fetch(`/api/admin/applications/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ decision: act === "accept" ? "accepted" : "rejected", reviewNote: "" })
    });
    const data = await readJson(res);
    if (!res.ok || !data.success) throw new Error(data.message || "Failed.");
    msg(data.message || "Done.", "ok");
    await load();
  } catch (err) {
    msg(err.message || "Error.", "err");
  }
});

if (vouchListEl) {
  vouchListEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-vouch-act]");
    if (!btn) return;
    if (!canDeleteVouches) {
      msg("Only the owner account can delete vouches.", "err");
      return;
    }
    const card = btn.closest(".vouch-card");
    const id = card?.getAttribute("data-vouch-id");
    if (!id) return;
    if (!confirm("Delete this vouch?")) return;
    msg("Deleting vouch…");
    try {
      const res = await fetch(`/api/admin/vouches/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers()
      });
      const data = await readJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete vouch.");
      msg(data.message || "Vouch deleted.", "ok");
      await load();
    } catch (error) {
      msg(error.message || "Error.", "err");
    }
  });
}
