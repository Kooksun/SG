import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface TradeHistoryItem {
    id: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    totalAmount: number;
    timestamp: any;
}

export function useTradeHistory(uid: string | null) {
    const [history, setHistory] = useState<TradeHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uid) {
            setHistory([]);
            setLoading(false);
            return;
        }

        const historyRef = collection(db, 'users', uid, 'history');
        const q = query(
            historyRef,
            orderBy('timestamp', 'desc')
        );

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
                    timestamp: data.timestamp
                } as TradeHistoryItem;
            });
            setHistory(historyData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [uid]);

    return { history, loading };
}
