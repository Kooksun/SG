"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { Stock } from "@/types";
import TradeModal from "./TradeModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist";

export default function StockList() {
    const { user } = useAuth();
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [watchlist, setWatchlist] = useState<string[]>([]);
    const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
    const [userBalance, setUserBalance] = useState(0);
    const [userCreditLimit, setUserCreditLimit] = useState(0);
    const [userUsedCredit, setUserUsedCredit] = useState(0);
    const [portfolio, setPortfolio] = useState<Record<string, number>>({});
    // New UI states
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'price' | 'change' | 'name'>('price');
    const [sortDesc, setSortDesc] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);



    useEffect(() => {
        const stocksRef = ref(rtdb, 'stocks');
        const unsubscribe = onValue(stocksRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                setStocks([]);
                return;
            }

            const stockData: Stock[] = Object.values(data);

            // Client-side sorting
            stockData.sort((a, b) => {
                let valA = a[sortField];
                let valB = b[sortField];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sortDesc ? 1 : -1;
                if (valA > valB) return sortDesc ? -1 : 1;
                return 0;
            });

            // Determine newest update time
            let newest: Date | null = null;
            stockData.forEach(stock => {
                let stockDate: Date | null = null;
                if (stock.updatedAt) {
                    if (typeof stock.updatedAt === 'string') {
                        stockDate = new Date(stock.updatedAt);
                    } else if (typeof stock.updatedAt.toDate === 'function') {
                        stockDate = stock.updatedAt.toDate();
                    }
                }

                if (stockDate && (!newest || stockDate > newest)) {
                    newest = stockDate;
                }
            });

            setStocks(stockData);
            setLastUpdated(newest);
        });

        return () => unsubscribe();
    }, [sortField, sortDesc]);

    useEffect(() => {
        if (!user) {
            setUserBalance(0);
            setUserCreditLimit(0);
            setUserUsedCredit(0);
            setPortfolio({});
            return;
        }
        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setWatchlist(data.watchlist || []);
                setUserBalance(data.balance || 0);
                setUserCreditLimit(data.creditLimit || 0);
                setUserUsedCredit(data.usedCredit || 0);
            }
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) {
            setPortfolio({});
            return;
        }
        const unsubscribe = onSnapshot(collection(db, "users", user.uid, "portfolio"), (snapshot) => {
            const portfolioMap: Record<string, number> = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                portfolioMap[data.symbol] = data.quantity;
            });
            setPortfolio(portfolioMap);
        });
        return () => unsubscribe();
    }, [user]);

    const toggleWatchlist = async (e: React.MouseEvent, symbol: string) => {
        e.stopPropagation();
        if (!user) return;

        if (watchlist.includes(symbol)) {
            await removeFromWatchlist(user.uid, symbol);
        } else {
            await addToWatchlist(user.uid, symbol);
        }
    };

    const displayedStocks = showWatchlistOnly
        ? stocks.filter(s => watchlist.includes(s.symbol))
        : stocks;
    // Apply search filter (case‑insensitive)
    const filteredStocks = displayedStocks.filter(s =>
        s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSort = (field: 'price' | 'change' | 'name') => {
        if (sortField === field) {
            setSortDesc(!sortDesc);
        } else {
            setSortField(field);
            setSortDesc(true);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            {/* Controls: Search + Last updated */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                    type="text"
                    placeholder="검색 (심볼·이름)"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="px-3 py-2 rounded bg-gray-700 text-white focus:outline-none flex-1"
                />
                <div className="text-sm text-gray-400 text-right sm:w-48">
                    최종 갱신: {lastUpdated ? lastUpdated.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                    }) : "-"}
                </div>
            </div>

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Market Watch</h2>
                {user && (
                    <button
                        onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                        className={`px-3 py-1 rounded text-sm ${showWatchlistOnly ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300"}`}
                    >
                        {showWatchlistOnly ? "Show All" : "Show Watchlist"}
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2 w-10"></th>
                            <th className="py-2">Symbol</th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('name')}>
                                Name{sortField === 'name' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('price')}>
                                Price{sortField === 'price' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                            <th className="py-2 cursor-pointer select-none" onClick={() => handleSort('change')}>
                                Change{sortField === 'change' && (sortDesc ? " ↓" : " ↑")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStocks.map((stock) => (
                            <tr key={stock.symbol} className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer" onClick={() => {
                                if (!user) return; // Don't open modal if not logged in
                                setSelectedStock(stock);
                                setIsModalOpen(true);
                            }}>
                                <td className="py-2 text-center">
                                    {user && (
                                        <button
                                            onClick={(e) => toggleWatchlist(e, stock.symbol)}
                                            className={`text-xl ${watchlist.includes(stock.symbol) ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
                                        >
                                            ★
                                        </button>
                                    )}
                                </td>
                                <td className="py-2">{stock.symbol}</td>
                                <td className="py-2">{stock.name}</td>
                                <td className="py-2">{stock.price.toLocaleString()} KRW</td>
                                <td className={`py-2 ${stock.change >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                    {stock.change > 0 ? "+" : ""}{stock.change.toLocaleString()} ({stock.change_percent.toFixed(2)}%)
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selectedStock && (
                <TradeModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    stock={selectedStock}
                    balance={userBalance}
                    creditLimit={userCreditLimit}
                    usedCredit={userUsedCredit}
                    holdingQuantity={portfolio[selectedStock.symbol] || 0}
                />
            )}
        </div >
    );
}
