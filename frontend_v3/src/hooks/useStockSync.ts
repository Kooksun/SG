import { useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { kospiRtdb, kosdaqRtdb } from '../lib/firebase';
import { StockItem } from '../components/StockList';
import { useStockStore } from './useStockStore';

export function useStockSync() {
    const { setStocks, setLoading } = useStockStore();

    useEffect(() => {
        const kospiRef = ref(kospiRtdb, 'stocks');
        const kosdaqRef = ref(kosdaqRtdb, 'stocks');

        let kospiStocks: Record<string, StockItem> = {};
        let kosdaqStocks: Record<string, StockItem> = {};

        const handleUpdate = () => {
            const allStocks = { ...kospiStocks, ...kosdaqStocks };
            setStocks(allStocks);
            setLoading(true);
        };

        const unsubKospi = onValue(kospiRef, (snapshot) => {
            const data = snapshot.val(); // { KOSPI: {...}, ETF: {...} }
            if (data) {
                const mapped: Record<string, StockItem> = {};
                Object.entries(data).forEach(([market, stocks]: [string, any]) => {
                    if (typeof stocks === 'object') {
                        Object.entries(stocks).forEach(([symbol, stock]: [string, any]) => {
                            mapped[symbol] = {
                                symbol,
                                name: stock.name,
                                price: stock.price,
                                change: stock.change,
                                changePercent: stock.change_percent,
                                volume: stock.volume || 0,
                                market: market // Injecting market from the path
                            };
                        });
                    }
                });
                kospiStocks = mapped;
                handleUpdate();
            }
        });

        const unsubKosdaq = onValue(kosdaqRef, (snapshot) => {
            const data = snapshot.val(); // { KOSDAQ: {...} }
            if (data) {
                const mapped: Record<string, StockItem> = {};
                Object.entries(data).forEach(([market, stocks]: [string, any]) => {
                    if (typeof stocks === 'object') {
                        Object.entries(stocks).forEach(([symbol, stock]: [string, any]) => {
                            mapped[symbol] = {
                                symbol,
                                name: stock.name,
                                price: stock.price,
                                change: stock.change,
                                changePercent: stock.change_percent,
                                volume: stock.volume || 0,
                                market: market // Injecting KOSDAQ
                            };
                        });
                    }
                });
                kosdaqStocks = mapped;
                handleUpdate();
            }
        });

        return () => {
            off(kospiRef);
            off(kosdaqRef);
        };
    }, [setStocks, setLoading]);
}
