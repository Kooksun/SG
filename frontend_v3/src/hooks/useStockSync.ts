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
                            // Parse compressed info field: "change|change_percent|volume"
                            const info = (stock.info || '0|0|0').split('|');
                            mapped[symbol] = {
                                symbol,
                                name: stock.name,
                                price: stock.price,
                                change: parseFloat(info[0] || '0'),
                                changePercent: parseFloat(info[1] || '0'),
                                volume: parseFloat(info[2] || '0'),
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
                            // Parse compressed info field: "change|changePercent|volume"
                            const info = (stock.info || '0|0|0').split('|');
                            mapped[symbol] = {
                                symbol,
                                name: stock.name,
                                price: stock.price,
                                change: parseFloat(info[0] || '0'),
                                changePercent: parseFloat(info[1] || '0'),
                                volume: parseFloat(info[2] || '0'),
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
