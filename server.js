require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const dataPath = path.join(__dirname, "data", "applications.json");
const vouchesPath = path.join(__dirname, "data", "vouches.json");
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "jovankinezpicka6712335";
const ownerUsername = process.env.OWNER_USERNAME || adminUsername;
const ownerPassword = process.env.OWNER_PASSWORD || adminPassword;
const mailFrom = process.env.MAIL_FROM || "SyntrexStudio <no-reply@syntrexstudio.local>";

app.use(express.json());

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureDataStore() {
  const dataDir = path.dirname(dataPath);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataPath);
  } catch {
    await fs.writeFile(dataPath, "[]", "utf8");
  }
  try {
    await fs.access(vouchesPath);
  } catch {
    await fs.writeFile(vouchesPath, "[]", "utf8");
  }
}

async function readApplications() {
  const file = await fs.readFile(dataPath, "utf8");
  const parsed = JSON.parse(file);
  return parsed.map((application) => ({
    status: "pending",
    reviewedAt: null,
    reviewNote: "",
    ...application
  }));
}

async function writeApplications(applications) {
  await fs.writeFile(dataPath, JSON.stringify(applications, null, 2), "utf8");
}

async function readVouches() {
  const file = await fs.readFile(vouchesPath, "utf8");
  const parsed = JSON.parse(file);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeVouches(vouches) {
  await fs.writeFile(vouchesPath, JSON.stringify(vouches, null, 2), "utf8");
}

function validateApplication(body) {
  const requiredFields = [
    "fullName",
    "age",
    "email",
    "discord",
    "timezone",
    "experience",
    "portfolio",
    "availability",
    "motivation"
  ];

  for (const field of requiredFields) {
    if (!body[field] || String(body[field]).trim().length === 0) {
      return `Field '${field}' is required.`;
    }
  }

  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 13 || age > 100) {
    return "Age must be a valid number between 13 and 100.";
  }

  if (!emailPattern.test(String(body.email).trim())) {
    return "Please provide a valid email address.";
  }

  if (String(body.motivation).trim().length < 30) {
    return "Motivation must be at least 30 characters.";
  }

  return null;
}

function validateVouch(body) {
  const message = String(body.message || "").trim();
  if (!message) {
    return "Vouch message is required.";
  }
  if (message.length > 240) {
    return "Vouch message cannot be longer than 240 characters.";
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "Rating must be a whole number between 1 and 5.";
  }

  const name = String(body.name || "").trim();
  if (name.length > 50) {
    return "Name cannot be longer than 50 characters.";
  }

  return null;
}

function requireAdmin(req, res, next) {
  const user = String(req.headers["x-admin-user"] || "").trim();
  const pass = String(req.headers["x-admin-password"] || "");
  if (user !== adminUsername || pass !== adminPassword) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password."
    });
  }
  return next();
}

function isOwner(req) {
  const user = String(req.headers["x-admin-user"] || "").trim();
  const pass = String(req.headers["x-admin-password"] || "");
  return user === ownerUsername && pass === ownerPassword;
}

function requireOwner(req, res, next) {
  if (!isOwner(req)) {
    return res.status(403).json({
      success: false,
      message: "Only the owner account can delete vouches."
    });
  }
  return next();
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass }
  });
}

async function sendAcceptanceEmail(application) {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM."
    );
  }

  await transporter.sendMail({
    from: mailFrom,
    to: application.email,
    subject: "SyntrexStudio Builder Application - Accepted",
    text:
      `Hi ${application.fullName},\n\n` +
      "Congratulations! Your builder application for SyntrexStudio has been accepted.\n" +
      "Our team will contact you soon with your onboarding details.\n\n" +
      "Thank you,\nSyntrexStudio Team"
  });
}

