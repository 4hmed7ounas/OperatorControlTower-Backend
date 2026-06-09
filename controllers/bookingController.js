import * as bookingService from "../services/bookingService.js";

export async function getBookings(req, res) {
  try {
    const bookings = await bookingService.getAllBookings(req.query);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getBooking(req, res) {
  try {
    const booking = await bookingService.getBookingById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function createBooking(req, res) {
  try {
    const newBooking = await bookingService.createBooking(req.body);
    res.status(201).json(newBooking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateBooking(req, res) {
  try {
    const updated = await bookingService.updateBooking(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteBooking(req, res) {
  try {
    await bookingService.deleteBooking(req.params.id);
    res.json({ message: "Booking deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function markAsLate(req, res) {
  try {
    const updated = await bookingService.markBookingAsLate(req.params.id, "user");
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function reassign(req, res) {
  try {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ error: "vehicleId is required" });
    const updated = await bookingService.reassignVehicle(req.params.id, vehicleId, "user");
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
