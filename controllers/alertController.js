import * as alertService from "../services/alertService.js";

export async function getAlerts(req, res) {
  try {
    const alerts = await alertService.getAllAlerts(req.query);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getAlert(req, res) {
  try {
    const alert = await alertService.getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function resolveAlert(req, res) {
  try {
    const resolved = await alertService.resolveAlert(req.params.id);
    res.json(resolved);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
