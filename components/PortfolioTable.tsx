"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Stock } from "@/types";
import TradeModal from "./TradeModal";
import { Timestamp } from "firebase/firestore";

interface PortfolioItem {
    symbol: string;
    name?: string;
    quantity: number;
    averagePrice: number;
    currentPrice: number; // This comes from DB but we should override with realtime
    valuation: number;
}

export default function PortfolioTable({ uid, realtimeStocks, isOwner = false }: { uid: string, realtimeStocks?: Record<string, Stock>, isOwner?: boolean }) {
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "users", uid, "portfolio"), (snapshot) => {
            const items: PortfolioItem[] = [];
            snapshot.forEach((doc) => {
                items.push(doc.data() as PortfolioItem);
            });
            setPortfolio(items);
        });

        return () => unsubscribe();
    }, [uid]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">My Portfolio</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2">Symbol</th>
                            <th className="py-2">Quantity</th>
                            <th className="py-2">Avg Price</th>
                            <th className="py-2">Cur Price</th>
                            <th className="py-2">Valuation</th>
                            <th className="py-2">Profit/Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {portfolio.map((item) => {
                            // Use realtime price if available, otherwise fallback to item.currentPrice (stale)
                            const currentPrice = realtimeStocks && realtimeStocks[item.symbol]
                                ? realtimeStocks[item.symbol].price
                                : item.currentPrice;

                            const valuation = currentPrice * item.quantity;
                            const profit = valuation - (item.averagePrice * item.quantity);
                            const profitPercent = (profit / (item.averagePrice * item.quantity)) * 100;

                            return (
                                <tr
                                    key={item.symbol}
                                    className={`border-b border-gray-700 ${isOwner ? "hover:bg-gray-700 cursor-pointer" : ""}`}
                                    onClick={() => {
                                        if (!isOwner) return;
                                        const stock: Stock = {
                                            symbol: item.symbol,
                                            name: item.name || item.symbol,
                                            price: currentPrice,
                                            change: 0,
                                            change_percent: 0,
                                            updatedAt: Timestamp.now()
                                        };
                                        setSelectedStock(stock);
                                        setIsModalOpen(true);
                                    }}
                                >
                                    <td className="py-2">{item.symbol}</td>
                                    <td className="py-2">{item.quantity}</td>
                                    <td className="py-2">{item.averagePrice.toLocaleString()}</td>
                                    <td className="py-2">{currentPrice.toLocaleString()}</td>
                                    <td className="py-2">{valuation.toLocaleString()}</td>
                                    <td className={`py-2 ${profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                        {profit.toLocaleString()} ({profitPercent.toFixed(2)}%)
                                    </td>
                                </tr>
                            );
                        })}
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
        </div>
    );
}
