"use client";

import { useEffect, useState } from "react";
import { Stock } from "@/types";
import { buyStock, sellStock } from "@/lib/trade";
import { useAuth } from "@/lib/hooks/useAuth";

interface TradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    stock: Stock;
    balance?: number;
    holdingQuantity?: number;
}

export default function TradeModal({ isOpen, onClose, stock, balance = 0, holdingQuantity = 0 }: TradeModalProps) {
    const { user } = useAuth();
    const [quantity, setQuantity] = useState(1);
    const [mode, setMode] = useState<"BUY" | "SELL">("BUY");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Calculate max quantity based on mode
    const maxQuantity = mode === "BUY"
        ? Math.floor(balance / stock.price)
        : holdingQuantity;

    useEffect(() => {
        if (isOpen) {
            setQuantity(1);
        }
    }, [isOpen, stock.symbol]);

    // Ensure quantity doesn't exceed max when switching modes
    useEffect(() => {
        if (quantity > maxQuantity && maxQuantity > 0) {
            setQuantity(maxQuantity);
        }
    }, [mode, maxQuantity]);

    if (!isOpen) return null;

    const price = stock.price;
    const amount = price * quantity;
    const fee = mode === "SELL" ? Math.floor(amount * 0.0005) : 0;
    const total = mode === "BUY" ? amount : amount - fee;

    const handleTrade = async () => {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            if (mode === "BUY") {
                if (amount > balance) {
                    throw new Error("Insufficient funds");
                }
                await buyStock(user.uid, stock.symbol, stock.name, price, quantity);
            } else {
                if (quantity > holdingQuantity) {
                    throw new Error("Insufficient shares");
                }
                await sellStock(user.uid, stock.symbol, price, quantity);
            }
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg w-96 text-white">
                <h2 className="text-xl font-bold mb-4">{stock.name} ({stock.symbol})</h2>
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setMode("BUY")}
                        className={`flex-1 py-2 rounded ${mode === "BUY" ? "bg-red-600" : "bg-gray-700"}`}
                    >
                        Buy
                    </button>
                    <button
                        onClick={() => setMode("SELL")}
                        className={`flex-1 py-2 rounded ${mode === "SELL" ? "bg-blue-600" : "bg-gray-700"}`}
                    >
                        Sell
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400">Price</label>
                        <div className="text-lg font-bold">{price.toLocaleString()} KRW</div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400">Quantity</label>
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="number"
                                min="1"
                                max={maxQuantity}
                                value={quantity}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setQuantity(Math.min(val, maxQuantity));
                                }}
                                className="w-full bg-gray-700 rounded p-2 text-white"
                            />
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                Max: {maxQuantity}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max={Math.max(1, maxQuantity)}
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                    <div className="border-t border-gray-700 pt-4">
                        <div className="flex justify-between">
                            <span>Amount</span>
                            <span>{amount.toLocaleString()} KRW</span>
                        </div>
                        {mode === "SELL" && (
                            <div className="flex justify-between text-sm text-gray-400">
                                <span>Fee (0.05%)</span>
                                <span>{fee.toLocaleString()} KRW</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg mt-2">
                            <span>Total</span>
                            <span>{total.toLocaleString()} KRW</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-400 mt-1">
                            <span>Available</span>
                            <span>
                                {mode === "BUY"
                                    ? `${balance.toLocaleString()} KRW`
                                    : `${holdingQuantity} Shares`}
                            </span>
                        </div>
                    </div>
                </div>

                {error && <div className="mt-4 text-red-500 text-sm">{error}</div>}

                <div className="mt-6 flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleTrade}
                        disabled={loading || quantity <= 0 || (mode === "BUY" && amount > balance) || (mode === "SELL" && quantity > holdingQuantity)}
                        className={`flex-1 py-2 rounded ${mode === "BUY" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {loading ? "Processing..." : mode}
                    </button>
                </div>
            </div>
        </div>
    );
}
