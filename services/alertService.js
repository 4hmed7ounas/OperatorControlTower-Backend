import Alert from "../models/alert.js";

export async function getAllAlerts(query = {}) {
  return await Alert.find(query).sort({ createdAt: -1 });
}

export async function getAlertById(id) {
  return await Alert.findById(id);
}

export async function createAlert(data) {
  return await Alert.create(data);
}

export async function resolveAlert(id) {
  return await Alert.findByIdAndUpdate(
    id,
    { status: "resolved" },
    { new: true }
  );
}

export async function deleteAlert(id) {
  return await Alert.findByIdAndDelete(id);
}
