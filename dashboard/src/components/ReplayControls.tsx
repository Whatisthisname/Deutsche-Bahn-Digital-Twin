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
                {SPEEDS.map((s) => (
                    <button
                        key={s}
                        className={`speed-btn ${speed === s ? "active" : ""}`}
                        onClick={() => setSpeed(s)}
                    >
                        {s}×
                    </button>
                ))}
            </div>
        </div>
    );
}
