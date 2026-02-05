import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export interface MarketIndex {
    name: string;
    price: number;
    change: number;
    change_percent: number;
}

export interface BroadcastTrade {
    displayName: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
    amount: number;
    timestamp: string;
    profitRatio?: number;
}

export function useRealtimeData() {
    const [indices, setIndices] = useState<Record<string, MarketIndex>>({});
    const [exchangeRate, setExchangeRate] = useState<number>(0);
    const [tickers, setTickers] = useState<BroadcastTrade[]>([]);
    const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);

    useEffect(() => {
        // 1. 시장 지수 및 환율 구독
        const systemRef = ref(rtdb, 'system');
        const unsubscribeSystem = onValue(systemRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setIndices(data.indices || {});
                setExchangeRate(data.exchange_rate || 0);
                setIsMarketOpen(data.market_open || false);
            }
        });

        // 2. 대형 거래 티커 구독
        const tickerRef = ref(rtdb, 'system/tickers/list');
        const unsubscribeTickers = onValue(tickerRef, (snapshot) => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                setTickers(data);
            }
        });

        return () => {
            off(systemRef);
            off(tickerRef);
        };
    }, []);

    return { indices, exchangeRate, tickers, isMarketOpen };
}
