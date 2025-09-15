import { useEffect } from "react";
import { useSimStore } from "@/state/useSimStore";

export default function Timeline() {
    const { isPlaying, speed, rangeStart, rangeEnd, cursorTs, setCursorTs, setIsPlaying } = useSimStore();
    const disabled = !rangeStart || !rangeEnd; // disable if no data

    // when user interacts with the timeline, pause playback and set the cursor to the new value
    const onInput = (newTimestamp: number) => {
        setIsPlaying(false);
        setCursorTs(newTimestamp);
    };

    // Effect to handle playback
    useEffect(() => {
        if (!isPlaying) return;

        const interval = setInterval(() => {
            useSimStore.setState((state) => {
                if (state.cursorTs == null || state.rangeEnd == null) return state;

                const next = state.cursorTs + 60 * 1000;
                if (next >= state.rangeEnd) {
                    return { cursorTs: state.rangeEnd, isPlaying: false }; // stop at end
                }
                return { cursorTs: next };
            });
        }, 1000 / speed);

        return () => clearInterval(interval);
    }, [isPlaying, speed]);

    return (
        <div className="timeline">
            <input
                type="range"
                min={rangeStart ?? 0} // minimum is start of range or 0 if no data
                max={rangeEnd ?? 100} // maximum is end of range or 100 if no data
                value={cursorTs ?? 0} // value is current cursor or 0 if no data
                onChange={(e) => onInput(Number(e.target.value))}
                disabled={disabled}
            />
            <div className="timeline-labels">
                <span>{rangeStart ? new Date(rangeStart).toLocaleString() : "—"}</span>
                <span>{cursorTs ? new Date(cursorTs).toLocaleString() : "—"}</span>
                <span>{rangeEnd ? new Date(rangeEnd).toLocaleString() : "—"}</span>
            </div>
        </div>
    );
}
