import { create } from "zustand";

interface HiddenStore {
  unlockedIds: Set<string>;
  unlock: (id: string) => void;
  isUnlocked: (id: string) => boolean;
}

export const useHiddenStore = create<HiddenStore>((set, get) => ({
  unlockedIds: new Set<string>(),
  unlock: (id: string) => set((state) => {
    const next = new Set(state.unlockedIds);
    next.add(id);
    return { unlockedIds: next };
  }),
  isUnlocked: (id: string) => get().unlockedIds.has(id),
}));
