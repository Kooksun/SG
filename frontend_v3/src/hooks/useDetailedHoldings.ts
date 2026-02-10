import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStockStore } from './useStockStore';

export interface HoldingItem {
    symbol: string;
    name: string;
    quantity: number;
    averagePrice: number;
    currentPrice: number;
    marketValue: number;
}

export function useDetailedHoldings(uid: string | null) {
    const [rawHoldings, setRawHoldings] = useState<any[]>([]);
    const stocks = useStockStore((state) => state.stocks);

    useEffect(() => {
        if (!uid) {
            setRawHoldings([]);
            return;
        }

        const portfolioRef = collection(db, 'users', uid, 'portfolio');
        const unsubscribe = onSnapshot(portfolioRef, (snapshot) => {
            const holdings = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRawHoldings(holdings);
        });

        return () => unsubscribe();
    }, [uid]);

    const detailedHoldings = useMemo(() => {
        if (rawHoldings.length === 0) return [];

        return rawHoldings.map(holding => {
            const stock = stocks[holding.symbol];
            const currentPrice = stock ? stock.price : holding.averagePrice;
            return {
                symbol: holding.symbol,
                name: holding.name,
                quantity: holding.quantity,
                averagePrice: holding.averagePrice,
                currentPrice: currentPrice,
                marketValue: currentPrice * holding.quantity
            };
        }).sort((a, b) => b.marketValue - a.marketValue);
    }, [rawHoldings, stocks]);

    return { detailedHoldings };
}
