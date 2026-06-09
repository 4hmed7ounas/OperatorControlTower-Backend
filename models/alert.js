import mongoose from "mongoose";

const AlertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "late_booking",
      "idle_vehicle",
      "maintenance_due",
      "high_risk_booking",
    ],
    required: true,
  },
  message: { type: String, required: true },
  severity: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
  relatedId: { type: String }, // Booking ID, Vehicle ID, etc. depending on context
  status: {
    type: String,
    enum: ["open", "resolved"],
    default: "open",
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Alert", AlertSchema);
