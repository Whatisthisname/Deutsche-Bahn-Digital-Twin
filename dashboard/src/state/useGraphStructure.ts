import { create } from "zustand";

// Graph structure types
export interface GraphStation {
    name: string;
    lat: number;
    lon: number;
    degree: number;
    closenessCentrality: number;
}

export interface GraphEdge {
    from: number;
    to: number;
    distance: number;
    frequency: number;
}

export interface GraphStructure {
    metadata: {
        version: string;
        created: string;
        totalStations: number;
        totalEdges: number;
        description: string;
    };
    stations: Record<number, GraphStation>;
    edges: [number, number, number, number][]; // [from, to, distance, frequency]
    stationNameToId: Record<string, number>;
}

// Graph state
type GraphState = {
    graph: GraphStructure | undefined;
    loaded: boolean;
    load: () => Promise<void>;
};

// Create the graph store
export const useGraphStructure = create<GraphState>()((set, get) => ({
    graph: undefined,
    loaded: false,
    load: async () => {
        const state = get();
        if (state.loaded && state.graph) {
            console.log("graph already loaded");
            return;
        }

        console.log("Loading graph structure...");
        try {
            const res = await fetch("/src/data/graph_structure.json", { cache: "no-store" });
            console.log("Fetch response:", res.status, res.statusText);
            if (!res.ok) {
                throw new Error(`graph_structure.json fetch failed: ${res.status} ${res.statusText}`);
            }
            const graph = (await res.json()) as GraphStructure;
            const hasData = graph && Object.keys(graph.stations).length > 0;
            if (!hasData) throw new Error("graph_structure.json loaded but empty");
            if (!graph) throw new Error("graph still undefined");
            set({ graph, loaded: hasData });
            console.log("Graph loaded successfully with", Object.keys(graph.stations).length, "stations");
        } catch (error) {
            console.error("Failed to load graph:", error);
            set({ loaded: false });
        }
    },
}));
