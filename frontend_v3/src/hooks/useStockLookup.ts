import { useState, useCallback } from 'react';
import { ref, set, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { StockItem } from '../components/StockList';
import { useStockStore } from './useStockStore';

export function useStockLookup() {
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { updateStock } = useStockStore();

    const lookupStock = useCallback(async (symbol: string): Promise<StockItem | null> => {
        setIsLookingUp(true);
        setError(null);

        const requestRef = ref(rtdb, `system/requests/lookup/${symbol}`);
        const dataRef = ref(rtdb, `system/data/lookup/${symbol}`);

        return new Promise((resolve) => {
            // 1. Write Request
            set(requestRef, {
                status: 'PENDING',
                requestedAt: new Date().toISOString()
            });

            // 2. Listen for response
            const unsub = onValue(dataRef, (snapshot) => {
                const data = snapshot.val();
                if (data && data.updatedAt) {
                    const stock: StockItem = {
                        symbol: data.symbol,
                        name: data.name,
                        price: data.price,
                        change: data.change,
                        changePercent: data.change_percent,
                        volume: data.volume,
                        market: data.market
                    };

                    // Update global store so TradeModal can use it
                    updateStock(stock.symbol, stock);

                    setIsLookingUp(false);
                    off(dataRef);
                    resolve(stock);
                }
            });

            // 3. Listen for request failure
            const unsubReq = onValue(requestRef, (snapshot) => {
                const req = snapshot.val();
                if (req?.status === 'FAILED') {
                    setError(req.errorMessage || '종목 정보를 불러올 수 없습니다.');
                    setIsLookingUp(false);
                    off(requestRef);
                    off(dataRef);
                    resolve(null);
                }
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                off(requestRef);
                off(dataRef);
                setIsLookingUp(false);
                setError('요청 시간이 초과되었습니다.');
                resolve(null);
            }, 10000);
        });
    }, [updateStock]);

    return { lookupStock, isLookingUp, error };
}
