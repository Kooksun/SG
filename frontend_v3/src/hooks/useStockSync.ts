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

        const marketStocks: Record<string, Record<string, StockItem>> = {
            KOSPI: {},
            KOSDAQ: {},
            ETF: {},
            ETN: {}
        };

        const handleUpdate = () => {
            // Merge all market stocks into a single dictionary
            const allStocks = Object.values(marketStocks).reduce((acc, curr) => ({ ...acc, ...curr }), {});
            setStocks(allStocks);
            setLoading(true);
        };

        const processMarketData = (market: string, stocksObj: any) => {
            if (typeof stocksObj !== 'object') return;
            const mapped: Record<string, StockItem> = {};
            Object.entries(stocksObj).forEach(([symbol, stock]: [string, any]) => {
                const info = (stock.info || '0|0|0').split('|');
                mapped[symbol] = {
                    symbol,
                    name: stock.name,
                    price: stock.price,
                    change: parseFloat(info[0] || '0'),
                    changePercent: parseFloat(info[1] || '0'),
                    volume: parseFloat(info[2] || '0'),
                    market: market
                };
            });
            marketStocks[market] = mapped;
        };

        const unsubKospi = onValue(kospiRef, (snapshot) => {
            const data = snapshot.val(); // e.g., { KOSPI: {...}, ETF: {...}, ETN: {...} }
            if (data) {
                // Process each market node under KOSPI RTDB
                if (data.KOSPI) processMarketData('KOSPI', data.KOSPI);
                if (data.ETF) processMarketData('ETF', data.ETF);
                if (data.ETN) processMarketData('ETN', data.ETN);
                
                handleUpdate();
            }
        });

        const unsubKosdaq = onValue(kosdaqRef, (snapshot) => {
            const data = snapshot.val(); // e.g., { KOSDAQ: {...} }
            if (data) {
                // Process KOSDAQ node
                if (data.KOSDAQ) processMarketData('KOSDAQ', data.KOSDAQ);
                
                handleUpdate();
            }
        });

        return () => {
            off(kospiRef);
            off(kosdaqRef);
        };
    }, [setStocks, setLoading]);
}
