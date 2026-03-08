"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CalendarDays,
  Plus,
  Clock,
  Phone,
  Video,
  MapPin,
  Loader2,
  X,
  Settings2,
  RefreshCw,
  Check,
  Ban,
  User,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import { format, formatDistanceToNow, addDays, startOfWeek, endOfWeek, parseISO } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface Appointment {
  id: string
  organizationId: string
  contactId: string | null
  callId: string | null
  agentId: string | null
  title: string
  description: string | null
  status: string
  startTime: string
  endTime: string
  timezone: string
  durationMinutes: number
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  locationType: string | null
  locationDetails: string | null
  reminderSent: boolean
  confirmationSent: boolean
  notes: string | null
  metadata: any
  createdAt: string
  updatedAt: string
}

interface AvailabilitySchedule {
  id: string
  name: string
  isDefault: boolean
  timezone: string
  weeklyHours: Record<string, { start: string; end: string }[]>
  slotDurationMinutes: number
  bufferMinutes: number
  minAdvanceHours: number
  maxAdvanceDays: number
  maxBookingsPerDay: number
  dateOverrides: any[]
  isActive: boolean
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  confirmed: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
  no_show: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  rescheduled: "bg-purple-500/10 text-purple-600 border-purple-500/20",
}

const locationIcons: Record<string, any> = {
  phone: Phone,
  video: Video,
  in_person: MapPin,
}

