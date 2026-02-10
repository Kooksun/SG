import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface TradeHistoryItem {
    id: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
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
    const [lastDoc, setLastDoc] = useState<any>(null);

    const PAGE_SIZE = 20;

    const fetchHistory = async (isInitial = true) => {
        if (!uid) return;

        if (isInitial) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const historyRef = collection(db, 'users', uid, 'history');
            let q = query(
                historyRef,
                orderBy('timestamp', 'desc'),
                limit(PAGE_SIZE)
            );

            if (!isInitial && lastDoc) {
                q = query(
                    historyRef,
                    orderBy('timestamp', 'desc'),
                    startAfter(lastDoc),
                    limit(PAGE_SIZE)
                );
            }

            const snapshot = await getDocs(q);
            const historyData = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    symbol: data.symbol,
                    name: data.name,
                    type: data.type,
                    price: data.price,
                    quantity: data.quantity,
                    totalAmount: data.totalAmount || data.amount || 0,
                    profit: data.profit,
                    profitRatio: data.profitRatio,
                    fee: data.fee || 0,
                    rawFee: data.rawFee,
                    discount: data.discount,
                    timestamp: data.timestamp
                } as TradeHistoryItem;
            });

            if (isInitial) {
                setHistory(historyData);
            } else {
                setHistory(prev => [...prev, ...historyData]);
            }

            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error fetching trade history:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        setHistory([]);
        setLastDoc(null);
        setHasMore(true);
        fetchHistory(true);
    }, [uid]);

    return { history, loading, loadingMore, hasMore, loadMore: () => fetchHistory(false) };
}
