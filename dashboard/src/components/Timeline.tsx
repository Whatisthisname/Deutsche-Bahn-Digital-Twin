import { useEffect, useCallback, useRef } from "react";
import { useSimStore } from "@/state/useSimStore";
import { TIME_CONSTANTS } from "@/utils/time";
import type { TimelineProps } from "@/types/components";

export default function Timeline({
    showLabels = true,
    className
}: Partial<TimelineProps> = {}) {
    const { isPlaying, speed, rangeStart, rangeEnd, cursorTs, setIsPlaying, scrubToTime, isScrubbing, setCursorTs } = useSimStore();
    const disabled = !rangeStart || !rangeEnd; // disable if no data

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
        if (!isPlaying || isScrubbing) return;

        // Use requestAnimationFrame for smoother updates instead of setInterval
        let animationFrameId: number;
        let lastUpdateTime = 0;
        const updateInterval = Math.max(TIME_CONSTANTS.MIN_TIMELINE_UPDATE_MS, 1000 / speed); // Minimum 100ms between updates

        const updateCursor = (currentTime: number) => {
            if (currentTime - lastUpdateTime >= updateInterval) {
                const currentCursorTs = cursorTsRef.current;
                if (currentCursorTs == null || rangeEnd == null) return;

                // Advance time by the correct increment based on speed
                const timeIncrement = TIME_CONSTANTS.TIME_INCREMENT_PER_SECOND_MS * speed;
                const next = currentCursorTs + timeIncrement;

                // Timeline advancement - removed noisy logging

                if (next >= rangeEnd) {
                    setIsPlaying(false); // stop at end
                    setCursorTs(rangeEnd);
                } else {
                    setCursorTs(next);
                }
                lastUpdateTime = currentTime;
            }
            animationFrameId = requestAnimationFrame(updateCursor);
        };

        animationFrameId = requestAnimationFrame(updateCursor);

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isPlaying, speed, isScrubbing, setCursorTs, setIsPlaying, rangeEnd]);

    return (
        <div className={`timeline ${className || ''}`}>
            <input
                type="range"
                min={rangeStart ?? 0} // minimum is start of range or 0 if no data
                max={rangeEnd ?? 100} // maximum is end of range or 100 if no data
                value={cursorTs ?? 0} // value is current cursor or 0 if no data
                onChange={(e) => onInput(Number(e.target.value))}
                disabled={disabled || isScrubbing}
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
