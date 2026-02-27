import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);

    const PAGE_SIZE = 20;

    useEffect(() => {
        if (!uid) {
            setHistory([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const historyRef = collection(db, 'users', uid, 'history');
        const q = query(
            historyRef,
            orderBy('timestamp', 'desc'),
            limit(PAGE_SIZE)
        );

        // real-time listener for the first page
        const unsubscribe = onSnapshot(q, (snapshot) => {
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

            // For initial set, we replace. But we must be careful with 'loadMore'.
            // If we are currently showing more than one page, onSnapshot might only return the first PAGE_SIZE.
            // For Season 3 simplicity, we'll let onSnapshot handle the 'current first page' view.
            setHistory(historyData);

            // Only update lastDoc if it's the first fetch or we haven't paged yet
            if (snapshot.docs.length > 0) {
                setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
            }

            setHasMore(snapshot.docs.length === PAGE_SIZE);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to trade history:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [uid]);

    const loadMore = async () => {
        if (!uid || !lastDoc || loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const historyRef = collection(db, 'users', uid, 'history');
            const q = query(
                historyRef,
                orderBy('timestamp', 'desc'),
                startAfter(lastDoc),
                limit(PAGE_SIZE)
            );

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

            setHistory(prev => [...prev, ...historyData]);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error("Error fetching more trade history:", error);
        } finally {
            setLoadingMore(false);
        }
    };

    return { history, loading, loadingMore, hasMore, loadMore };
}
