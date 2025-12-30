"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, onSnapshot, updateDoc, doc, collectionGroup } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { auth, db, rtdb } from "@/lib/firebase";
import { UserProfile, Stock } from "@/types";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import RankingHistoryModal from "./RankingHistoryModal";
import StockHoldersModal from "./StockHoldersModal";

interface PortfolioItem {
    symbol: string;
    quantity: number;
    averagePrice?: number;
}

export default function Leaderboard() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});
    const [portfolios, setPortfolios] = useState<Record<string, PortfolioItem[]>>({});
    const [globalHoldingsLong, setGlobalHoldingsLong] = useState<Record<string, number>>({});
    const [globalHoldingsShort, setGlobalHoldingsShort] = useState<Record<string, number>>({});
    const [globalChartMetric, setGlobalChartMetric] = useState<"value" | "quantity">("value");
    const [positionMode, setPositionMode] = useState<"long" | "short">("long");
    const [exchangeRate, setExchangeRate] = useState(1400);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isHoldersModalOpen, setIsHoldersModalOpen] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
    const router = useRouter();

    const userMap = useMemo(() => {
        const map: Record<string, string> = {};
        users.forEach((u) => {
            map[u.uid] = u.displayName || "Unknown";
        });
        return map;
    }, [users]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
            const userData: UserProfile[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() as UserProfile;
                const uid = docSnap.id;
                // Ensure uid is consistent with document ID
                data.uid = uid;

                if (typeof data.startingBalance !== "number") {
                    if (currentUser) {
                        void updateDoc(doc(db, "users", uid), { startingBalance: 500000000 });
                    }
                    data.startingBalance = 500000000;
                }
                // Ensure data.uid is also set if missing from document
                if (!data.uid) data.uid = uid;
                userData.push(data);
            });
            setUsers(userData);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching users in Leaderboard:", error);
            }
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
                        averagePrice: data.averagePrice,
                    });
                });
                setPortfolios((prev) => ({
                    ...prev,
                    [user.uid]: items,
                }));
            }, (error) => {
                if (error.code !== "permission-denied") {
                    console.error(`Error fetching portfolio for ${user.uid} in Leaderboard:`, error);
                }
            })
        );

        return () => {
            unsubscribes.forEach((unsubscribe) => unsubscribe());
        };
    }, [users]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collectionGroup(db, "portfolio"), (snapshot) => {
            const longMap: Record<string, number> = {};
            const shortMap: Record<string, number> = {};
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const symbol = data.symbol;
                const quantity = data.quantity;
                if (!symbol || typeof quantity !== "number" || quantity === 0) return;

                if (quantity > 0) {
                    longMap[symbol] = (longMap[symbol] || 0) + quantity;
                } else {
                    shortMap[symbol] = (shortMap[symbol] || 0) + Math.abs(quantity);
                }
            });
            setGlobalHoldingsLong(longMap);
            setGlobalHoldingsShort(shortMap);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching global portfolio in Leaderboard:", error);
            }
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
                return total + price * item.quantity; // item.quantity is negative for shorts
            }, 0);

            // For short positions, usedCredit includes a liability (margin) equal to the initial sell value.
            // To get net equity, we must add back that margin because 'holdingsValue' already subtracted the current cost to cover.
            // Equity = Cash + LongValue - ShortValue - (TotalUsedCredit - ShortInitialValue)
            // Equity = balance + LongValue - ShortValue - TotalUsedCredit + ShortInitialValue
            const shortInitialValue = holdings.reduce((total, item) => {
                if (item.quantity < 0) {
                    return total + (Math.abs(item.quantity) * (item.averagePrice || 0));
                }
                return total;
            }, 0);

            const usedCredit = typeof user.usedCredit === "number" ? user.usedCredit : 0;

            // totalAssets for display: Cash + LongValue
            const longValue = holdings.reduce((total, item) => {
                if (item.quantity <= 0) return total;
                const stock = stocks[item.symbol];
                if (!stock) return total;
                const price = stock.currency === 'USD' ? stock.price * exchangeRate : stock.price;
                return total + price * item.quantity;
            }, 0);
            const totalAssets = (user.balance - shortInitialValue) + longValue;

            const equity = user.balance + holdingsValue - (usedCredit - shortInitialValue);
            const startingBalance = typeof user.startingBalance === "number" ? user.startingBalance : 500000000;
            const profit = equity - startingBalance;
            const returnPct = startingBalance ? (profit / startingBalance) * 100 : 0;
            return {
                ...user,
                totalAssets,
                equity,
                returnPct,
            };
        })
        .sort((a, b) => b.equity - a.equity)
        .slice(0, 10);

    const globalSlices = useMemo(() => {
        const currentData = positionMode === "long" ? globalHoldingsLong : globalHoldingsShort;
        const entries = Object.entries(currentData)
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
    }, [globalHoldingsLong, globalHoldingsShort, stocks, globalChartMetric, positionMode]);

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
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
                <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-blue-400 rounded-lg transition-all text-sm font-medium border border-gray-600 whitespace-nowrap"
                >
                    <History size={18} />
                    순위 기록 보기
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2">Rank</th>
                            <th className="py-2">User</th>
                            <th className="py-2">Net Assets</th>
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
                                    <div className="flex flex-col">
                                        <span>{user.equity.toLocaleString()} KRW</span>
                                        {user.totalAssets !== user.equity && (
                                            <span
                                                className="text-xs text-gray-400"
                                                title={user.usedCredit > 0 ? `사용 중인 신용: ${user.usedCredit.toLocaleString()} KRW` : undefined}
                                            >
                                                총자산 {user.totalAssets.toLocaleString()} KRW
                                            </span>
                                        )}
                                    </div>
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
                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
                    <h3 className="text-xl font-semibold text-white">전체 포트폴리오 비중</h3>
                    <div className="flex flex-wrap gap-2 text-sm justify-end">
                        {/* Position Mode Toggle */}
                        <div className="flex bg-gray-700 p-1 rounded-lg border border-gray-600">
                            <button
                                onClick={() => setPositionMode("long")}
                                className={`px-3 py-1 rounded-md transition-all ${positionMode === "long" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
                            >
                                Long (매수)
                            </button>
                            <button
                                onClick={() => setPositionMode("short")}
                                className={`px-3 py-1 rounded-md transition-all ${positionMode === "short" ? "bg-red-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
                            >
                                Short (공매도)
                            </button>
                        </div>

                        {/* Metric Toggle */}
                        <div className="flex bg-gray-700 p-1 rounded-lg border border-gray-600">
                            <button
                                onClick={() => setGlobalChartMetric("value")}
                                className={`px-3 py-1 rounded-md transition-all ${globalChartMetric === "value" ? "bg-gray-500 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
                            >
                                가치
                            </button>
                            <button
                                onClick={() => setGlobalChartMetric("quantity")}
                                className={`px-3 py-1 rounded-md transition-all ${globalChartMetric === "quantity" ? "bg-gray-500 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
                            >
                                수량
                            </button>
                        </div>
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
                                        className={`flex items-center justify-between text-sm text-gray-200 bg-gray-700/50 rounded px-3 py-2 ${slice.symbol !== "기타" ? "cursor-pointer hover:bg-gray-600 transition-colors" : ""}`}
                                        onClick={() => {
                                            if (slice.symbol !== "기타") {
                                                setSelectedSymbol(slice.symbol);
                                                setIsHoldersModalOpen(true);
                                            }
                                        }}
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

            <RankingHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                userMap={userMap}
            />

            <StockHoldersModal
                isOpen={isHoldersModalOpen}
                onClose={() => setIsHoldersModalOpen(false)}
                stock={selectedSymbol ? stocks[selectedSymbol] : null}
                symbol={selectedSymbol}
                users={users}
                portfolios={portfolios}
                exchangeRate={exchangeRate}
            />
        </div>
    );
}
