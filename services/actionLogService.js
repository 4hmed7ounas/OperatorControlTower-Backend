import ActionLog from "../models/actionLog.js";

export async function getAllActionLogs(query = {}) {
  return await ActionLog.find(query).sort({ createdAt: -1 });
}

export async function createActionLog(data) {
  return await ActionLog.create(data);
}
