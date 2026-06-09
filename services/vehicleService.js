import Vehicle from "../models/vehicle.js";
import Alert from "../models/alert.js";
import ActionLog from "../models/actionLog.js";

export async function getAllVehicles(query = {}) {
  return await Vehicle.find(query).sort({ name: 1 });
}

export async function getVehicleById(id) {
  return await Vehicle.findById(id);
}

export async function createVehicle(data) {
  return await Vehicle.create(data);
}

export async function updateVehicle(id, data) {
  return await Vehicle.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

export async function deleteVehicle(id) {
  return await Vehicle.findByIdAndDelete(id);
}

/**
 * Schedules maintenance for a vehicle (tool action).
 * Changes status to 'maintenance' and resolves active maintenance alerts.
 */
export async function scheduleMaintenance(vehicleId, triggeredBy = "user") {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw new Error(`Vehicle with ID ${vehicleId} not found`);
  }

  vehicle.status = "maintenance";
  await vehicle.save();

  // Resolve any open maintenance alerts for this vehicle
  await Alert.updateMany(
    { type: "maintenance_due", relatedId: vehicleId, status: "open" },
    { status: "resolved" }
  );

  // Log the action
  await ActionLog.create({
    actionType: "scheduleMaintenance",
    payload: { vehicleId, vehicleName: vehicle.name },
    triggeredBy,
    status: "success",
  });

  return vehicle;
}

/**
 * Completes maintenance for a vehicle.
 * Resets totalUsageHours (or sets next maintenance target) and changes status to 'available'.
 */
export async function completeMaintenance(vehicleId, totalUsageHoursReset = 0) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw new Error(`Vehicle with ID ${vehicleId} not found`);
  }

  vehicle.status = "available";
  vehicle.totalUsageHours = totalUsageHoursReset; // Reset usage hours
  vehicle.lastMaintenanceDate = new Date();
  // Set next maintenance due target
  vehicle.maintenanceDueHours = vehicle.totalUsageHours + 100;
  await vehicle.save();

  return vehicle;
}
