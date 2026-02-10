import { create } from 'zustand';
import { StockItem } from '../components/StockList';

interface StockState {
    stocks: Record<string, StockItem>; // symbol -> StockItem
    lastUpdate: string | null;
    isLoaded: boolean;
    setStocks: (stocks: Record<string, StockItem>) => void;
    updateStock: (symbol: string, stock: StockItem) => void;
    setLoading: (status: boolean) => void;
}

export const useStockStore = create<StockState>((set) => ({
    stocks: {},
    lastUpdate: null,
    isLoaded: false,
    setStocks: (stocks) => set({
        stocks,
        lastUpdate: new Date().toISOString(),
        isLoaded: true
    }),
    updateStock: (symbol, stock) => set((state) => ({
        stocks: { ...state.stocks, [symbol]: stock },
        lastUpdate: new Date().toISOString()
    })),
    setLoading: (isLoaded) => set({ isLoaded })
}));
