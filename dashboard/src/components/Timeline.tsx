import { useEffect, useCallback, useRef } from "react";
import { useSimStore } from "@/state/useSimStore";
import type { TimelineProps } from "@/types/components";

export default function Timeline({
    showLabels = true,
    className
}: Partial<TimelineProps> = {}) {
    const { isPlaying, speed, unit, rangeStart, rangeEnd, cursorTs, setIsPlaying, scrubToTime, isScrubbing, setCursorTs } = useSimStore();
    const disabled = !rangeStart || !rangeEnd; // disable if no data
    const TICK_SIM_DELTA_MS = unit === "seconds" ? 1000 : unit === "mins" ? 60 * 1000 : 1000; // how much simulated time passes per tick

    // Use ref to track current cursorTs value without causing effect re-runs
    const cursorTsRef = useRef(cursorTs);
    cursorTsRef.current = cursorTs;

    // when user interacts with the timeline, pause playback and scrub to the new value
    const onInput = useCallback(async (newTimestamp: number) => {
        setIsPlaying(false);
        await scrubToTime(newTimestamp);
    }, [setIsPlaying, scrubToTime]);

    // Effect to handle playback with optimized update frequency
    useEffect(() => {
        if (!isPlaying || isScrubbing || !rangeEnd || !cursorTsRef.current || speed <= 0) return;

        let rafId: number;
        let lastNow = performance.now();
        let accumulator = 0;

        // ticks per real second = speed
        const tickPeriodMs = 1000 / speed; // ms between ticks in real time

        const loop = (now: number) => {
            const dt = now - lastNow;
            lastNow = now;
            accumulator += dt;

            // emit as many whole ticks as fit in the accumulator
            while (accumulator >= tickPeriodMs) {
                const current = cursorTsRef.current!;
                const next = current + TICK_SIM_DELTA_MS;

                if (next >= rangeEnd) {
                    setCursorTs(rangeEnd);
                    setIsPlaying(false); // stop at end
                    accumulator = 0;     // clear so we don’t “catch up” after stopping
                    return;              // end the loop
                }

                setCursorTs(next);
                accumulator -= tickPeriodMs;
            }

            rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, isScrubbing, speed, unit, rangeEnd, setCursorTs, setIsPlaying]);


    return (
        <div className={`timeline ${className || ''}`}>
            <input
                type="range"
                min={rangeStart ?? 0} // minimum is start of range or 0 if no data
                max={rangeEnd ?? 100} // maximum is end of range or 100 if no data
                value={cursorTs ?? 0} // value is current cursor or 0 if no data
                step={TICK_SIM_DELTA_MS}
                onChange={(e) => onInput(Number(e.target.value))}
                disabled={true}
            />
            {showLabels && (
                <div className="timeline-labels">
                    <span>{rangeStart ? new Date(rangeStart).toLocaleString() : "—"}</span>
                    <span>{cursorTs ? new Date(cursorTs).toLocaleString() : "—"}</span>
                    <span>{rangeEnd ? new Date(rangeEnd).toLocaleString() : "—"}</span>
                    {isScrubbing && <span style={{ color: '#ff9800' }}>Catching up...</span>}
                </div>
            )}
        </div>
    );
}
