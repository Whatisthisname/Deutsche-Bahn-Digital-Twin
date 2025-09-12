import { useSimStore } from "../state/useSimStore";

export default function Timeline() {
    const { rangeStart, rangeEnd, cursorTs, setCursorTs, setIsPlaying } = useSimStore();
    const disabled = !rangeStart || !rangeEnd; // disable if no data

    // when user interacts with the timeline, pause playback and set the cursor to the new value
    const onInput = (newTimestamp: number) => {
        setIsPlaying(false);
        setCursorTs(newTimestamp);
    };

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
