import { create } from 'zustand';

interface UserState {
    uid: string | null;
    nickname: string;
    balance: number;
    equity: number;
    totalPnl: number;
    pnlRate: number;
    stocks: number;
    watchlist: string[]; // List of symbols
    holdings: string[]; // List of symbols
    hasSeenPrologue: boolean;
    setUserInfo: (info: Partial<UserState>) => void;
    toggleWatchlist: (symbol: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
    uid: null,
    nickname: '투자자',
    balance: 0,
    equity: 0,
    totalPnl: 0,
    pnlRate: 0,
    stocks: 0,
    watchlist: [],
    holdings: [],
    hasSeenPrologue: true,
    setUserInfo: (info) => set((state) => ({ ...state, ...info })),
    toggleWatchlist: (symbol) => set((state) => ({
        ...state,
        watchlist: state.watchlist.includes(symbol)
            ? state.watchlist.filter(s => s !== symbol)
            : [...state.watchlist, symbol]
    })),
}));
