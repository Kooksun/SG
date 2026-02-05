import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { kospiRtdb, kosdaqRtdb } from '../lib/firebase';
import { StockItem } from '../components/StockList';

export function useStocks() {
    const [stocks, setStocks] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // KOSPI (includes ETF) & KOSDAQ RTDBs
        const kospiRef = ref(kospiRtdb, 'stocks');
        const kosdaqRef = ref(kosdaqRtdb, 'stocks');

        let kospiStocks: StockItem[] = [];
        let kosdaqStocks: StockItem[] = [];

        const handleUpdate = () => {
            setStocks([...kospiStocks, ...kosdaqStocks]);
            setLoading(false);
        };

        const unsubKospi = onValue(kospiRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                kospiStocks = Object.entries(data).map(([symbol, stock]: [string, any]) => ({
                    symbol,
                    name: stock.name,
                    price: stock.price,
                    change: stock.change,
                    changePercent: stock.change_percent,
                    market: stock.market
                }));
                handleUpdate();
            }
        });

        const unsubKosdaq = onValue(kosdaqRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                kosdaqStocks = Object.entries(data).map(([symbol, stock]: [string, any]) => ({
                    symbol,
                    name: stock.name,
                    price: stock.price,
                    change: stock.change,
                    changePercent: stock.change_percent,
                    market: stock.market
                }));
                handleUpdate();
            }
        });

        return () => {
            off(kospiRef);
            off(kosdaqRef);
        };
    }, []);

    return { stocks, loading };
}
