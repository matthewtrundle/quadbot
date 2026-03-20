'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Send,
  Megaphone,
  Clock,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalendarEvent = {
  id: string;
  title: string;
  type: 'content' | 'brief' | 'publish_action' | 'campaign' | 'scheduled';
  status: string;
  date: string;
  scheduledFor?: string;
};

type CalendarApiResponse = {
  events: CalendarEvent[];
  month: string;
  startDate: string;
  endDate: string;
};

type ViewMode = 'calendar' | 'timeline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<CalendarEvent['type'], string> = {
  content: 'bg-blue-500',
  brief: 'bg-purple-500',
  publish_action: 'bg-green-500',
  campaign: 'bg-orange-500',
  scheduled: 'bg-amber-500',
};

const EVENT_BADGE_COLORS: Record<CalendarEvent['type'], string> = {
  content: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  brief: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  publish_action: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  campaign: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const EVENT_LABELS: Record<CalendarEvent['type'], string> = {
  content: 'Content',
  brief: 'Brief',
  publish_action: 'Publish',
  campaign: 'Campaign',
  scheduled: 'Scheduled',
};

const EVENT_ICONS: Record<CalendarEvent['type'], typeof FileText> = {
  content: FileText,
  brief: FileText,
  publish_action: Send,
  campaign: Megaphone,
  scheduled: Clock,
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateHeading(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Get the Monday on or before a given date */
function getMonday(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  // Sunday=0, need to go back 6; Mon=1 go back 0; etc.
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return result;
}

/** Build an array of dates covering the month grid (Mon-Sun rows) */
function buildCalendarGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const start = getMonday(firstOfMonth);
  // Find the Sunday on or after the last day of month
  const lastDay = lastOfMonth.getDay(); // 0=Sun
  const end = new Date(lastOfMonth);
  if (lastDay !== 0) {
    end.setDate(end.getDate() + (7 - lastDay));
  }

  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Group events by date key */
function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = toDateKey(new Date(event.date));
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return map;
}

/** Group events by formatted date heading for the timeline view */
function groupByDateHeading(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = formatDateHeading(event.date);
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      {/* Day names row */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      {/* Grid cells */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Calendar className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm">No content events yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        Content briefs, generated articles, publish actions, and campaigns will appear here.
      </p>
    </div>
  );
}

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`
        w-full text-left text-[11px] leading-tight font-medium text-white rounded px-1.5 py-0.5 truncate
        ${EVENT_COLORS[event.type]}
        hover:opacity-80 transition-opacity cursor-pointer
      `}
      title={event.title}
    >
      {event.title}
    </button>
  );
}

