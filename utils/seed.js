import Vehicle from "../models/vehicle.js";
import Booking from "../models/booking.js";
import Alert from "../models/alert.js";
import ActionLog from "../models/actionLog.js";
import User from "../models/user.js";

export async function seedDatabase() {
  // Clear existing collections
  await Vehicle.deleteMany({});
  await Booking.deleteMany({});
  await Alert.deleteMany({});
  await ActionLog.deleteMany({});
  await User.deleteMany({});

  const now = new Date();

  // Create active operator
  const operator = await User.create({
    name: "Alex Mercer",
    email: "alex.mercer@fleetcontrol.io",
    role: "operator",
  });

  // 1. Create Vehicles
  const vehicles = await Vehicle.create([
    {
      name: "Tesla Model S (EV-101)",
      type: "EV",
      status: "available",
      totalUsageHours: 40,
      maintenanceDueHours: 100,
      location: "San Francisco Hub",
      lastMaintenanceDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Tesla Model Y (EV-102)",
      type: "EV",
      status: "available",
      totalUsageHours: 98, // Close to maintenance target (100) -> adds risk
      maintenanceDueHours: 100,
      location: "San Francisco Hub",
      lastMaintenanceDate: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Ford Transit Cargo (VAN-201)",
      type: "Van",
      status: "in_use",
      totalUsageHours: 60,
      maintenanceDueHours: 120,
      location: "Oakland Airport Hub",
      lastMaintenanceDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Chevrolet Bolt (EV-103)",
      type: "EV",
      status: "available",
      totalUsageHours: 105, // OVER maint threshold (100) -> rules engine will trigger maintenance alert!
      maintenanceDueHours: 100,
      location: "San Jose Service Center",
      lastMaintenanceDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Toyota Prius (SDN-301)",
      type: "Sedan",
      status: "available",
      totalUsageHours: 15,
      maintenanceDueHours: 100,
      location: "San Francisco Hub",
      lastMaintenanceDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Rivian R1T (TRK-401)",
      type: "Truck",
      status: "available",
      totalUsageHours: 85,
      maintenanceDueHours: 100,
      location: "Oakland Airport Hub",
      lastMaintenanceDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
    }
  ]);

  const vehicleMap = {};
  vehicles.forEach(v => {
    vehicleMap[v.name.split(" ")[0]] = v;
  });

  // 2. Create Bookings
  // A. Ongoing active booking
  const b1 = await Booking.create({
    customerName: "John Doe Rentals Ltd",
    vehicleId: vehicleMap["Ford"]._id,
    startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Started yesterday
    endTime: new Date(now.getTime() + 48 * 60 * 60 * 1000),   // Ends day after tomorrow
    status: "ongoing",
    riskScore: 12,
  });

  // B. Late pickup booking (Started 3 hours ago, but still status "confirmed")
  const b2 = await Booking.create({
    customerName: "Jane Smith Logistics",
    vehicleId: vehicleMap["Tesla"]._id, // Assigned Model S
    startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
    endTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),   // 6 hours from now
    status: "confirmed",
    riskScore: 45, // Elevated risk
  });

  // C. Overdue return booking (Started yesterday, ended 2 hours ago, but status is "ongoing")
  const b3 = await Booking.create({
    customerName: "Alice Johnson",
    vehicleId: vehicleMap["Tesla"]._id, // Assigned Model S as well (simulate scheduling conflicts or double assign)
    startTime: new Date(now.getTime() - 30 * 60 * 60 * 1000), // 30 hours ago
    endTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),   // 2 hours ago
    status: "ongoing",
    riskScore: 85, // High risk
  });

  // D. Upcoming clean booking
  const b4 = await Booking.create({
    customerName: "Bob Miller",
    vehicleId: vehicleMap["Toyota"]._id,
    startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000), // In 2 days
    endTime: new Date(now.getTime() + 96 * 60 * 60 * 1000),   // In 4 days
    status: "confirmed",
    riskScore: 15,
  });

  // E. Upcoming high-risk booking (Assigned to EV-102 which is close to maintenance threshold)
  const b5 = await Booking.create({
    customerName: "Apex Courier Express",
    vehicleId: vehicles[1]._id, // Model Y (98 hours, threshold 100)
    startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // In 2 hours (last-minute booking!)
    endTime: new Date(now.getTime() + 74 * 60 * 60 * 1000),  // In 3 days (long duration!)
    status: "confirmed",
    riskScore: 75, // Very high risk calculated on save
  });

  // 3. Create initial Actions Log
  await ActionLog.create({
    actionType: "systemSeed",
    payload: { vehiclesCount: vehicles.length, bookingsCount: 5 },
    triggeredBy: "user",
    status: "success",
  });

  return {
    operator,
    vehiclesCount: vehicles.length,
    bookingsCount: 5,
  };
}
