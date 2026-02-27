import { useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useUserStore } from './useUserStore';

export function useUserAsset(uid: string | null) {
    const setUserInfo = useUserStore((state) => state.setUserInfo);

    useEffect(() => {
        if (!uid) {
            setUserInfo({ uid: null, watchlist: [], holdings: [] });
            return;
        }

        // 0. Ensure uid is set in store immediately
        setUserInfo({ uid });

        const userRef = doc(db, 'users', uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserInfo({
                    uid: uid,
                    nickname: data.displayName || '투자자',
                    balance: data.balance || 0,
                    equity: (data.balance || 0) + (data.totalStockValue || 0),
                    totalPnl: data.totalPnl || 0,
                    pnlRate: data.pnlRate || 0,
                    startingBalance: data.startingBalance || 300_000_000,
                    stocks: data.stockCount || 0,
                    hasSeenPrologue: data.hasSeenPrologue || false,
                });
            }
        });

        // Portfolio (Holdings) Sync
        const portfolioRef = collection(db, 'users', uid, 'portfolio');
        const unsubscribePortfolio = onSnapshot(portfolioRef, (snapshot) => {
            const holdings = snapshot.docs.map(doc => doc.id);
            setUserInfo({ holdings });
        });

        // Watchlist Sync
        const watchlistRef = collection(db, 'users', uid, 'watchlist');
        const unsubscribeWatchlist = onSnapshot(watchlistRef, (snapshot) => {
            const watchlist = snapshot.docs.map(doc => doc.id);
            setUserInfo({ watchlist });
        });

        return () => {
            unsubscribeUser();
            unsubscribePortfolio();
            unsubscribeWatchlist();
        };
    }, [uid, setUserInfo]);
}
