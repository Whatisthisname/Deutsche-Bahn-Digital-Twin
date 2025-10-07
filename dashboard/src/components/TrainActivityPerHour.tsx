import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveJourneys } from '@/hooks/useStreamingTrainEvents';
import { useSimStore } from '@/state/useSimStore';
import { calculateDelayMinutes } from '@/utils/delayUtils';
import type { ArrivalOrDepartureEvent } from '@/types/ride';

interface HourlyStats {
  hour: string;
  active: number;
  delayed: number;
  cancelled: number;
}

export default function TrainActivityPerHour() {
  // Follow ValidationChart pattern exactly
  const journeys = useActiveJourneys();
  const currentTime = useSimStore(s => s.cursorTs) ?? 0;

  // Flatten and sort all events by timestamp, same as ValidationChart
  // Only include events that have occurred by current simulation time
  const allEvents = useMemo(
    () =>
      journeys
        .flatMap(j => j.events)
        .filter(event => new Date(event.timestamp).getTime() <= currentTime)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [journeys, currentTime]
  );

  const chartData = useMemo(() => {
    if (allEvents.length === 0) return [];

    // Group events by rideId for sequential delay calculation, same as ValidationChart
    const eventsByRide = new Map<string, ArrivalOrDepartureEvent[]>();
    for (const e of allEvents) {
      const id = String(e.id_);
      (eventsByRide.get(id) ?? (eventsByRide.set(id, []), eventsByRide.get(id)!)).push(e);
    }

    // Build hourly data directly in chartData calculation, like ValidationChart builds its data
    const hourlyStats = new Map<string, HourlyStats>();

    // Process each event, similar to ValidationChart's enrichedPairs processing
    for (const event of allEvents) {
      const eventTime = new Date(event.timestamp).getTime();
      
      // Create hour key from actual event timestamp, like ValidationChart uses event time
      const eventDate = new Date(eventTime);
      const hour = eventDate.getHours();
      const hourKey = hour.toString().padStart(2, '0') + ':00';
      
      // Get or create hourly stats
      if (!hourlyStats.has(hourKey)) {
        hourlyStats.set(hourKey, {
          hour: hourKey,
          active: 0,
          delayed: 0,
          cancelled: 0
        });
      }
      
      const stats = hourlyStats.get(hourKey)!;
      
      // Count this event as active
      stats.active++;
      
      // Check if it's cancelled
      if (event.event_type === 'CANCELLATION') {
        stats.cancelled++;
      } else {
        // Check for delays using ValidationChart's exact method
        const rideEvents = (eventsByRide.get(String(event.id_)) ?? [])
          .slice()
          .sort((a, b) => a.station_num - b.station_num);
        
        const idx = rideEvents.findIndex(ev => 
          ev.timestamp === event.timestamp && ev.station_num === event.station_num
        );
        
        if (idx > 0) {
          const prev = rideEvents[idx - 1];
          try {
            const actual = calculateDelayMinutes(event, prev);
            if (actual > 5) {
              stats.delayed++;
            }
          } catch (e) {
            // Skip delay calculation if error
          }
        }
      }
    }

    // Convert to array and sort by time, like ValidationChart sorts by timestamp
    const sortedData = Array.from(hourlyStats.values()).sort((a, b) => {
      // Sort by hour string (HH:00 format)
      return a.hour.localeCompare(b.hour);
    });

    return sortedData;
  }, [allEvents, currentTime]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">Train Activity Per Hour</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <XAxis dataKey="hour" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="active" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            name="Active Trains"
            isAnimationActive={false}
            animationDuration={0}
          />
          <Line 
            type="monotone" 
            dataKey="delayed" 
            stroke="#f59e0b" 
            strokeWidth={2} 
            name="Delayed Trains"
            isAnimationActive={false}
            animationDuration={0}
          />
          <Line 
            type="monotone" 
            dataKey="cancelled" 
            stroke="#ef4444" 
            strokeWidth={2} 
            name="Cancelled Trains"
            isAnimationActive={false}
            animationDuration={0}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}