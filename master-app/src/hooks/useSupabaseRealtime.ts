import { useEffect, useRef, useCallback, useState } from 'react';
import { supabaseRealtime, RealtimeChannel } from '../supabaseClient';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseSupabaseRealtimeOptions {
  table: string;
  event?: PostgresChangeEvent;
  schema?: string;
  /** Initial data fetch function - called once on mount */
  onInitialFetch: () => Promise<void>;
  /** Called when realtime change is received - should refetch data */
  onDataChange: () => void;
  /** Fallback polling interval in ms when Realtime is unavailable (default: 30000) */
  fallbackInterval?: number;
}

/**
 * Hook for subscribing to Supabase Realtime table changes.
 * Falls back to polling if Realtime connection fails.
 */
export function useSupabaseRealtime({
  table,
  event = '*',
  schema = 'public',
  onInitialFetch,
  onDataChange,
  fallbackInterval = 30000,
}: UseSupabaseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRealtime, setIsRealtime] = useState(false);

  const startFallbackPolling = useCallback(() => {
    if (fallbackRef.current) return;
    fallbackRef.current = setInterval(onDataChange, fallbackInterval);
  }, [onDataChange, fallbackInterval]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    onInitialFetch();

    // Subscribe to Realtime
    const channel = supabaseRealtime
      .channel(`${table}-changes`)
      .on(
        'postgres_changes' as any,
        { event, schema, table },
        () => {
          onDataChange();
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtime(true);
          stopFallbackPolling();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime subscription failed for ${table}, falling back to polling`);
          setIsRealtime(false);
          startFallbackPolling();
        }
      });

    channelRef.current = channel;

    // Visibility change: refetch when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        onDataChange();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopFallbackPolling();
      if (channelRef.current) {
        supabaseRealtime.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table]);

  return { isRealtime };
}
