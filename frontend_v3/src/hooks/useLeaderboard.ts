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
    worstYieldingStocks: { symbol: string; name: string; yield: number }[];
}

export interface LeaderboardData {
    list: LeaderboardUser[];
    stats: LeaderboardStats;
    updatedAt: string;
    seasonEnd: string | null;
}

export function useLeaderboard() {
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const rankingsRef = ref(rtdb, 'rankings');
        const seasonEndRef = ref(rtdb, 'system/season_end');

        let rankingsData: any = null;
        let seasonEndData: string | null = null;

        const updateData = () => {
            if (rankingsData) {
                setData({
                    ...rankingsData,
                    seasonEnd: seasonEndData
                });
            }
        };

        const unsubRankings = onValue(rankingsRef, (snapshot) => {
            if (snapshot.exists()) {
                rankingsData = snapshot.val();
                updateData();
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching leaderboard:", error);
            setLoading(false);
        });

        const unsubSeason = onValue(seasonEndRef, (snapshot) => {
            if (snapshot.exists()) {
                seasonEndData = snapshot.val();
                updateData();
            }
        });

        return () => {
            unsubRankings();
            unsubSeason();
        };
    }, []);

    return { data, loading };
}
