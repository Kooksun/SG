"use client";

import { useEffect, useState, useRef } from "react";
import { Stock } from "@/types";
import { buyStock, sellStock } from "@/lib/trade";
import { useAuth } from "@/lib/hooks/useAuth";
import { ref, onValue, get, child } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';

interface TradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    stock: Stock;
    balance?: number;
    creditLimit?: number;
    usedCredit?: number;
    holdingQuantity?: number;
}

export default function TradeModal({ isOpen, onClose, stock, balance = 0, creditLimit = 0, usedCredit = 0, holdingQuantity = 0 }: TradeModalProps) {
    const { user } = useAuth();
    const [quantity, setQuantity] = useState(1);
    const [mode, setMode] = useState<"BUY" | "SELL">("BUY");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [exchangeRate, setExchangeRate] = useState(1400);

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        const rateRef = ref(rtdb, 'system/exchange_rate');
        const unsubscribe = onValue(rateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setExchangeRate(data);
        });
        return () => unsubscribe();
    }, []);

    // Fetch History
    useEffect(() => {
        if (!isOpen || !stock.symbol) return;

        const fetchHistory = async () => {
            try {
                const snapshot = await get(child(ref(rtdb), `stock_history/${stock.symbol}`));
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (Array.isArray(data) && chartRef.current && seriesRef.current) {
                        // Sort just in case
                        const sortedData = data.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
                        seriesRef.current.setData(sortedData);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch history:", e);
            }
        };

        fetchHistory();
    }, [isOpen, stock.symbol]);

    // Initialize Chart
    useEffect(() => {
        if (!isOpen || !chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#1f2937' }, // gray-800
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            grid: {
                vertLines: { color: '#374151' },
                horzLines: { color: '#374151' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 300,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#ef4444', // red-500
            downColor: '#3b82f6', // blue-500
            borderVisible: false,
            wickUpColor: '#ef4444',
            wickDownColor: '#3b82f6',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [isOpen]);

    // Real-time update on chart
    useEffect(() => {
        if (!seriesRef.current || !stock) return;

        // Current price update
        // We need to construct a candle. 
        // Since we only have 'price' (current), getting Open/High/Low for "today" is tricky from just realtime snapshot 
        // without keeping track of session O/H/L.
        // However, we can just update the Close of the last candle if it matches today's date, 
        // or append a new one if it's a new day.

        // For simplicity: We update the candle for "today".
        // Assuming the backend history job runs once a day, the history data might be "up to yesterday".
        // Use 'updated_at' or current client time to determine 'today'.
        const today = new Date().toISOString().split('T')[0];

        // Construct a pseudo-candle for today using current price
        // ideally we need open, high, low too. 
        // If we don't have them, we might just show flat candle or approximated.
        // Or we just don't update chart in realtime for this MVP if it's too complex without O/H/L data.
        // BUT, user asked for it.

        // Strategy: 
        // 1. Get last candle from series (not easily accessible via API efficiently without tracking).
        // 2. Just update with: time: today, close: price, open: price (if new), high: max(price), low: min(price).
        // Too complex for frontend only without proper O/H/L stream.

        // Simplified Strategy:
        // Use the current price as Close. For O/H/L, if we don't have them, use Price.
        // This will look like a flat line moving up/down.
        seriesRef.current.update({
            time: today,
            open: stock.price,
            high: stock.price,
            low: stock.price,
            close: stock.price
        });

    }, [stock.price]);

    const isUS = stock.currency === 'USD';
    // Effective price in KRW. For US stocks, convert and floor. For KR stocks, use as is.
    const effectivePrice = isUS ? Math.floor(stock.price * exchangeRate) : stock.price;

    // Calculate max quantity based on mode
    const availableCredit = Math.max(0, creditLimit - usedCredit);
    const totalBuyingPower = balance + availableCredit;
    const maxQuantity = mode === "BUY"
        ? Math.floor(totalBuyingPower / effectivePrice)
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

    const amount = effectivePrice * quantity;
    const fee = mode === "SELL" ? Math.floor(amount * 0.0005) : 0;
    const total = mode === "BUY" ? amount : amount - fee;

    const handleTrade = async () => {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            if (mode === "BUY") {
                if (amount > totalBuyingPower) {
                    throw new Error("Insufficient funds");
                }
                // Pass effectivePrice (KRW) to buyStock
                await buyStock(user.uid, stock.symbol, stock.name, effectivePrice, quantity);
            } else {
                if (quantity > holdingQuantity) {
                    throw new Error("Insufficient shares");
                }
                // Pass effectivePrice (KRW) to sellStock
                await sellStock(user.uid, stock.symbol, effectivePrice, quantity);
            }
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-sm md:max-w-6xl md:w-auto text-white shadow-xl flex flex-col max-h-[90vh] overflow-y-auto md:overflow-visible">
                <h2 className="text-xl font-bold mb-4 flex items-center border-b border-gray-700 pb-4 shrink-0">
                    {stock.name} <span className="text-gray-400 text-sm ml-2 font-normal">({stock.symbol})</span>
                    <a
                        href={`https://www.google.com/finance/quote/${stock.symbol}:${isUS ? "NASDAQ" : "KRX"}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-blue-400 font-normal transition-colors"
                    >
                        More Info
                    </a>
                </h2>

                <div className="flex flex-col md:flex-row md:gap-8">
                    {/* Chart Column */}
                    <div className="w-full md:w-[600px] mb-6 md:mb-0 shrink-0">
                        <div ref={chartContainerRef} className="w-full h-[300px] md:h-[450px] bg-gray-900 rounded border border-gray-700 overflow-hidden" />
                    </div>

                    {/* Trade UI Column */}
                    <div className="w-full md:w-80 flex flex-col">
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

                        <div className="space-y-4 flex-1">
                            <div>
                                <label className="block text-sm text-gray-400">Price</label>
                                <div className="text-lg font-bold">
                                    {isUS ? (
                                        <>
                                            ${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            <span className="text-sm text-gray-400 ml-2">
                                                (≈ {effectivePrice.toLocaleString()} KRW)
                                            </span>
                                        </>
                                    ) : (
                                        `${stock.price.toLocaleString()} KRW`
                                    )}
                                </div>
                                {isUS && (
                                    <div className="text-xs text-gray-500">
                                        Exchange Rate: 1 USD = {exchangeRate.toLocaleString()} KRW
                                    </div>
                                )}
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
                                            ? `${balance.toLocaleString()} KRW (Cash) + ${availableCredit.toLocaleString()} KRW (Credit)`
                                            : `${holdingQuantity} Shares`}
                                    </span>
                                </div>
                                {mode === "BUY" && amount > balance && (
                                    <div className="mt-2 p-2 bg-yellow-900 border border-yellow-600 rounded text-sm text-yellow-200">
                                        ⚠️ Credit will be used: {(amount - balance).toLocaleString()} KRW
                                    </div>
                                )}
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
                                disabled={loading || quantity <= 0 || (mode === "BUY" && amount > totalBuyingPower) || (mode === "SELL" && quantity > holdingQuantity)}
                                className={`flex-1 py-2 rounded ${mode === "BUY" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {loading ? "Processing..." : mode}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
