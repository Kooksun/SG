import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useUserStore } from './useUserStore';

export function useUserAsset(uid: string | null) {
    const setUserInfo = useUserStore((state) => state.setUserInfo);

    useEffect(() => {
        if (!uid) return;

        const userRef = doc(db, 'users', uid);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserInfo({
                    uid: uid,
                    nickname: data.displayName || '투자자',
                    balance: data.balance || 0,
                    equity: (data.balance || 0) + (data.totalStockValue || 0), // totalStockValue는 백엔드에서 집계해주거나 프론트에서 합산 필요
                    totalPnl: data.totalPnl || 0,
                    pnlRate: data.pnlRate || 0,
                    stocks: data.stockCount || 0,
                    hasSeenPrologue: data.hasSeenPrologue || false,
                });
            }
        });

        return () => unsubscribe();
    }, [uid, setUserInfo]);
}
