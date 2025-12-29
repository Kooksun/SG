"use client";

import { X } from "lucide-react";
import { UserProfile, Stock } from "@/types";
import { useRouter } from "next/navigation";

interface PortfolioItem {
    symbol: string;
    quantity: number;
    averagePrice?: number;
}

interface StockHoldersModalProps {
    isOpen: boolean;
    onClose: () => void;
    stock: Stock | null;
    symbol: string | null;
    users: UserProfile[];
    portfolios: Record<string, PortfolioItem[]>;
    exchangeRate: number;
}

export default function StockHoldersModal({
    isOpen,
    onClose,
    stock,
    symbol,
    users,
    portfolios,
    exchangeRate,
}: StockHoldersModalProps) {
    const router = useRouter();

    if (!isOpen || !symbol) return null;

    const holders = users
        .map((user) => {
            const portfolio = portfolios[user.uid] || [];
            const item = portfolio.find((p) => p.symbol === symbol);
            if (!item || item.quantity === 0) return null;

            const currentPriceRaw = stock?.price || 0;
            const currentPrice = (stock?.currency === 'USD' ? currentPriceRaw * exchangeRate : currentPriceRaw);
            const avgPriceRaw = item.averagePrice || 0;
            const avgPrice = (stock?.currency === 'USD' ? avgPriceRaw * exchangeRate : avgPriceRaw);

            // Profit calculation
            // For long: (current - avg) * quantity
            // For short: (avg - current) * abs(quantity)
            const isShort = item.quantity < 0;
            const absoluteQuantity = Math.abs(item.quantity);
            const profit = isShort
                ? (avgPrice - currentPrice) * absoluteQuantity
                : (currentPrice - avgPrice) * item.quantity;

            const totalInvestment = avgPrice * absoluteQuantity;
            const returnPct = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;

            return {
                uid: user.uid,
                displayName: user.displayName || "Unknown",
                quantity: item.quantity,
                averagePrice: avgPrice,
                currentPrice,
                profit,
                returnPct,
            };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null)
        .sort((a, b) => Math.abs(b.quantity) - Math.abs(a.quantity));

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm cursor-default"
            onClick={onClose}
        >
            <div
                className="bg-gray-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col max-h-[80vh] cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            Top Holders: {stock?.name || symbol}
                        </h2>
                        <p className="text-sm text-gray-400">
                            Price: {stock?.price.toLocaleString()} {stock?.currency === 'USD' ? 'USD' : 'KRW'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-gray-300">
                        <thead className="sticky top-0 bg-gray-800 z-10">
                            <tr className="border-b border-gray-700">
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Quantity</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Avg Price</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Profit/Loss</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {holders.map((holder) => (
                                <tr
                                    key={holder.uid}
                                    className="hover:bg-gray-700/50 transition-colors cursor-pointer"
                                    onClick={() => {
                                        router.push(`/user?uid=${holder.uid}`);
                                        onClose();
                                    }}
                                >
                                    <td className="p-4 font-medium text-white">
                                        {holder.displayName}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span>{Math.abs(holder.quantity).toLocaleString()}</span>
                                            {holder.quantity < 0 && (
                                                <span className="text-[10px] bg-red-900/50 text-red-400 px-1 rounded">SHORT</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        {Math.floor(holder.averagePrice).toLocaleString()}
                                    </td>
                                    <td className={`p-4 text-right font-medium ${holder.returnPct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                        {holder.returnPct >= 0 ? "+" : ""}
                                        {holder.returnPct.toFixed(2)}%
                                    </td>
                                </tr>
                            ))}
                            {holders.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">
                                        No holders found for this stock.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
