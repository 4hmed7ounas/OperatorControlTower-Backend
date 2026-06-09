import express from "express";
import { evaluateRules } from "../engine/rulesEngine.js";
import { seedDatabase } from "../utils/seed.js";
import { getAllActionLogs } from "../services/actionLogService.js";

const router = express.Router();

router.post("/seed", async (req, res) => {
  try {
    const result = await seedDatabase();
    res.json({ message: "Database seeded successfully", data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/evaluate", async (req, res) => {
  try {
    const summary = await evaluateRules();
    res.json({ message: "Rules engine evaluation finished", summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/action-logs", async (req, res) => {
  try {
    const logs = await getAllActionLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
