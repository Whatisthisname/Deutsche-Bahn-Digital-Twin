// types/components.ts
// TypeScript interfaces for React component props

import type { RideWithStatus } from "./ride";

/** Props for ActiveRidesList component */
export interface ActiveRidesListProps {
    /** Maximum number of rides to display */
    maxItems?: number;
    /** Whether to show ride status indicators */
    showStatus?: boolean;
    /** Whether to show duration information */
    showDuration?: boolean;
    /** Custom CSS class name */
    className?: string;
    /** Callback when a ride is selected */
    onRideSelect?: (ride: RideWithStatus) => void;
    /** Whether to show only active rides (default: shows all) */
    activeOnly?: boolean;
}

/** Props for Timeline component */
export interface TimelineProps {
    /** Minimum timestamp value */
    min: number;
    /** Maximum timestamp value */
    max: number;
    /** Current timestamp value */
    value: number;
    /** Callback when timeline value changes */
    onChange: (value: number) => void;
    /** Whether the timeline is disabled */
    disabled?: boolean;
    /** Step size for the timeline */
    step?: number;
    /** Whether to show time labels */
    showLabels?: boolean;
    /** Custom CSS class name */
    className?: string;
}

/** Props for MainStats component */
export interface MainStatsProps {
    /** Whether to show the current time */
    showCurrentTime?: boolean;
    /** Custom CSS class name */
    className?: string;
    /** Whether to show detailed statistics */
    showDetails?: boolean;
}

/** Props for MapView component */
export interface MapViewProps {
    /** Initial view state for the map */
    initialViewState?: {
        longitude: number;
        latitude: number;
        zoom: number;
    };
    /** Whether to show background edges */
    showBackgroundEdges?: boolean;
    /** Whether to show station markers */
    showStationMarkers?: boolean;
    /** Custom CSS class name */
    className?: string;
    /** Map style URL */
    mapStyle?: string;
}

/** Props for EventProcessor component */
export interface EventProcessorProps {
    /** Whether to enable debug logging */
    debug?: boolean;
    /** Batch size for processing events */
    batchSize?: number;
}

/** Props for DataLoader component */
export interface DataLoaderProps {
    /** URL to the CSV data file */
    dataUrl?: string;
    /** Whether to auto-start streaming after loading */
    autoStart?: boolean;
    /** Callback when data is loaded */
    onDataLoaded?: () => void;
    /** Callback when loading fails */
    onError?: (error: Error) => void;
}

/** Props for CsvPreview component */
export interface CsvPreviewProps {
    /** Maximum number of rows to display */
    maxRows?: number;
    /** Whether to show column headers */
    showHeaders?: boolean;
    /** Custom CSS class name */
    className?: string;
}

/** Props for ReplayControls component */
export interface ReplayControlsProps {
    /** Whether playback is currently active */
    isPlaying: boolean;
    /** Current playback speed multiplier */
    speed: number;
    /** Callback when play/pause state changes */
    onPlayPause: (isPlaying: boolean) => void;
    /** Callback when speed changes */
    onSpeedChange: (speed: number) => void;
    /** Available speed options */
    speedOptions?: number[];
    /** Custom CSS class name */
    className?: string;
}

/** Props for AverageDelayChart component */
export interface AverageDelayChartProps {
    /** Chart data */
    data: Array<{
        time: number;
        delay: number;
    }>;
    /** Chart width */
    width?: number;
    /** Chart height */
    height?: number;
    /** Custom CSS class name */
    className?: string;
}

/** Props for Menu component */
export interface MenuProps {
    /** Whether the menu is open */
    isOpen: boolean;
    /** Callback when menu state changes */
    onToggle: (isOpen: boolean) => void;
    /** Menu items */
    items: Array<{
        label: string;
        path: string;
        icon?: string;
    }>;
    /** Custom CSS class name */
    className?: string;
}