export default function AppointmentsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  // Fetch appointments
  const { data: appointmentsData, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/appointments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  // Fetch schedules
  const { data: schedulesData } = useQuery({
    queryKey: ["availability-schedules"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/appointments/schedules/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const appointments: Appointment[] = appointmentsData?.appointments || []
  const schedules: AvailabilitySchedule[] = schedulesData?.schedules || []

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.post(`${API_URL}/appointments/${id}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast.success("Appointment cancelled")
      setSelectedAppointment(null)
    },
    onError: () => toast.error("Failed to cancel appointment"),
  })

  const upcomingCount = appointments.filter(a => ["scheduled", "confirmed"].includes(a.status) && new Date(a.startTime) > new Date()).length
  const todayCount = appointments.filter(a => {
    const d = new Date(a.startTime)
    const now = new Date()
    return d.toDateString() === now.toDateString() && ["scheduled", "confirmed"].includes(a.status)
  }).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">
            Manage bookings, availability schedules, and calendar integrations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsScheduleOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Availability
          </Button>
          <Button onClick={() => setIsBookingOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Book Appointment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{appointments.length}</div>
            <p className="text-xs text-muted-foreground">Total Appointments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{upcomingCount}</div>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{todayCount}</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{schedules.length}</div>
            <p className="text-xs text-muted-foreground">Schedules</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Appointments & Schedules */}
      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="schedules">Availability Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold">No appointments yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Book your first appointment or set up availability schedules.
                  </p>
                  <Button className="mt-4" onClick={() => setIsBookingOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Book Appointment
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((apt) => {
                      const LocationIcon = locationIcons[apt.locationType || "phone"] || Phone
                      return (
                        <TableRow
                          key={apt.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedAppointment(apt)}
                        >
                          <TableCell className="font-medium">{apt.title}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              {apt.contactName || apt.contactPhone || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(apt.startTime), "MMM d, yyyy")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(apt.startTime), "h:mm a")} – {format(new Date(apt.endTime), "h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell>{apt.durationMinutes} min</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm capitalize">
                              <LocationIcon className="h-3.5 w-3.5" />
                              {apt.locationType || "phone"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[apt.status] || ""}>
                              {apt.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <div className="space-y-4">
            {schedules.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Clock className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold">No availability schedules</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a schedule to define when appointments can be booked.
                  </p>
                  <Button className="mt-4" onClick={() => setIsScheduleOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Schedule
                  </Button>
                </CardContent>
              </Card>
            ) : (
              schedules.map((schedule) => (
                <Card key={schedule.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {schedule.name}
                          {schedule.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        </CardTitle>
                        <CardDescription>
                          {schedule.slotDurationMinutes} min slots • {schedule.bufferMinutes} min buffer • {schedule.timezone}
                        </CardDescription>
                      </div>
                      <Badge variant={schedule.isActive ? "default" : "secondary"}>
                        {schedule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS.map((day) => {
                        const hours = schedule.weeklyHours[day] || []
                        return (
                          <div key={day} className="text-center">
                            <p className="text-xs font-medium capitalize mb-1">{day.slice(0, 3)}</p>
                            {hours.length > 0 ? (
                              hours.map((h, i) => (
                                <p key={i} className="text-xs text-muted-foreground">
                                  {h.start}–{h.end}
                                </p>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground/50">Off</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Book Appointment Dialog */}
      <BookAppointmentDialog
        open={isBookingOpen}
        onOpenChange={setIsBookingOpen}
        token={token}
        onBooked={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] })
        }}
      />

      {/* Create Schedule Dialog */}
      <CreateScheduleDialog
        open={isScheduleOpen}
        onOpenChange={setIsScheduleOpen}
        token={token}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["availability-schedules"] })
        }}
      />

      {/* Appointment Detail Dialog */}
      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-lg">
          {selectedAppointment && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedAppointment.title}</DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedAppointment.startTime), "EEEE, MMMM d, yyyy")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Time</p>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedAppointment.startTime), "h:mm a")} – {format(new Date(selectedAppointment.endTime), "h:mm a")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Duration</p>
                    <p className="text-sm font-medium">{selectedAppointment.durationMinutes} minutes</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Contact</p>
                    <p className="text-sm font-medium">{selectedAppointment.contactName || "—"}</p>
                    {selectedAppointment.contactPhone && (
                      <p className="text-xs text-muted-foreground">{selectedAppointment.contactPhone}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Badge variant="outline" className={statusColors[selectedAppointment.status] || ""}>
                      {selectedAppointment.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                {selectedAppointment.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{selectedAppointment.description}</p>
                  </div>
                )}
                {selectedAppointment.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedAppointment.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                {["scheduled", "confirmed"].includes(selectedAppointment.status) && (
                  <Button
                    variant="destructive"
                    onClick={() => cancelMutation.mutate(selectedAppointment.id)}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                    Cancel Appointment
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Book Appointment Dialog ────────────────────────────────────────

function BookAppointmentDialog({ open, onOpenChange, token, onBooked }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  onBooked: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("09:00")
  const [duration, setDuration] = useState("30")
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [locationType, setLocationType] = useState("phone")
  const [locationDetails, setLocationDetails] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token || !title || !date || !startTime) return
    setSubmitting(true)
    try {
      const startISO = new Date(`${date}T${startTime}:00`).toISOString()
      const endISO = new Date(new Date(`${date}T${startTime}:00`).getTime() + parseInt(duration) * 60 * 1000).toISOString()

      await axios.post(`${API_URL}/appointments`, {
        title,
        description: description || undefined,
        startTime: startISO,
        endTime: endISO,
        durationMinutes: parseInt(duration),
        contactName: contactName || undefined,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        locationType,
        locationDetails: locationDetails || undefined,
        notes: notes || undefined,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })

      toast.success("Appointment booked!")
      onBooked()
      onOpenChange(false)
      // Reset
      setTitle(""); setDescription(""); setDate(""); setStartTime("09:00")
      setContactName(""); setContactPhone(""); setContactEmail("")
      setLocationDetails(""); setNotes("")
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to book appointment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
          <DialogDescription>Schedule a new appointment</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="e.g. Product Demo, Follow-up Call" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea placeholder="Brief description..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Meeting Type</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone Call</SelectItem>
                <SelectItem value="video">Video Call</SelectItem>
                <SelectItem value="in_person">In Person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {locationType !== "phone" && (
            <div className="space-y-2">
              <Label>{locationType === "video" ? "Meeting Link" : "Address"}</Label>
              <Input
                placeholder={locationType === "video" ? "https://zoom.us/j/..." : "123 Main St..."}
                value={locationDetails}
                onChange={e => setLocationDetails(e.target.value)}
              />
            </div>
          )}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Contact Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="John Doe" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input placeholder="+1 (555) 123-4567" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 mt-3">
              <Label>Email</Label>
              <Input placeholder="john@example.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !title || !date || !startTime}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
            Book Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Schedule Dialog ─────────────────────────────────────────

function CreateScheduleDialog({ open, onOpenChange, token, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  onCreated: () => void
}) {
  const [name, setName] = useState("Business Hours")
  const [timezone, setTimezone] = useState("America/New_York")
  const [slotDuration, setSlotDuration] = useState("30")
  const [bufferMinutes, setBufferMinutes] = useState("15")
  const [isDefault, setIsDefault] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [weeklyHours, setWeeklyHours] = useState<Record<string, { start: string; end: string }[]>>({
    monday: [{ start: "09:00", end: "17:00" }],
    tuesday: [{ start: "09:00", end: "17:00" }],
    wednesday: [{ start: "09:00", end: "17:00" }],
    thursday: [{ start: "09:00", end: "17:00" }],
    friday: [{ start: "09:00", end: "17:00" }],
    saturday: [],
    sunday: [],
  })

  const toggleDay = (day: string) => {
    setWeeklyHours(prev => ({
      ...prev,
      [day]: prev[day]?.length ? [] : [{ start: "09:00", end: "17:00" }],
    }))
  }

  const updateDayHours = (day: string, field: "start" | "end", value: string) => {
    setWeeklyHours(prev => ({
      ...prev,
      [day]: prev[day]?.map(h => ({ ...h, [field]: value })) || [{ start: "09:00", end: "17:00", [field]: value }],
    }))
  }

  const handleSubmit = async () => {
    if (!token || !name) return
    setSubmitting(true)
    try {
      await axios.post(`${API_URL}/appointments/schedules`, {
        name,
        timezone,
        weeklyHours,
        slotDurationMinutes: parseInt(slotDuration),
        bufferMinutes: parseInt(bufferMinutes),
        isDefault,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success("Schedule created!")
      onCreated()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create schedule")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Availability Schedule</DialogTitle>
          <DialogDescription>Define when appointments can be booked</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Schedule Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Slot Duration</Label>
              <Select value={slotDuration} onValueChange={setSlotDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buffer Between</Label>
              <Select value={bufferMinutes} onValueChange={setBufferMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No buffer</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Weekly Hours</Label>
            {DAYS.map(day => {
              const hours = weeklyHours[day] || []
              const isOn = hours.length > 0
              return (
                <div key={day} className="flex items-center gap-3">
                  <Switch checked={isOn} onCheckedChange={() => toggleDay(day)} />
                  <span className="w-20 text-sm capitalize font-medium">{day}</span>
                  {isOn ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        className="w-28 h-8 text-sm"
                        value={hours[0]?.start || "09:00"}
                        onChange={e => updateDayHours(day, "start", e.target.value)}
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        className="w-28 h-8 text-sm"
                        value={hours[0]?.end || "17:00"}
                        onChange={e => updateDayHours(day, "end", e.target.value)}
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unavailable</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Set as Default</Label>
              <p className="text-xs text-muted-foreground">Used when no specific schedule is selected</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
