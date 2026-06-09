import mongoose from "mongoose";

const ActionLogSchema = new mongoose.Schema({
  actionType: { type: String, required: true },
  payload: { type: Object, default: {} },
  triggeredBy: {
    type: String,
    enum: ["ai", "user"],
    required: true,
  },
  status: {
    type: String,
    enum: ["success", "failed"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("ActionLog", ActionLogSchema);
