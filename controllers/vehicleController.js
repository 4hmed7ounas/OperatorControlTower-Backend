import * as vehicleService from "../services/vehicleService.js";

export async function getVehicles(req, res) {
  try {
    const vehicles = await vehicleService.getAllVehicles(req.query);
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getVehicle(req, res) {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function createVehicle(req, res) {
  try {
    const newVehicle = await vehicleService.createVehicle(req.body);
    res.status(201).json(newVehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateVehicle(req, res) {
  try {
    const updated = await vehicleService.updateVehicle(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteVehicle(req, res) {
  try {
    await vehicleService.deleteVehicle(req.params.id);
    res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function scheduleMaint(req, res) {
  try {
    const updated = await vehicleService.scheduleMaintenance(req.params.id, "user");
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function completeMaint(req, res) {
  try {
    const { totalUsageHoursReset } = req.body;
    const updated = await vehicleService.completeMaintenance(req.params.id, totalUsageHoursReset || 0);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
