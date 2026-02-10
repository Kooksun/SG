import { useMemo } from 'react';
import { useStockStore } from './useStockStore';

/**
 * useStocks is now a consumer-only hook.
 * It reads from the global useStockStore which is populated by useStockSync in App.tsx.
 */
export function useStocks() {
    const stocksMap = useStockStore((state) => state.stocks);
    const isLoaded = useStockStore((state) => state.isLoaded);

    const stocksArray = useMemo(() => Object.values(stocksMap), [stocksMap]);

    return {
        stocks: stocksArray,
        loading: !isLoaded
    };
}
