import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { appointments, availabilitySchedules, calendarIntegrations } from '../db/schema.js';
import { eq, and, desc, gte, lte, ne } from 'drizzle-orm';
import { getAvailableSlots, bookAppointment, cancelAppointment, rescheduleAppointment } from '../services/appointments.js';

interface AuthRequest extends Request {
  user?: { id: string; organizationId: string; role: string };
  body: any;
  params: any;
  query: any;
}

const router = Router();

// ─── Appointments CRUD ──────────────────────────────────────────────

// GET /api/appointments — list appointments
router.get('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { status, startDate, endDate, contactId, limit = '50', offset = '0' } = req.query;

    let query = db
      .select()
      .from(appointments)
      .where(eq(appointments.organizationId, organizationId))
      .orderBy(desc(appointments.startTime))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const results = await query;

    // Filter in JS for simplicity (could optimize with dynamic where clauses)
    let filtered = results;
    if (status) {
      filtered = filtered.filter(a => a.status === status);
    }
    if (startDate) {
      filtered = filtered.filter(a => new Date(a.startTime) >= new Date(startDate));
    }
    if (endDate) {
      filtered = filtered.filter(a => new Date(a.startTime) <= new Date(endDate));
    }
    if (contactId) {
      filtered = filtered.filter(a => a.contactId === contactId);
    }

    res.json({ appointments: filtered, total: filtered.length });
  } catch (error: any) {
    console.error('Error fetching appointments:', error.message);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/slots — get available time slots
router.get('/slots', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { scheduleId, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const slots = await getAvailableSlots(organizationId, scheduleId || null, startDate, endDate);
    res.json({ slots });
  } catch (error: any) {
    console.error('Error fetching available slots:', error.message);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// GET /api/appointments/:id — get single appointment
router.get('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [appointment] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, req.params.id), eq(appointments.organizationId, organizationId)))
      .limit(1);

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    res.json({ appointment });
  } catch (error: any) {
    console.error('Error fetching appointment:', error.message);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// POST /api/appointments — book a new appointment
router.post('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      title, description, startTime, endTime, timezone, durationMinutes,
      contactId, callId, agentId,
      contactName, contactPhone, contactEmail,
      locationType, locationDetails, notes,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: 'title, startTime, and endTime are required' });
    }

    const appointment = await bookAppointment({
      organizationId,
      contactId,
      callId,
      agentId,
      title,
      description,
      startTime,
      endTime,
      timezone,
      durationMinutes,
      contactName,
      contactPhone,
      contactEmail,
      locationType,
      locationDetails,
      notes,
    });

    res.status(201).json({ appointment });
  } catch (error: any) {
    if (error.message === 'Time slot is no longer available') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error booking appointment:', error.message);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// PUT /api/appointments/:id — update appointment details
router.put('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { title, description, status, contactName, contactPhone, contactEmail, locationType, locationDetails, notes } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (contactName !== undefined) updateData.contactName = contactName;
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (locationType !== undefined) updateData.locationType = locationType;
    if (locationDetails !== undefined) updateData.locationDetails = locationDetails;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(appointments)
      .set(updateData)
      .where(and(eq(appointments.id, req.params.id), eq(appointments.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Appointment not found' });

    res.json({ appointment: updated });
  } catch (error: any) {
    console.error('Error updating appointment:', error.message);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// POST /api/appointments/:id/cancel — cancel appointment
router.post('/:id/cancel', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const updated = await cancelAppointment(req.params.id, organizationId);
    if (!updated) return res.status(404).json({ error: 'Appointment not found' });

    res.json({ appointment: updated });
  } catch (error: any) {
    console.error('Error cancelling appointment:', error.message);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// POST /api/appointments/:id/reschedule — reschedule appointment
router.post('/:id/reschedule', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { startTime, endTime } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const newAppointment = await rescheduleAppointment(req.params.id, organizationId, startTime, endTime);
    res.json({ appointment: newAppointment });
  } catch (error: any) {
    if (error.message === 'Time slot is no longer available') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error rescheduling appointment:', error.message);
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
});

// ─── Availability Schedules ─────────────────────────────────────────

// GET /api/appointments/schedules — list availability schedules
router.get('/schedules/list', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const schedules = await db
      .select()
      .from(availabilitySchedules)
      .where(eq(availabilitySchedules.organizationId, organizationId))
      .orderBy(desc(availabilitySchedules.createdAt));

    res.json({ schedules });
  } catch (error: any) {
    console.error('Error fetching schedules:', error.message);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// POST /api/appointments/schedules — create availability schedule
router.post('/schedules', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, timezone, weeklyHours, slotDurationMinutes, bufferMinutes,
      minAdvanceHours, maxAdvanceDays, maxBookingsPerDay, dateOverrides, isDefault,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(availabilitySchedules)
        .set({ isDefault: false })
        .where(eq(availabilitySchedules.organizationId, organizationId));
    }

    const [schedule] = await db.insert(availabilitySchedules).values({
      organizationId,
      name,
      timezone: timezone || 'America/New_York',
      weeklyHours: weeklyHours || {
        monday: [{ start: '09:00', end: '17:00' }],
        tuesday: [{ start: '09:00', end: '17:00' }],
        wednesday: [{ start: '09:00', end: '17:00' }],
        thursday: [{ start: '09:00', end: '17:00' }],
        friday: [{ start: '09:00', end: '17:00' }],
      },
      slotDurationMinutes: slotDurationMinutes || 30,
      bufferMinutes: bufferMinutes || 15,
      minAdvanceHours: minAdvanceHours || 1,
      maxAdvanceDays: maxAdvanceDays || 30,
      maxBookingsPerDay: maxBookingsPerDay || 20,
      dateOverrides: dateOverrides || [],
      isDefault: isDefault || false,
    }).returning();

    res.status(201).json({ schedule });
  } catch (error: any) {
    console.error('Error creating schedule:', error.message);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/appointments/schedules/:id — update availability schedule
router.put('/schedules/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, timezone, weeklyHours, slotDurationMinutes, bufferMinutes,
      minAdvanceHours, maxAdvanceDays, maxBookingsPerDay, dateOverrides, isDefault, isActive,
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(availabilitySchedules)
        .set({ isDefault: false })
        .where(eq(availabilitySchedules.organizationId, organizationId));
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (weeklyHours !== undefined) updateData.weeklyHours = weeklyHours;
    if (slotDurationMinutes !== undefined) updateData.slotDurationMinutes = slotDurationMinutes;
    if (bufferMinutes !== undefined) updateData.bufferMinutes = bufferMinutes;
    if (minAdvanceHours !== undefined) updateData.minAdvanceHours = minAdvanceHours;
    if (maxAdvanceDays !== undefined) updateData.maxAdvanceDays = maxAdvanceDays;
    if (maxBookingsPerDay !== undefined) updateData.maxBookingsPerDay = maxBookingsPerDay;
    if (dateOverrides !== undefined) updateData.dateOverrides = dateOverrides;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(availabilitySchedules)
      .set(updateData)
      .where(and(eq(availabilitySchedules.id, req.params.id), eq(availabilitySchedules.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Schedule not found' });

    res.json({ schedule: updated });
  } catch (error: any) {
    console.error('Error updating schedule:', error.message);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/appointments/schedules/:id
router.delete('/schedules/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    // Soft delete by deactivating
    const [updated] = await db
      .update(availabilitySchedules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(availabilitySchedules.id, id), eq(availabilitySchedules.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Schedule not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting schedule:', error.message);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ─── Calendar Integrations ──────────────────────────────────────────

// GET /api/appointments/calendars — list calendar integrations
router.get('/calendars/list', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const calendars = await db
      .select({
        id: calendarIntegrations.id,
        provider: calendarIntegrations.provider,
        name: calendarIntegrations.name,
        calendarName: calendarIntegrations.calendarName,
        email: calendarIntegrations.email,
        syncEnabled: calendarIntegrations.syncEnabled,
        twoWaySync: calendarIntegrations.twoWaySync,
        lastSyncAt: calendarIntegrations.lastSyncAt,
        isActive: calendarIntegrations.isActive,
        createdAt: calendarIntegrations.createdAt,
      })
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.organizationId, organizationId))
      .orderBy(desc(calendarIntegrations.createdAt));

    res.json({ calendars });
  } catch (error: any) {
    console.error('Error fetching calendars:', error.message);
    res.status(500).json({ error: 'Failed to fetch calendar integrations' });
  }
});

// POST /api/appointments/calendars — add calendar integration (placeholder for OAuth flow)
router.post('/calendars', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { provider, name, calendarId, calendarName, email } = req.body;

    if (!provider || !name) {
      return res.status(400).json({ error: 'provider and name are required' });
    }

    const [calendar] = await db.insert(calendarIntegrations).values({
      organizationId,
      provider,
      name,
      calendarId: calendarId || null,
      calendarName: calendarName || null,
      email: email || null,
    }).returning();

    res.status(201).json({ calendar });
  } catch (error: any) {
    console.error('Error creating calendar integration:', error.message);
    res.status(500).json({ error: 'Failed to create calendar integration' });
  }
});

// DELETE /api/appointments/calendars/:id
router.delete('/calendars/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [updated] = await db
      .update(calendarIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(calendarIntegrations.id, req.params.id), eq(calendarIntegrations.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Calendar integration not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing calendar integration:', error.message);
    res.status(500).json({ error: 'Failed to remove calendar integration' });
  }
});

export default router;
