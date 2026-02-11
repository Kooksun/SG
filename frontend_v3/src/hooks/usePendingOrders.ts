import { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { tradeService } from '../lib/tradeService';

export interface PendingOrder {
    id: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    orderType: 'MARKET' | 'LIMIT';
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'ERROR';
    createdAt: string;
}

export function usePendingOrders(uid: string | null) {
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uid) {
            setPendingOrders([]);
            setLoading(false);
            return;
        }

        const ordersRef = ref(rtdb, `orders/${uid}`);

        const unsubscribe = onValue(ordersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const ordersList: PendingOrder[] = Object.entries(data)
                    .map(([id, value]: [string, any]) => ({
                        id,
                        ...value
                    }))
                    .filter(order => order.status === 'PENDING')
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                setPendingOrders(ordersList);
            } else {
                setPendingOrders([]);
            }
            setLoading(false);
        });

        return () => off(ordersRef, 'value', unsubscribe);
    }, [uid]);

    const cancelOrder = async (orderId: string) => {
        if (!uid) return;
        try {
            await tradeService.cancelOrder(uid, orderId);
        } catch (error) {
            console.error("Failed to cancel order:", error);
            throw error;
        }
    };

    return { pendingOrders, loading, cancelOrder };
}
