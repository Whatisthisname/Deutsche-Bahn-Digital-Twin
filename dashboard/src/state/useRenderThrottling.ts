// state/useRenderThrottling.ts
import { create } from "zustand";

/** Render throttling state */
type RenderThrottlingState = {
    isCatchingUp: boolean;
    shouldThrottleRenders: boolean;

    // Actions
    startCatchUp: () => void;
    endCatchUp: () => void;
    setThrottlingEnabled: (enabled: boolean) => void;
};

export const useRenderThrottling = create<RenderThrottlingState>((set) => ({
    isCatchingUp: false,
    shouldThrottleRenders: true,

    startCatchUp: () => {
        set({ isCatchingUp: true });
    },

    endCatchUp: () => {
        set({ isCatchingUp: false });
    },

    setThrottlingEnabled: (enabled: boolean) => {
        set({ shouldThrottleRenders: enabled });
    }
}));

// Helper hook to check if renders should be throttled
export const useShouldThrottleRenders = () => {
    return useRenderThrottling(state =>
        state.isCatchingUp && state.shouldThrottleRenders
    );
};
