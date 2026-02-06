import { useEffect } from 'react';
import { ref, onChildChanged, onChildAdded, DataSnapshot } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { useToast } from '../context/ToastContext';

export const useOrderToast = (uid: string | null) => {
    const { addToast } = useToast();

    useEffect(() => {
        if (!uid) return;

        const ordersRef = ref(rtdb, `orders/${uid}`);

        const handleOrderUpdate = (snapshot: DataSnapshot) => {
            const order = snapshot.val();
            if (!order) return;

            const { status, type, name, quantity, errorMessage } = order;

            if (status === 'COMPLETED') {
                addToast(`${name} ${quantity}주 ${type === 'BUY' ? '매수' : '매도'} 체결 완료!`, 'success');
            } else if (status === 'FAILED') {
                addToast(`${name} 주문 실패: ${errorMessage || '알 수 없는 오류'}`, 'error');
            }
        };

        // Listen for status changes (Child updates)
        const unsubChanged = onChildChanged(ordersRef, handleOrderUpdate);

        // Also check newly added orders that might have been processed instantly
        const unsubAdded = onChildAdded(ordersRef, (snapshot) => {
            const order = snapshot.val();
            // Only toast if it's already in a final state and reasonably fresh (e.g., within last 10s)
            if (order && (order.status === 'COMPLETED' || order.status === 'FAILED')) {
                const requestedAt = new Date(order.requestedAt).getTime();
                const now = new Date().getTime();
                if (now - requestedAt < 10000) {
                    handleOrderUpdate(snapshot);
                }
            }
        });

        return () => {
            unsubChanged();
            unsubAdded();
        };
    }, [uid, addToast]);
};
