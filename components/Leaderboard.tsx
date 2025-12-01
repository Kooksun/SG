"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, onSnapshot, query, orderBy, limit, updateDoc, doc, collectionGroup } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
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
    const [globalHoldings, setGlobalHoldings] = useState<Record<string, number>>({});
    const [globalChartMetric, setGlobalChartMetric] = useState<"value" | "quantity">("value");
    const [exchangeRate, setExchangeRate] = useState(1400);
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
        const stocksRef = ref(rtdb, 'stocks');
        const unsubscribe = onValue(stocksRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setStocks(data);
            } else {
                setStocks({});
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const rateRef = ref(rtdb, 'system/exchange_rate');
        const unsubscribe = onValue(rateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setExchangeRate(data);
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

    useEffect(() => {
        const unsubscribe = onSnapshot(collectionGroup(db, "portfolio"), (snapshot) => {
            const quantityMap: Record<string, number> = {};
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const symbol = data.symbol;
                const quantity = data.quantity;
                if (!symbol || typeof quantity !== "number" || quantity <= 0) return;
                quantityMap[symbol] = (quantityMap[symbol] || 0) + quantity;
            });
            setGlobalHoldings(quantityMap);
        });
        return () => unsubscribe();
    }, []);

    const leaderboardEntries = users
        .map((user) => {
            const holdings = portfolios[user.uid] || [];
            const holdingsValue = holdings.reduce((total, item) => {
                const stock = stocks[item.symbol];
                if (!stock) return total;
                const price = stock.currency === 'USD' ? stock.price * exchangeRate : stock.price;
                return total + price * item.quantity;
            }, 0);
            const usedCredit = typeof user.usedCredit === "number" ? user.usedCredit : 0;
            const totalAssets = user.balance + holdingsValue;
            const equity = totalAssets - usedCredit; // net assets after accounting for borrowed credit
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

    const globalSlices = useMemo(() => {
        const entries = Object.entries(globalHoldings)
            .map(([symbol, quantity]) => {
                const stock = stocks[symbol];
                const rawPrice = stock?.price;
                const price = (stock?.currency === 'USD' && rawPrice) ? rawPrice * exchangeRate : rawPrice;
                const value = price ? Math.max(0, quantity * price) : Math.max(0, quantity);
                const label = symbol === "기타" ? "기타" : (stocks[symbol]?.name || symbol);
                return { symbol, quantity, value, label };
            })
            .filter((item) => item.value > 0 || item.quantity > 0)
            .sort((a, b) => {
                const aKey = globalChartMetric === "value" ? a.value : a.quantity;
                const bKey = globalChartMetric === "value" ? b.value : b.quantity;
                return bKey - aKey;
            });

        if (!entries.length) return [];

        const maxSlices = 9;
        const topSlices = entries.slice(0, maxSlices);
        if (entries.length > maxSlices) {
            const othersTotal = entries.slice(maxSlices).reduce((sum, item) => sum + (globalChartMetric === "value" ? item.value : item.quantity), 0);
            topSlices.push({ symbol: "기타", label: "기타", quantity: globalChartMetric === "quantity" ? othersTotal : 0, value: globalChartMetric === "value" ? othersTotal : 0 });
        }
        return topSlices;
    }, [globalHoldings, stocks, globalChartMetric]);

    const totalGlobalAmount = globalSlices.reduce((sum, item) => sum + (globalChartMetric === "value" ? item.value : item.quantity), 0);
    const pieColors = ["#FF6384", "#36A2EB", "#FFCE56", "#F472B6", "#34D399", "#A78BFA", "#FBBF24", "#60A5FA", "#cdf871ff", "#8c85eeff"];

    let pieStyle: CSSProperties | undefined;
    if (totalGlobalAmount > 0 && globalSlices.length) {
        let cumulative = 0;
        const segments = globalSlices.map((slice, idx) => {
            const sliceAmount = globalChartMetric === "value" ? slice.value : slice.quantity;
            const start = (cumulative / totalGlobalAmount) * 100;
            cumulative += sliceAmount;
            const end = (cumulative / totalGlobalAmount) * 100;
            return `${pieColors[idx % pieColors.length]} ${start}% ${end}%`;
        });
        pieStyle = { background: `conic-gradient(${segments.join(", ")})` };
    }

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
                                <td className="py-2">
                                    {user.computedTotalAssets.toLocaleString()} KRW
                                    {user.usedCredit > 0 && (
                                        <span
                                            className="ml-2 cursor-help"
                                            title={`사용 중인 신용: ${user.usedCredit.toLocaleString()} KRW`}
                                        >
                                            💳
                                        </span>
                                    )}
                                </td>
                                <td className={`py-2 ${user.returnPct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                    {user.returnPct >= 0 ? "+" : ""}
                                    {user.returnPct.toFixed(2)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">전체 포트폴리오 비중</h3>
                    <div className="flex gap-2 text-sm">
                        <button
                            onClick={() => setGlobalChartMetric("value")}
                            className={`px-3 py-1 rounded border ${globalChartMetric === "value" ? "bg-blue-600 text-white border-blue-500" : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"}`}
                        >
                            가치 기준
                        </button>
                        <button
                            onClick={() => setGlobalChartMetric("quantity")}
                            className={`px-3 py-1 rounded border ${globalChartMetric === "quantity" ? "bg-blue-600 text-white border-blue-500" : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"}`}
                        >
                            수량 기준
                        </button>
                    </div>
                </div>
                {totalGlobalAmount > 0 ? (
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="w-48 h-48 rounded-full border border-gray-700" style={pieStyle}></div>
                        <div className="flex-1 space-y-2 w-full">
                            {globalSlices.map((slice, idx) => {
                                const sliceAmount = globalChartMetric === "value" ? slice.value : slice.quantity;
                                const percent = (sliceAmount / totalGlobalAmount) * 100;
                                return (
                                    <div
                                        key={`${slice.symbol}-${idx}`}
                                        className="flex items-center justify-between text-sm text-gray-200 bg-gray-700/50 rounded px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-3 h-3 rounded-full"
                                                style={{ backgroundColor: pieColors[idx % pieColors.length] }}
                                            ></span>
                                            <span>{slice.label}</span>
                                        </div>
                                        <div className="text-right">
                                            {globalChartMetric === "value"
                                                ? `${Math.floor(slice.value).toLocaleString()} KRW`
                                                : `${Math.floor(slice.quantity).toLocaleString()}주`}
                                            {` (${percent.toFixed(1)}%)`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-400 text-sm">집계된 포트폴리오 데이터가 없습니다.</p>
                )}
            </div>
        </div>
    );
}
