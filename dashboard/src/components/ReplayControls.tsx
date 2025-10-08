import { UNITS, SPEEDS, useSimStore } from "../state/useSimStore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";

export default function ReplayControls() {
    const { isPlaying, speed, unit, setIsPlaying, setSpeed, setUnits } = useSimStore();

    return (
        <div className="replay-controls">
            {/* Units controls */}
            <div className="units dropdown">
                <span>Units</span>
                <select
                    value={unit}
                    onChange={(e) => setUnits(e.target.value as typeof UNITS[number])}
                    className="units-select"
                >
                    {UNITS.map((u) => (
                        <option key={u} value={u}>
                            {u}
                        </option>
                    ))}
                </select>
            </div>

            {/* Play/Pause */}
            <button className="icon-btn" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </button>

            {/* Speed controls */}
            <div className="speed">
                <span>Speed</span>
                {SPEEDS.length <= 3 ? (
                    SPEEDS.map((s) => (
                        <button
                            key={s}
                            className={`speed-btn ${speed === s ? "active" : ""}`}
                            onClick={() => setSpeed(s)}
                        >
                            {s}×
                        </button>
                    ))
                ) : (
                    <>
                        {SPEEDS.slice(0, 2).map((s) => (
                            <button
                                key={s}
                                className={`speed-btn ${speed === s ? "active" : ""}`}
                                onClick={() => setSpeed(s)}
                            >
                                {s}×
                            </button>
                        ))}
                        <select
                            value={SPEEDS.slice(2).includes(speed) ? speed : ""}
                            onChange={(e) => setSpeed(Number(e.target.value) as typeof SPEEDS[number])}
                            className={`speed-select${SPEEDS.slice(2).includes(speed) ? " active" : ""}`}
                        >
                            <option value="" disabled>
                                More...
                            </option>
                            {SPEEDS.slice(2).map((s) => (
                                <option key={s} value={s}>
                                    {s}×
                                </option>
                            ))}
                        </select>
                    </>
                )}
            </div>
        </div>
    );
}
