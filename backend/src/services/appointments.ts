import { db } from '../db/index.js';
import { appointments, availabilitySchedules, calendarIntegrations } from '../db/schema.js';
import { eq, and, gte, lte, ne, or } from 'drizzle-orm';

interface TimeSlot {
  start: string; // ISO string
  end: string;
}

interface WeeklyHours {
  [day: string]: { start: string; end: string }[]; // e.g. { monday: [{ start: "09:00", end: "17:00" }] }
}

interface DateOverride {
  date: string; // YYYY-MM-DD
  available: boolean;
  hours?: { start: string; end: string }[];
}

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Get available time slots for a given date range based on the org's availability schedule.
 * Excludes already-booked slots and respects buffer times.
 */
export async function getAvailableSlots(
  organizationId: string,
  scheduleId: string | null,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): Promise<Record<string, TimeSlot[]>> {
  // Get schedule (use default if no ID given)
  let schedule;
  if (scheduleId) {
    const [s] = await db
      .select()
      .from(availabilitySchedules)
      .where(and(eq(availabilitySchedules.id, scheduleId), eq(availabilitySchedules.organizationId, organizationId)))
      .limit(1);
    schedule = s;
  } else {
    const [s] = await db
      .select()
      .from(availabilitySchedules)
      .where(and(eq(availabilitySchedules.organizationId, organizationId), eq(availabilitySchedules.isDefault, true)))
      .limit(1);
    schedule = s;
  }

  if (!schedule) {
    return {};
  }

  const weeklyHours = (schedule.weeklyHours as WeeklyHours) || {};
  const dateOverrides = (schedule.dateOverrides as DateOverride[]) || [];
  const slotDuration = schedule.slotDurationMinutes;
  const buffer = schedule.bufferMinutes || 0;
  const minAdvanceMs = (schedule.minAdvanceHours || 1) * 60 * 60 * 1000;
  const now = new Date();

  // Get existing appointments in the range
  const rangeStart = new Date(startDate + 'T00:00:00');
  const rangeEnd = new Date(endDate + 'T23:59:59');

  const existingAppointments = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.organizationId, organizationId),
      gte(appointments.startTime, rangeStart),
      lte(appointments.startTime, rangeEnd),
      ne(appointments.status, 'cancelled'),
    ));

  const result: Record<string, TimeSlot[]> = {};

  // Iterate through each day in the range
  const current = new Date(rangeStart);
  while (current <= rangeEnd) {
    const dateStr = current.toISOString().split('T')[0];
    const dayName = DAYS_OF_WEEK[current.getDay()];

    // Check date overrides first
    const override = dateOverrides.find(o => o.date === dateStr);

    let dayHours: { start: string; end: string }[] = [];
    if (override) {
      if (!override.available) {
        // Day is blocked
        current.setDate(current.getDate() + 1);
        continue;
      }
      dayHours = override.hours || [];
    } else {
      dayHours = weeklyHours[dayName] || [];
    }

    if (dayHours.length === 0) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const slots: TimeSlot[] = [];

    for (const window of dayHours) {
      const [startH, startM] = window.start.split(':').map(Number);
      const [endH, endM] = window.end.split(':').map(Number);

      const windowStart = new Date(current);
      windowStart.setHours(startH, startM, 0, 0);

      const windowEnd = new Date(current);
      windowEnd.setHours(endH, endM, 0, 0);

      let slotStart = new Date(windowStart);
      while (slotStart.getTime() + slotDuration * 60 * 1000 <= windowEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

        // Check min advance time
        if (slotStart.getTime() < now.getTime() + minAdvanceMs) {
          slotStart = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
          continue;
        }

        // Check if slot conflicts with existing appointments (including buffer)
        const conflicting = existingAppointments.some(apt => {
          const aptStart = new Date(apt.startTime).getTime() - buffer * 60 * 1000;
          const aptEnd = new Date(apt.endTime).getTime() + buffer * 60 * 1000;
          return slotStart.getTime() < aptEnd && slotEnd.getTime() > aptStart;
        });

        if (!conflicting) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }

        slotStart = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
      }
    }

    if (slots.length > 0) {
      // Respect max bookings per day
      const dayAppointments = existingAppointments.filter(apt => {
        const aptDate = new Date(apt.startTime).toISOString().split('T')[0];
        return aptDate === dateStr;
      });
      if (dayAppointments.length < (schedule.maxBookingsPerDay || 20)) {
        result[dateStr] = slots;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Book an appointment after verifying the slot is still available.
 */
export async function bookAppointment(params: {
  organizationId: string;
  contactId?: string;
  callId?: string;
  agentId?: string;
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime: string;
  timezone?: string;
  durationMinutes?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  locationType?: string;
  locationDetails?: string;
  notes?: string;
}) {
  const start = new Date(params.startTime);
  const end = new Date(params.endTime);

  // Check for conflicts
  const conflicts = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.organizationId, params.organizationId),
      ne(appointments.status, 'cancelled'),
      or(
        // Overlapping: new start is before existing end AND new end is after existing start
        and(lte(appointments.startTime, end), gte(appointments.endTime, start)),
      ),
    ));

  if (conflicts.length > 0) {
    throw new Error('Time slot is no longer available');
  }

  const [appointment] = await db.insert(appointments).values({
    organizationId: params.organizationId,
    contactId: params.contactId || null,
    callId: params.callId || null,
    agentId: params.agentId || null,
    title: params.title,
    description: params.description || '',
    startTime: start,
    endTime: end,
    timezone: params.timezone || 'America/New_York',
    durationMinutes: params.durationMinutes || 30,
    contactName: params.contactName || null,
    contactPhone: params.contactPhone || null,
    contactEmail: params.contactEmail || null,
    locationType: params.locationType || 'phone',
    locationDetails: params.locationDetails || null,
    notes: params.notes || null,
  }).returning();

  return appointment;
}

/**
 * Cancel an appointment.
 */
export async function cancelAppointment(appointmentId: string, organizationId: string) {
  const [updated] = await db
    .update(appointments)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)))
    .returning();

  return updated;
}

/**
 * Reschedule an appointment to a new time.
 */
export async function rescheduleAppointment(
  appointmentId: string,
  organizationId: string,
  newStartTime: string,
  newEndTime: string,
) {
  // Cancel old
  await db
    .update(appointments)
    .set({ status: 'rescheduled', updatedAt: new Date() })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)));

  // Get original for cloning
  const [original] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!original) throw new Error('Appointment not found');

  // Book new slot
  return bookAppointment({
    organizationId,
    contactId: original.contactId || undefined,
    callId: original.callId || undefined,
    agentId: original.agentId || undefined,
    title: original.title,
    description: original.description || undefined,
    startTime: newStartTime,
    endTime: newEndTime,
    timezone: original.timezone,
    durationMinutes: original.durationMinutes,
    contactName: original.contactName || undefined,
    contactPhone: original.contactPhone || undefined,
    contactEmail: original.contactEmail || undefined,
    locationType: original.locationType || undefined,
    locationDetails: original.locationDetails || undefined,
    notes: original.notes || undefined,
  });
}
