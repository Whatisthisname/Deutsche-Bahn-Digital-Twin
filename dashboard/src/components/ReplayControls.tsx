import { useSimStore } from "../state/useSimStore";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import { SPEEDS } from "../state/useSimStore";

export default function ReplayControls() {
    const { isPlaying, speed, setIsPlaying, setSpeed, stepBack, stepForward } = useSimStore();

    return (
        <div className="replay-controls">
            {/* Back */}
            <button className="icon-btn" onClick={stepBack} title="Back">
                <SkipPreviousIcon fontSize="small" />
            </button>

            {/* Play/Pause */}
            <button className="icon-btn" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </button>

            {/* Forward */}
            <button className="icon-btn" onClick={stepForward} title="Step">
                <SkipNextIcon fontSize="small" />
            </button>

            {/* Speed controls */}
            <div className="speed">
                <span>Speed</span>
                {SPEEDS.slice(0, 3).map((s) => (
                    <button
                        key={s}
                        className={`speed-btn ${speed === s ? "active" : ""}`}
                        onClick={() => setSpeed(s)}
                    >
                        {s}×
                    </button>
                ))}

                {/* Dropdown for the remaining speeds */}
                {SPEEDS.length > 3 && (
                    <select
                        value={SPEEDS.slice(3).includes(speed) ? speed : ""}
                        onChange={(e) => setSpeed(Number(e.target.value) as typeof SPEEDS[number])}
                        className={`speed-select${SPEEDS.slice(3).includes(speed) ? " active" : ""}`}
                    >
                        <option value="" disabled>
                            More...
                        </option>
                        {SPEEDS.slice(3).map((s) => (
                            <option key={s} value={s}>
                                {s}×
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}