app.post("/api/applications", async (req, res) => {
  try {
    const error = validateApplication(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const applications = await readApplications();
    const newEntry = {
      id: Date.now().toString(),
      submittedAt: new Date().toISOString(),
      fullName: req.body.fullName.trim(),
      age: Number(req.body.age),
      email: req.body.email.trim(),
      discord: req.body.discord.trim(),
      timezone: req.body.timezone.trim(),
      experience: req.body.experience.trim(),
      portfolio: req.body.portfolio.trim(),
      availability: req.body.availability.trim(),
      motivation: req.body.motivation.trim()
    };

    applications.push(newEntry);
    await writeApplications(applications);

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully. Our team will review it soon."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later."
    });
  }
});

app.get("/api/applications/count", async (_req, res) => {
  try {
    const applications = await readApplications();
    res.json({ success: true, count: applications.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load application count." });
  }
});

app.get("/api/vouches", async (_req, res) => {
  try {
    const vouches = await readVouches();
    vouches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, vouches });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load vouches." });
  }
});

app.post("/api/vouches", async (req, res) => {
  try {
    const error = validateVouch(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const vouches = await readVouches();
    const newEntry = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      name: String(req.body.name || "").trim(),
      message: String(req.body.message || "").trim(),
      rating: Number(req.body.rating)
    };
    vouches.push(newEntry);
    await writeVouches(vouches);

    return res.status(201).json({
      success: true,
      message: "Thanks for your vouch.",
      vouch: newEntry
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later."
    });
  }
});

app.get("/api/admin/applications", requireAdmin, async (_req, res) => {
  try {
    const applications = await readApplications();
    applications.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json({ success: true, applications });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load applications." });
  }
});

app.get("/api/admin/vouches", requireAdmin, async (_req, res) => {
  try {
    const vouches = await readVouches();
    vouches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, vouches, canDeleteVouches: isOwner(_req) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load vouches." });
  }
});

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin/applications/:id/decision", requireAdmin, async (req, res) => {
  try {
    const decision = String(req.body.decision || "").trim().toLowerCase();
    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Decision must be accepted or rejected." });
    }

    const applications = await readApplications();
    const applicationIndex = applications.findIndex((appItem) => appItem.id === req.params.id);
    if (applicationIndex === -1) {
      return res.status(404).json({ success: false, message: "Application not found." });
    }

    const current = applications[applicationIndex];
    if (current.status === "accepted" && decision === "accepted") {
      return res.status(409).json({
        success: false,
        message: "Application is already accepted."
      });
    }

    if (decision === "accepted") {
      await sendAcceptanceEmail(current);
    }

    applications[applicationIndex] = {
      ...current,
      status: decision,
      reviewedAt: new Date().toISOString(),
      reviewNote
    };

    await writeApplications(applications);

    return res.json({
      success: true,
      message:
        decision === "accepted"
          ? "Application accepted and email sent."
          : "Application rejected successfully.",
      application: applications[applicationIndex]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Could not process application decision."
    });
  }
});

app.delete("/api/admin/vouches/:id", requireAdmin, requireOwner, async (req, res) => {
  try {
    const vouches = await readVouches();
    const index = vouches.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Vouch not found." });
    }

    vouches.splice(index, 1);
    await writeVouches(vouches);
    return res.json({ success: true, message: "Vouch deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not delete vouch."
    });
  }
});

app.get("/public/admin.html", (_req, res) => res.redirect(302, "/admin.html"));
app.get("/public/index.html", (_req, res) => res.redirect(302, "/"));

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ success: false, message: "API route not found." });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureDataStore()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`SyntrexStudio application site running on http://localhost:${port}`);
      console.log(`Admin panel: http://localhost:${port}/admin.html`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `\nPort ${port} is already in use (another program or an old "npm start" is still running).\n` +
            `  • Close the other terminal window running this app, or stop that process.\n` +
            `  • Or use another port: add PORT=3001 to your .env file and run npm start again.\n`
        );
        process.exit(1);
      }
      throw err;
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
