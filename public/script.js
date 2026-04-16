const form = document.getElementById("builderForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");
const year = document.getElementById("year");
const pageLoader = document.getElementById("pageLoader");
const vouchForm = document.getElementById("vouchForm");
const vouchList = document.getElementById("vouchList");
const vouchStatus = document.getElementById("vouchStatus");
const vouchSummary = document.getElementById("vouchSummary");
const vouchMoreLink = document.getElementById("vouchMoreLink");
const vouchSection = document.getElementById("vouch");
const maxVisibleVouches = 4;

if (year) {
  year.textContent = new Date().getFullYear();
}

function setStatus(message, type) {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = message;
  statusMessage.className = "status";
  if (type) {
    statusMessage.classList.add(type);
  }
}

function setupScrollAnimations() {
  const items = document.querySelectorAll(".card, .top-nav, .brand, .subtitle");
  items.forEach((item) => item.classList.add("reveal-on-scroll"));

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  items.forEach((item) => observer.observe(item));
}

function setupPageLoader() {
  if (!pageLoader) {
    document.body.classList.remove("loading");
    return;
  }

  const minVisibleMs = 1050;
  const fadeOutMs = 500;
  const startedAt = Date.now();
  let closed = false;

  const hideLoader = () => {
    if (closed) {
      return;
    }
    closed = true;
    pageLoader.classList.add("is-hidden");
    document.body.classList.remove("loading");
    setTimeout(() => {
      pageLoader.remove();
    }, fadeOutMs);
  };

  const hideWhenReady = () => {
    const elapsed = Date.now() - startedAt;
    const waitMore = Math.max(0, minVisibleMs - elapsed);
    setTimeout(() => {
      requestAnimationFrame(hideLoader);
    }, waitMore);
  };

  window.addEventListener("load", hideWhenReady, { once: true });
  setTimeout(hideWhenReady, 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderVouches(vouches) {
  if (!vouchList || !vouchSummary) {
    return;
  }

  const showAllVouches = vouchSection?.dataset.showAll === "true";

  if (vouches.length === 0) {
    vouchSummary.textContent = "No vouches yet. Be the first to share your experience.";
    vouchList.innerHTML = "";
    if (vouchMoreLink) {
      vouchMoreLink.hidden = true;
    }
    return;
  }

  const total = vouches.reduce((sum, entry) => sum + Number(entry.rating), 0);
  const average = (total / vouches.length).toFixed(1);
  vouchSummary.textContent = `${average}/5 from ${vouches.length} vouch${vouches.length === 1 ? "" : "es"}.`;

  const visibleVouches = showAllVouches ? vouches : vouches.slice(0, maxVisibleVouches);

  vouchList.innerHTML = visibleVouches
    .map((entry) => {
      const safeName = escapeHtml(entry.name || "Anonymous");
      const safeMessage = escapeHtml(entry.message);
      const stars = "★".repeat(Math.max(1, Math.min(5, Number(entry.rating))));
      return `
        <article class="review vouch-review">
          <p class="review-quote">"${safeMessage}"</p>
          <footer class="review-footer">
            <cite class="review-name">${safeName}</cite>
            <span class="review-meta">${stars} Rating</span>
          </footer>
        </article>
      `;
    })
    .join("");

  if (vouchMoreLink) {
    vouchMoreLink.hidden = showAllVouches || vouches.length <= maxVisibleVouches;
  }
}

async function loadVouches() {
  if (!vouchList || !vouchSummary) {
    return;
  }

  try {
    const response = await fetch("/api/vouches");
    const data = await readJsonBody(response);
    if (!response.ok || !data || !data.success || !Array.isArray(data.vouches)) {
      throw new Error("Could not load vouches.");
    }
    renderVouches(data.vouches);
  } catch {
    vouchSummary.textContent = "Could not load vouches right now.";
    vouchList.innerHTML = "";
  }
}

function setupVouchForm() {
  if (!vouchForm) {
    return;
  }

  loadVouches();

  vouchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(vouchForm);
    const name = String(formData.get("name") || "").trim().slice(0, 50);
    const message = String(formData.get("message") || "").trim();
    const rating = Number(formData.get("rating") || 5);

    if (!message) {
      if (vouchStatus) {
        vouchStatus.textContent = "Please write a short vouch before submitting.";
        vouchStatus.className = "status error";
      }
      return;
    }

    try {
      const response = await fetch("/api/vouches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          message: message.slice(0, 240),
          rating: Math.max(1, Math.min(5, rating))
        })
      });
      const data = await readJsonBody(response);
      if (!response.ok || !data || !data.success) {
        throw new Error((data && data.message) || "Could not submit vouch.");
      }

      vouchForm.reset();
      await loadVouches();

      if (vouchStatus) {
        vouchStatus.textContent = data.message || "Thanks for your vouch. Your rating has been added.";
        vouchStatus.className = "status success";
      }
    } catch (error) {
      if (vouchStatus) {
        vouchStatus.textContent = error.message || "Could not submit vouch right now.";
        vouchStatus.className = "status error";
      }
    }
  });
}

/** Avoid response.json() on empty/HTML bodies (wrong server / Live Server). */
async function readJsonBody(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    return { __html: true };
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

if (form && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Submitting your application...", "");
    submitButton.disabled = true;

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await readJsonBody(response);
      if (data && data.__html) {
        throw new Error(
          "Open this site from the URL printed after npm start (e.g. http://localhost:3000/). Live Server cannot submit applications."
        );
      }
      if (data == null) {
        throw new Error(
          "No response from the server. Use the same address as npm start in your terminal, then try again."
        );
      }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Submission failed.");
      }

      setStatus(data.message, "success");
      form.reset();
    } catch (error) {
      setStatus(error.message || "Something went wrong. Please try again.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

setupScrollAnimations();
setupPageLoader();
setupVouchForm();
