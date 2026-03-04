import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb, rankingRtdb } from '../lib/firebase';

export interface MarketIndex {
    name: string;
    price: number;
    change: number;
    change_percent: number;
}

export interface BroadcastTrade {
    displayName: string;
    targetName?: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL' | 'SABOTAGE_BUY' | 'SABOTAGE_SELL';
    amount: number;
    timestamp: string;
    profitRatio?: number;
}

export function useRealtimeData() {
    const [indices, setIndices] = useState<Record<string, MarketIndex>>({});
    const [exchangeRate, setExchangeRate] = useState<number>(0);
    const [tickers, setTickers] = useState<BroadcastTrade[]>([]);
    const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
    const [updatedAt, setUpdatedAt] = useState<string>('');

    useEffect(() => {
        // 1. 시장 지수 및 환율 구독
        const systemRef = ref(rtdb, 'system');
        const unsubscribeSystem = onValue(systemRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setIndices(data.indices || {});
                setExchangeRate(data.exchange_rate || 0);
                setIsMarketOpen(data.market_open || false);
                setUpdatedAt(data.updateAt || data.updatedAt || '');
            }
        });

        // 2. 대형 거래 티커 구독 (분산된 DB에서 읽기)
        const tickerRef = ref(rankingRtdb, 'system/tickers/list');
        const unsubscribeTickers = onValue(tickerRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const raw: BroadcastTrade[] = Array.isArray(data) ? data : Object.values(data);
                // 48시간 이내 항목만 필터링 후 최신 20건으로 제한
                const cutoff = Date.now() - 48 * 60 * 60 * 1000;
                const filtered = raw
                    .filter((t) => t && t.timestamp && new Date(t.timestamp).getTime() > cutoff)
                    .slice(0, 20);
                setTickers(filtered);
            }
        });

        return () => {
            unsubscribeSystem();
            unsubscribeTickers();
        };
    }, []);

    return { indices, exchangeRate, tickers, isMarketOpen, updatedAt };
}
