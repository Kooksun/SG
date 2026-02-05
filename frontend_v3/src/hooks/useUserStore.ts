import { create } from 'zustand';

interface UserState {
    uid: string | null;
    nickname: string;
    balance: number;
    equity: number;
    totalPnl: number;
    pnlRate: number;
    stocks: number;
    hasSeenPrologue: boolean;
    setUserInfo: (info: Partial<UserState>) => void;
}

export const useUserStore = create<UserState>((set) => ({
    uid: null,
    nickname: '투자자',
    balance: 0,
    equity: 0,
    totalPnl: 0,
    pnlRate: 0,
    stocks: 0,
    hasSeenPrologue: true, // 기본값은 노출 안 함으로 설정 (로그인 전)
    setUserInfo: (info) => set((state) => ({ ...state, ...info })),
}));
