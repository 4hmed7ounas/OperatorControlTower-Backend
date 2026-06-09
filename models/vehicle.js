import mongoose from "mongoose";

const VehicleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // e.g., Sedan, SUV, EV, Truck
  status: {
    type: String,
    enum: ["available", "in_use", "maintenance"],
    default: "available",
  },
  totalUsageHours: { type: Number, default: 0 },
  lastMaintenanceDate: { type: Date, default: Date.now },
  maintenanceDueHours: { type: Number, default: 100 }, // threshold usage hours for maintenance
  location: { type: String, default: "Main Hub" },
  updatedAt: { type: Date, default: Date.now },
});

// Update the updatedAt timestamp before saving
VehicleSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Vehicle", VehicleSchema);
