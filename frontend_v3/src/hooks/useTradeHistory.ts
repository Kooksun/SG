import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface TradeHistoryItem {
    id: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL' | 'REWARD' | 'TAX' | 'LUCKY_BOX';
    price: number;
    quantity: number;
    totalAmount: number;
    profit?: number;
    profitRatio?: number;
    fee: number;
    rawFee?: number;
    discount?: number;
    timestamp: any;
}

export function useTradeHistory(uid: string | null) {
    const [history, setHistory] = useState<TradeHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageNumber, setPageNumber] = useState(0);

    const PAGE_SIZE = 20;

    const fetchHistory = async (page: number, append: boolean = false) => {
        if (!uid) return;
        
        try {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('trade_records')
                .select('*')
                .eq('uid', uid)
                .order('timestamp', { ascending: false })
                .range(from, to);

            if (error) {
                console.error("Error fetching trade history from Supabase:", error);
                return;
            }

            if (!data) return;

            const historyData: TradeHistoryItem[] = data.map((row: any) => ({
                id: row.id || row.order_id || Math.random().toString(), // fallback if missing
                symbol: row.symbol,
                name: row.stock_name || row.name, // Support older schemas if needed
                type: row.type,
                price: row.price,
                quantity: row.quantity,
                totalAmount: row.amount,
                profit: row.profit,
                profitRatio: row.profit_ratio,
                fee: row.final_fee || 0,
                rawFee: row.raw_fee,
                discount: row.discount_amount,
                timestamp: row.timestamp
            }));

            if (append) {
                setHistory(prev => [...prev, ...historyData]);
            } else {
                setHistory(historyData);
            }

            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error in fetchHistory:", error);
        }
    };

    useEffect(() => {
        if (!uid) {
            setHistory([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setPageNumber(0);
        setHasMore(true);
        fetchHistory(0).finally(() => setLoading(false));
    }, [uid]);

    const loadMore = async () => {
        if (!uid || loadingMore || !hasMore) return;

        setLoadingMore(true);
        const nextPage = pageNumber + 1;
        await fetchHistory(nextPage, true);
        setPageNumber(nextPage);
        setLoadingMore(false);
    };

    return { history, loading, loadingMore, hasMore, loadMore };
}
