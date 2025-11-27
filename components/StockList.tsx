"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
    // New UI states
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'price' | 'change' | 'name'>('price');
    const [sortDesc, setSortDesc] = useState(true);



    useEffect(() => {
        // Build query based on sort options and increased limit
        const orderDirection = sortDesc ? "desc" : "asc";
        const q = query(
            collection(db, "stocks"),
            orderBy(sortField, orderDirection),
            limit(200)
        ); // Show up to 200 stocks based on selected sort
        // User said "Main screen shows major stocks".
        // Updated to allow sorting and larger result set.

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const stockData: Stock[] = [];
            snapshot.forEach((doc) => {
                stockData.push(doc.data() as Stock);
            });
            setStocks(stockData);
        });

        return () => unsubscribe();
    }, [sortField, sortDesc]);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                setWatchlist(doc.data().watchlist || []);
            }
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
            {/* Controls: Search */}
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="검색 (심볼·이름)"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="px-3 py-2 rounded bg-gray-700 text-white focus:outline-none"
                />
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
                />
            )}
        </div >
    );
}
