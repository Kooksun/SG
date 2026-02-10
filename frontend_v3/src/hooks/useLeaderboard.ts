import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export interface LeaderboardUser {
    rank: number;
    uid: string;
    displayName: string;
    photoURL?: string;
    equity: number;
    yield: number;
    cash: number;
    stockValue: number;
}

export interface LeaderboardStats {
    totalPlayers: number;
    averageYield: number;
    totalMarketCap: number;
    topYieldingStocks: { symbol: string; name: string; yield: number }[];
}

export interface LeaderboardData {
    list: LeaderboardUser[];
    stats: LeaderboardStats;
    updatedAt: string;
}

export function useLeaderboard() {
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const rankingsRef = ref(rtdb, 'rankings');

        const unsubscribe = onValue(rankingsRef, (snapshot) => {
            if (snapshot.exists()) {
                setData(snapshot.val());
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching leaderboard:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { data, loading };
}
