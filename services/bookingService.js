import Booking from "../models/booking.js";
import Vehicle from "../models/vehicle.js";
import Alert from "../models/alert.js";
import ActionLog from "../models/actionLog.js";

/**
 * Calculates a mock risk score for a booking based on operational metrics.
 */
function calculateRiskScore(booking, vehicle) {
  let riskScore = 10; // base risk

  if (!vehicle) return riskScore;

  // Duration risk (longer rentals have slightly higher risk)
  const durationMs = new Date(booking.endTime) - new Date(booking.startTime);
  const durationHours = durationMs / (1000 * 60 * 60);
  if (durationHours > 72) {
    riskScore += 20; // +20 risk for >3 days
  } else if (durationHours > 24) {
    riskScore += 10;
  }

  // Vehicle wear risk (vehicles close to maintenance threshold add risk)
  const usageBuffer = vehicle.maintenanceDueHours - vehicle.totalUsageHours;
  if (usageBuffer <= 10) {
    riskScore += 30; // +30 risk if vehicle is close to maintenance due
  } else if (usageBuffer <= 30) {
    riskScore += 15;
  }

  // High demand buffer risk (if booking starts very soon)
  const leadTimeMs = new Date(booking.startTime) - new Date();
  const leadTimeHours = leadTimeMs / (1000 * 60 * 60);
  if (leadTimeHours < 4 && leadTimeHours > 0) {
    riskScore += 25; // +25 for last-minute booking
  }

  // Ensure risk score is between 0 and 100
  return Math.min(Math.max(riskScore, 0), 100);
}

export async function getAllBookings(query = {}) {
  return await Booking.find(query).populate("vehicleId").sort({ startTime: 1 });
}

export async function getBookingById(id) {
  return await Booking.findById(id).populate("vehicleId");
}

export async function createBooking(data) {
  const vehicle = await Vehicle.findById(data.vehicleId);
  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  if (vehicle.status === "maintenance") {
    throw new Error("Vehicle is currently in maintenance and cannot be booked");
  }

  const booking = new Booking(data);
  booking.riskScore = calculateRiskScore(booking, vehicle);
  await booking.save();

  // If the booking is starting now, we might set vehicle status to 'in_use'
  const now = new Date();
  if (booking.startTime <= now && booking.endTime >= now) {
    booking.status = "ongoing";
    await booking.save();
    vehicle.status = "in_use";
    await vehicle.save();
  }

  // Generate alert if risk is very high
  if (booking.riskScore >= 70) {
    await Alert.create({
      type: "high_risk_booking",
      message: `Booking for ${booking.customerName} on vehicle "${vehicle.name}" has been flagged as high-risk (${booking.riskScore}%).`,
      severity: "high",
      relatedId: booking._id.toString(),
      status: "open",
    });
  }

  return await booking.populate("vehicleId");
}

export async function updateBooking(id, data) {
  const booking = await Booking.findById(id);
  if (!booking) throw new Error("Booking not found");

  // Re-calculate risk score if start/end times or vehicle changed
  let vehicle = null;
  if (data.vehicleId || data.startTime || data.endTime) {
    const vehicleId = data.vehicleId || booking.vehicleId;
    vehicle = await Vehicle.findById(vehicleId);
    if (vehicle) {
      const tempBooking = {
        startTime: data.startTime || booking.startTime,
        endTime: data.endTime || booking.endTime,
      };
      booking.riskScore = calculateRiskScore(tempBooking, vehicle);
    }
  }

  // Update fields
  Object.assign(booking, data);
  await booking.save();

  // Manage vehicle statuses if booking status changes
  if (data.status) {
    const activeVehicle = vehicle || await Vehicle.findById(booking.vehicleId);
    if (activeVehicle) {
      if (data.status === "ongoing") {
        activeVehicle.status = "in_use";
        await activeVehicle.save();
      } else if (data.status === "completed") {
        activeVehicle.status = "available";
        // Simulate usage accumulation
        const durationHours = (new Date(booking.endTime) - new Date(booking.startTime)) / (1000 * 60 * 60);
        activeVehicle.totalUsageHours += Math.max(Math.round(durationHours), 1);
        await activeVehicle.save();

        // Resolve any open late alerts
        await Alert.updateMany(
          { type: "late_booking", relatedId: booking._id.toString(), status: "open" },
          { status: "resolved" }
        );
      }
    }
  }

  return await booking.populate("vehicleId");
}

export async function deleteBooking(id) {
  return await Booking.findByIdAndDelete(id);
}

/**
 * Marks a booking as late (tool action).
 */
export async function markBookingAsLate(bookingId, triggeredBy = "user") {
  const booking = await Booking.findById(bookingId).populate("vehicleId");
  if (!booking) {
    throw new Error(`Booking with ID ${bookingId} not found`);
  }

  booking.status = "late";
  await booking.save();

  const vehicleName = booking.vehicleId ? booking.vehicleId.name : "Unknown Vehicle";

  // Create alert
  const message = `Booking for ${booking.customerName} on vehicle "${vehicleName}" is marked LATE.`;
  let existingAlert = await Alert.findOne({
    type: "late_booking",
    relatedId: bookingId,
    status: "open",
  });

  if (!existingAlert) {
    await Alert.create({
      type: "late_booking",
      message,
      severity: "medium",
      relatedId: bookingId,
      status: "open",
    });
  }

  // Log the action
  await ActionLog.create({
    actionType: "markBookingAsLate",
    payload: { bookingId, customerName: booking.customerName, vehicleName },
    triggeredBy,
    status: "success",
  });

  return booking;
}

/**
 * Reassigns a booking to a different vehicle (tool action).
 */
export async function reassignVehicle(bookingId, newVehicleId, triggeredBy = "user") {
  const booking = await Booking.findById(bookingId).populate("vehicleId");
  if (!booking) {
    throw new Error(`Booking with ID ${bookingId} not found`);
  }

  const newVehicle = await Vehicle.findById(newVehicleId);
  if (!newVehicle) {
    throw new Error(`Target vehicle with ID ${newVehicleId} not found`);
  }

  if (newVehicle.status === "maintenance") {
    throw new Error(`Target vehicle "${newVehicle.name}" is in maintenance and cannot be assigned`);
  }

  const oldVehicleId = booking.vehicleId ? booking.vehicleId._id : null;
  const oldVehicleName = booking.vehicleId ? booking.vehicleId.name : "None";

  // Perform assignment
  booking.vehicleId = newVehicleId;
  // Re-calculate risk score
  booking.riskScore = calculateRiskScore(booking, newVehicle);
  await booking.save();

  // If booking is active, update statuses of vehicles
  if (booking.status === "ongoing") {
    if (oldVehicleId) {
      await Vehicle.findByIdAndUpdate(oldVehicleId, { status: "available" });
    }
    newVehicle.status = "in_use";
    await newVehicle.save();
  }

  // Log the action
  await ActionLog.create({
    actionType: "reassignVehicle",
    payload: {
      bookingId,
      customerName: booking.customerName,
      oldVehicleId,
      oldVehicleName,
      newVehicleId,
      newVehicleName: newVehicle.name,
    },
    triggeredBy,
    status: "success",
  });

  return await booking.populate("vehicleId");
}

/**
 * Fetches bookings flagged as risky (tool action).
 */
export async function getRiskyBookings() {
  const bookings = await Booking.find({ riskScore: { $gte: 50 }, status: { $ne: "completed" } })
    .populate("vehicleId")
    .sort({ riskScore: -1 });

  return bookings;
}