function DayDetailPanel({
  date,
  events,
  onClose,
  onSchedule,
}: {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onSchedule: (event: CalendarEvent, date: Date) => void;
}) {
  const heading = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card className="border-l-2 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{heading}</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No events on this day</p>
        ) : (
          events.map((event) => {
            const Icon = EVENT_ICONS[event.type];
            return (
              <div key={event.id} className="flex items-center gap-3 rounded-md border p-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${EVENT_BADGE_COLORS[event.type]} border-0 text-xs`}>
                      {EVENT_LABELS[event.type]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {event.status}
                    </Badge>
                  </div>
                </div>
                {(event.status === 'draft' || event.type === 'content') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => onSchedule(event, date)}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Schedule
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleModal({
  event,
  initialDate,
  brandId,
  onClose,
  onScheduled,
}: {
  event: CalendarEvent;
  initialDate: Date;
  brandId: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [dateValue, setDateValue] = useState(toDateKey(initialDate));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSchedule() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/content-calendar/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId: event.id.replace(/-created$/, ''),
          scheduledPublishAt: new Date(dateValue + 'T09:00:00').toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to schedule');
      }
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Schedule Content</CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Content</p>
            <p className="text-sm text-muted-foreground truncate">{event.title}</p>
          </div>
          <div>
            <label htmlFor="schedule-date" className="text-sm font-medium block mb-1">
              Publish Date
            </label>
            <Input id="schedule-date" type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={submitting}>
              {submitting ? 'Scheduling...' : 'Schedule'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineView({
  events,
  onSchedule,
}: {
  events: CalendarEvent[];
  onSchedule: (event: CalendarEvent, date: Date) => void;
}) {
  const grouped = groupByDateHeading(events);

  if (events.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
        <Card key={dateLabel}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{dateLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayEvents.map((event) => {
              const Icon = EVENT_ICONS[event.type];
              return (
                <div key={event.id} className="flex items-center gap-3 rounded-md border p-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium truncate">{event.title}</span>
                  <Badge className={`${EVENT_BADGE_COLORS[event.type]} border-0 text-xs`}>
                    {EVENT_LABELS[event.type]}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {event.status}
                  </Badge>
                  {(event.status === 'draft' || event.type === 'content') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => onSchedule(event, new Date(event.date))}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Schedule
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ContentCalendarPage() {
  const params = useParams();
  const brandId = params.id as string;

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{
    event: CalendarEvent;
    date: Date;
  } | null>(null);

  // Auto-switch to timeline on small screens
  useEffect(() => {
    function checkWidth() {
      if (window.innerWidth < 768) {
        setView('timeline');
      }
    }
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthParam = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/brands/${brandId}/content-calendar?month=${monthParam}`);
      if (res.ok) {
        const data: CalendarApiResponse = await res.json();
        setEvents(data.events ?? (data as unknown as CalendarEvent[]));
      }
    } finally {
      setLoading(false);
    }
  }, [brandId, year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Calendar grid data
  const gridDates = useMemo(() => buildCalendarGrid(year, month), [year, month]);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todayKey = toDateKey(today);

  // Navigation
  function goToPrevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
    setSelectedEvent(null);
  }

  function goToNextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
    setSelectedEvent(null);
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(null);
    setSelectedEvent(null);
  }

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setSelectedEvent(null);
  }

  function handleEventClick(event: CalendarEvent) {
    setSelectedEvent(event);
    setSelectedDate(new Date(event.date));
  }

  function handleSchedule(event: CalendarEvent, date: Date) {
    setScheduleTarget({ event, date });
  }

  function handleScheduled() {
    setScheduleTarget(null);
    fetchEvents();
  }

  // Events for the selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const key = toDateKey(selectedDate);
    return eventsByDate.get(key) ?? [];
  }, [selectedDate, eventsByDate]);

  // Weeks for the grid
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < gridDates.length; i += 7) {
      result.push(gridDates.slice(i, i + 7));
    }
    return result;
  }, [gridDates]);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* Header Bar                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Content Calendar</h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="inline-flex items-center rounded-lg border bg-card p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={`
                inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                ${view === 'calendar' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
            <button
              onClick={() => setView('timeline')}
              className={`
                inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                ${view === 'timeline' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Timeline</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Month navigation                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold min-w-[180px] text-center">{formatMonthYear(year, month)}</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Loading skeleton                                                 */}
      {/* ---------------------------------------------------------------- */}
      {loading && <CalendarSkeleton />}

      {/* ---------------------------------------------------------------- */}
      {/* Calendar View                                                    */}
      {/* ---------------------------------------------------------------- */}
      {!loading && view === 'calendar' && (
        <div className="flex gap-4">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            {/* Day name headers */}
            <div className="grid grid-cols-7 gap-px mb-px">
              {DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="border rounded-lg overflow-hidden bg-border">
              <div className="grid grid-cols-7 gap-px">
                {weeks.flat().map((date) => {
                  const key = toDateKey(date);
                  const isCurrentMonth = date.getMonth() === month;
                  const isToday = key === todayKey;
                  const isSelected = selectedDate ? key === toDateKey(selectedDate) : false;
                  const dayEvents = eventsByDate.get(key) ?? [];

                  return (
                    <button
                      key={key}
                      onClick={() => handleDayClick(date)}
                      className={`
                        bg-card text-left p-1.5 min-h-[100px] flex flex-col transition-colors relative
                        hover:bg-accent/50 cursor-pointer
                        ${!isCurrentMonth ? 'opacity-40' : ''}
                        ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                        ${isToday ? 'bg-primary/5' : ''}
                      `}
                    >
                      {/* Day number */}
                      <span
                        className={`
                          text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-primary text-primary-foreground' : ''}
                        `}
                      >
                        {date.getDate()}
                      </span>

                      {/* Event pills */}
                      <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <EventPill key={event.id} event={event} onClick={() => handleEventClick(event)} />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day detail panel */}
          {selectedDate && (
            <div className="w-80 shrink-0 hidden lg:block">
              <DayDetailPanel
                date={selectedDate}
                events={selectedDateEvents}
                onClose={() => {
                  setSelectedDate(null);
                  setSelectedEvent(null);
                }}
                onSchedule={handleSchedule}
              />
            </div>
          )}
        </div>
      )}

      {/* Day detail panel for smaller screens (below grid) */}
      {!loading && view === 'calendar' && selectedDate && (
        <div className="lg:hidden">
          <DayDetailPanel
            date={selectedDate}
            events={selectedDateEvents}
            onClose={() => {
              setSelectedDate(null);
              setSelectedEvent(null);
            }}
            onSchedule={handleSchedule}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Timeline View                                                    */}
      {/* ---------------------------------------------------------------- */}
      {!loading &&
        view === 'timeline' &&
        (events.length === 0 ? <EmptyState /> : <TimelineView events={events} onSchedule={handleSchedule} />)}

      {/* ---------------------------------------------------------------- */}
      {/* Empty state for calendar view with no events                     */}
      {/* ---------------------------------------------------------------- */}
      {!loading && view === 'calendar' && events.length === 0 && <EmptyState />}

      {/* ---------------------------------------------------------------- */}
      {/* Schedule modal                                                   */}
      {/* ---------------------------------------------------------------- */}
      {scheduleTarget && (
        <ScheduleModal
          event={scheduleTarget.event}
          initialDate={scheduleTarget.date}
          brandId={brandId}
          onClose={() => setScheduleTarget(null)}
          onScheduled={handleScheduled}
        />
      )}
    </div>
  );
}
