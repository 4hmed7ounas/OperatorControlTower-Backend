import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: true,
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: {
    type: String,
    enum: ["confirmed", "ongoing", "completed", "late"],
    default: "confirmed",
  },
  riskScore: { type: Number, default: 0 }, // 0 to 100 representing risk of lateness or issues
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Booking", BookingSchema);
