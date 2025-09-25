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
    stations: Record<string, GraphStation>;
    edges: Record<string, GraphEdge>;
    stationNameToId: Record<string, number>;
}

// Graph state
type GraphState = {
    graph: GraphStructure | null;
    loaded: boolean;
    load: () => Promise<void>;
};

// Create the graph store
export const useGraphStructure = create<GraphState>()((set, get) => ({
    graph: null,
    loaded: false,
    load: async () => {
        // Don't refetch if we have data
        if (get().loaded && get().graph) return;

        try {
            const res = await fetch("/src/data/graph_structure.json", { cache: "no-store" });
            if (!res.ok) {
                console.error("graph_structure.json fetch failed", res.status, res.statusText);
                set({ loaded: false });
                return;
            }
            const graph = (await res.json()) as GraphStructure;
            const hasData = graph && Object.keys(graph.stations).length > 0;
            if (!hasData) console.warn("graph_structure.json loaded but empty");
            set({ graph, loaded: hasData });
        } catch (e) {
            console.error("graph structure load error", e);
            set({ loaded: false });
        }
    },
}));
