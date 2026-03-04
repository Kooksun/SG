import { useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
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

        // 1. Firestore User Doc (Static/Semi-static info)
        const userRef = doc(db, 'users', uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserInfo({
                    uid: uid,
                    nickname: data.displayName || '투자자',
                    balance: data.balance || 0,
                    startingBalance: data.startingBalance || 300_000_000,
                    taxPoints: data.taxPoints || 0,
                    minigameStats: data.minigameStats || {},
                    hasSeenPrologue: data.hasSeenPrologue || false,
                });
            }
        });

        // 2. RTDB live_stats (Real-time Equity, PnL, etc.)
        // This reduces Firestore reads as we don't need to read the user doc purely for equity updates
        const liveStatsRef = ref(rtdb, `users/${uid}/live_stats`);
        const unsubscribeLiveStats = onValue(liveStatsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setUserInfo({
                    equity: data.totalEquity || 0,
                    pnlRate: data.pnlRate || 0,
                    stocks: data.stockCount || 0,
                    // totalStockValue: data.totalStockValue || 0 // If needed in store
                });
            }
        });

        // 3. Portfolio (Holdings) Sync
        const portfolioRef = collection(db, 'users', uid, 'portfolio');
        const unsubscribePortfolio = onSnapshot(portfolioRef, (snapshot) => {
            const holdings = snapshot.docs.map(doc => doc.id);
            setUserInfo({ holdings });
        });

        // 4. Watchlist Sync
        const watchlistRef = collection(db, 'users', uid, 'watchlist');
        const unsubscribeWatchlist = onSnapshot(watchlistRef, (snapshot) => {
            const watchlist = snapshot.docs.map(doc => doc.id);
            setUserInfo({ watchlist });
        });

        return () => {
            unsubscribeUser();
            unsubscribeLiveStats();
            unsubscribePortfolio();
            unsubscribeWatchlist();
        };
    }, [uid, setUserInfo]);
}
