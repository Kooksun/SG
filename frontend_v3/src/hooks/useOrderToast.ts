import { useEffect, useRef } from 'react';
import { ref, onChildChanged, onChildAdded, DataSnapshot } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { useToast } from '../context/ToastContext';

export const useOrderToast = (uid: string | null) => {
    const { addToast } = useToast();
    const toastedOrders = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!uid) return;

        const ordersRef = ref(rtdb, `orders/${uid}`);

        const handleOrderUpdate = (snapshot: DataSnapshot) => {
            const order = snapshot.val();
            if (!order) return;

            const { status, type, name, quantity, errorMessage, createdAt } = order;
            const toastKey = `${snapshot.key}_${status}`;

            // Check if this specific order and status has already been toasted
            if (toastedOrders.current.has(toastKey)) return;

            if (status === 'COMPLETED') {
                addToast(`${name} ${quantity}주 ${type === 'BUY' ? '매수' : '매도'} 체결 완료!`, 'success');
                toastedOrders.current.add(toastKey);
            } else if (status === 'FAILED') {
                addToast(`${name} 주문 실패: ${errorMessage || '알 수 없는 오류'}`, 'error');
                toastedOrders.current.add(toastKey);
            } else if (status === 'PENDING') {
                // Only toast for very recent PENDING orders to avoid spam on initial load
                const orderTime = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
                const now = Date.now();
                if (now - orderTime < 5000) {
                    addToast(`${name} ${quantity}주 ${type === 'BUY' ? '매수' : '매도'} 주문이 요청되었습니다.`, 'info');
                    toastedOrders.current.add(toastKey);
                }
            }
        };

        // Listen for status changes (Child updates)
        const unsubChanged = onChildChanged(ordersRef, handleOrderUpdate);

        // Also check newly added orders that might have been processed instantly
        const unsubAdded = onChildAdded(ordersRef, (snapshot) => {
            const order = snapshot.val();
            if (!order) return;

            const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();
            const now = Date.now();

            // Notify for all new orders within 5s, regardless of status
            if (now - orderTime < 5000) {
                handleOrderUpdate(snapshot);
            }
        });

        return () => {
            unsubChanged();
            unsubAdded();
        };
    }, [uid, addToast]);
};
