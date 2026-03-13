'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileText, Send, Megaphone } from 'lucide-react';

type CalendarEvent = {
  id: string;
  title: string;
  type: 'content' | 'brief' | 'publish_action' | 'campaign';
  status: string;
  date: string;
};

const typeConfig: Record<CalendarEvent['type'], { label: string; color: string; icon: typeof FileText }> = {
  content: { label: 'Content', color: 'bg-blue-100 text-blue-800', icon: FileText },
  brief: { label: 'Brief', color: 'bg-purple-100 text-purple-800', icon: FileText },
  publish_action: { label: 'Publish', color: 'bg-green-100 text-green-800', icon: Send },
  campaign: { label: 'Campaign', color: 'bg-orange-100 text-orange-800', icon: Megaphone },
};

function formatDateHeading(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = formatDateHeading(event.date);
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return groups;
}

export default function ContentCalendarPage() {
  const params = useParams();
  const brandId = params.id as string;

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/brands/${brandId}/content-calendar`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Content Calendar</h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Content Calendar</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Calendar className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-sm">No content events yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Content briefs, generated articles, publish actions, and campaigns will appear here as a timeline.
          </p>
        </div>
      </div>
    );
  }

  const grouped = groupByDate(events);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Content Calendar</h2>

      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
          <Card key={dateLabel}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{dateLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dayEvents.map((event) => {
                const config = typeConfig[event.type];
                const Icon = config.icon;

                return (
                  <div key={event.id} className="flex items-center gap-3 rounded-md border p-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium truncate">{event.title}</span>
                    <Badge className={`${config.color} border-0 text-xs`}>{config.label}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {event.status}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
