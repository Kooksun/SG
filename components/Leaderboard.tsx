"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile, Stock } from "@/types";
import { useRouter } from "next/navigation";

interface PortfolioItem {
    symbol: string;
    quantity: number;
}

export default function Leaderboard() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});
    const [portfolios, setPortfolios] = useState<Record<string, PortfolioItem[]>>({});
    const router = useRouter();

    useEffect(() => {
        const q = query(collection(db, "users"), orderBy("totalAssetValue", "desc"), limit(10));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userData: UserProfile[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() as UserProfile;
                if (typeof data.startingBalance !== "number") {
                    void updateDoc(doc(db, "users", data.uid), { startingBalance: 100000000 });
                    data.startingBalance = 100000000;
                }
                userData.push(data);
            });
            setUsers(userData);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "stocks"), (snapshot) => {
            const stockMap: Record<string, Stock> = {};
            snapshot.forEach((doc) => {
                stockMap[doc.id] = doc.data() as Stock;
            });
            setStocks(stockMap);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Remove portfolios for users no longer on the board
        setPortfolios((prev) => {
            const active = new Set(users.map((user) => user.uid));
            const next: Record<string, PortfolioItem[]> = {};
            active.forEach((uid) => {
                if (prev[uid]) next[uid] = prev[uid];
            });
            return next;
        });

        const unsubscribes = users.map((user) =>
            onSnapshot(collection(db, "users", user.uid, "portfolio"), (snapshot) => {
                const items: PortfolioItem[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    items.push({
                        symbol: data.symbol,
                        quantity: data.quantity,
                    });
                });
                setPortfolios((prev) => ({
                    ...prev,
                    [user.uid]: items,
                }));
            })
        );

        return () => {
            unsubscribes.forEach((unsubscribe) => unsubscribe());
        };
    }, [users]);

    const leaderboardEntries = users
        .map((user) => {
            const holdings = portfolios[user.uid] || [];
            const holdingsValue = holdings.reduce((total, item) => {
                const stock = stocks[item.symbol];
                return total + (stock ? stock.price * item.quantity : 0);
            }, 0);
            const totalAssets = user.balance + holdingsValue;
            const equity = totalAssets;
            const startingBalance = typeof user.startingBalance === "number" ? user.startingBalance : 100000000;
            const profit = equity - startingBalance;
            const returnPct = startingBalance ? (profit / startingBalance) * 100 : 0;
            return {
                ...user,
                computedTotalAssets: totalAssets,
                returnPct,
            };
        })
        .sort((a, b) => b.computedTotalAssets - a.computedTotalAssets);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">Leaderboard</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2">Rank</th>
                            <th className="py-2">User</th>
                            <th className="py-2">Total Assets</th>
                            <th className="py-2">Return</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboardEntries.map((user, index) => (
                            <tr
                                key={user.uid}
                                className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer"
                                onClick={() => router.push(`/user?uid=${user.uid}`)}
                            >
                                <td className="py-2">{index + 1}</td>
                                <td className="py-2">{user.displayName}</td>
                                <td className="py-2">{user.computedTotalAssets.toLocaleString()} KRW</td>
                                <td className={`py-2 ${user.returnPct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                    {user.returnPct >= 0 ? "+" : ""}
                                    {user.returnPct.toFixed(2)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
