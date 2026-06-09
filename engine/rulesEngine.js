import Vehicle from "../models/vehicle.js";
import Booking from "../models/booking.js";
import Alert from "../models/alert.js";

/**
 * Runs the operational rules engine to scan for issues and generate alerts.
 * This can be run on request or set up on a cron/interval.
 */
export async function evaluateRules() {
  const now = new Date();
  const summary = {
    lateBookingsCreated: 0,
    maintenanceDueCreated: 0,
    idleVehiclesCreated: 0,
    resolvedAlerts: 0,
  };

  // 1. RULE: Maintenance Due Check
  // Check vehicles whose usage hours have reached or exceeded the maintenance threshold
  const vehiclesForMaintenance = await Vehicle.find({
    status: { $ne: "maintenance" },
    $expr: { $gte: ["$totalUsageHours", "$maintenanceDueHours"] },
  });

  for (const vehicle of vehiclesForMaintenance) {
    // Check if an open maintenance alert already exists
    const existingAlert = await Alert.findOne({
      type: "maintenance_due",
      relatedId: vehicle._id.toString(),
      status: "open",
    });

    if (!existingAlert) {
      await Alert.create({
        type: "maintenance_due",
        message: `Vehicle "${vehicle.name}" requires maintenance. Usage (${vehicle.totalUsageHours}h) exceeds the threshold (${vehicle.maintenanceDueHours}h).`,
        severity: "high",
        relatedId: vehicle._id.toString(),
        status: "open",
      });
      summary.maintenanceDueCreated++;
    }
  }

  // 2. RULE: Late Bookings (Not started)
  // Booking start time has passed, but status is still "confirmed"
  const lateToStartBookings = await Booking.find({
    status: "confirmed",
    startTime: { $lt: now },
  });

  for (const booking of lateToStartBookings) {
    // Check if open alert exists
    const existingAlert = await Alert.findOne({
      type: "late_booking",
      relatedId: booking._id.toString(),
      status: "open",
    });

    if (!existingAlert) {
      await Alert.create({
        type: "late_booking",
        message: `Booking for ${booking.customerName} was scheduled to start at ${booking.startTime.toLocaleString()} but vehicle has not been picked up.`,
        severity: "medium",
        relatedId: booking._id.toString(),
        status: "open",
      });

      // Update booking status to "late"
      booking.status = "late";
      await booking.save();
      summary.lateBookingsCreated++;
    }
  }

  // 3. RULE: Overdue Returns (Ongoing bookings past end time)
  // Booking status is "ongoing" (or "late" if it was picked up late but is now past end), but end time has passed
  const overdueBookings = await Booking.find({
    status: { $in: ["ongoing", "late"] },
    endTime: { $lt: now },
  });

  for (const booking of overdueBookings) {
    const existingAlert = await Alert.findOne({
      type: "late_booking",
      message: { $regex: "overdue", $options: "i" },
      relatedId: booking._id.toString(),
      status: "open",
    });

    if (!existingAlert) {
      await Alert.create({
        type: "late_booking",
        message: `Booking for ${booking.customerName} is overdue. Scheduled return was ${booking.endTime.toLocaleString()}.`,
        severity: "high",
        relatedId: booking._id.toString(),
        status: "open",
      });

      // Update booking status to "late" if not already
      if (booking.status !== "late") {
        booking.status = "late";
        await booking.save();
      }
      summary.lateBookingsCreated++;
    }
  }

  // 4. RULE: Idle Vehicles
  // Vehicle has status "available" and has had no active bookings in the last 48 hours
  const activeVehicles = await Vehicle.find({ status: "available" });
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  for (const vehicle of activeVehicles) {
    // Find any bookings for this vehicle that ended after fortyEightHoursAgo
    const recentBookings = await Booking.findOne({
      vehicleId: vehicle._id,
      $or: [
        { endTime: { $gte: fortyEightHoursAgo } },
        { startTime: { $gte: fortyEightHoursAgo } },
      ],
    });

    // If no recent bookings and it is available, it might be idle in a high-demand period
    if (!recentBookings) {
      const existingAlert = await Alert.findOne({
        type: "idle_vehicle",
        relatedId: vehicle._id.toString(),
        status: "open",
      });

      if (!existingAlert) {
        await Alert.create({
          type: "idle_vehicle",
          message: `Vehicle "${vehicle.name}" has been available with no booking activity for over 48 hours.`,
          severity: "low",
          relatedId: vehicle._id.toString(),
          status: "open",
        });
        summary.idleVehiclesCreated++;
      }
    }
  }

  // 5. RULE: Auto-Resolve Alerts
  // If a vehicle gets serviced (totalUsageHours reset or set status maintenance), auto-resolve maintenance alerts
  const resolvedAlerts = [];
  const openMaintenanceAlerts = await Alert.find({
    type: "maintenance_due",
    status: "open",
  });

  for (const alert of openMaintenanceAlerts) {
    const vehicle = await Vehicle.findById(alert.relatedId);
    if (vehicle && (vehicle.status === "maintenance" || vehicle.totalUsageHours < vehicle.maintenanceDueHours)) {
      alert.status = "resolved";
      await alert.save();
      summary.resolvedAlerts++;
    }
  }

  // Auto-resolve late booking alerts if booking is completed or status returns to normal
  const openLateAlerts = await Alert.find({
    type: "late_booking",
    status: "open",
  });

  for (const alert of openLateAlerts) {
    const booking = await Booking.findById(alert.relatedId);
    if (booking && booking.status === "completed") {
      alert.status = "resolved";
      await alert.save();
      summary.resolvedAlerts++;
    }
  }

  return summary;
}
