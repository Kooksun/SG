"use client";

import { useEffect, useState, useRef } from "react";
import { Stock } from "@/types";
import { buyStock, sellStock, placeLimitOrder } from "@/lib/trade";
import { useAuth } from "@/lib/hooks/useAuth";
import { ref, onValue, get, child } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';

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
    const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
    const [limitPrice, setLimitPrice] = useState(0);

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInfoRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const ma5SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const ma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
                const { data, error } = await supabase
                    .from('stock_history')
                    .select('time, open, high, low, close, volume')
                    .eq('symbol', stock.symbol)
                    .order('time', { ascending: true });

                if (error) throw error;

                if (data && data.length > 0 && chartRef.current && seriesRef.current && volumeSeriesRef.current && ma5SeriesRef.current && ma20SeriesRef.current) {
                    const candlestickData = data.map(d => ({
                        time: d.time,
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close
                    }));

                    seriesRef.current.setData(candlestickData);

                    volumeSeriesRef.current.setData(data.map(d => ({
                        time: d.time,
                        value: d.volume,
                        color: d.close >= d.open ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)'
                    })));

                    // Calculate Moving Averages
                    const calculateMA = (period: number) => {
                        return data.map((d, i) => {
                            if (i < period - 1) return null;
                            const sum = data.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
                            return { time: d.time, value: sum / period };
                        }).filter(d => d !== null) as { time: string, value: number }[];
                    };

                    ma5SeriesRef.current.setData(calculateMA(5));
                    ma20SeriesRef.current.setData(calculateMA(20));
                }
            } catch (e) {
                console.error("Failed to fetch history from Supabase:", e);
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
            lastValueVisible: false, // Remove last price label
            priceLineVisible: false, // Remove price line
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // set as overlay
            lastValueVisible: false, // Remove last volume label
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });

        const ma5Series = chart.addSeries(LineSeries, {
            color: '#eab308', // yellow-500
            lineWidth: 1,
            lastValueVisible: false, // Remove MA5 label
            priceLineVisible: false,
        });

        const ma20Series = chart.addSeries(LineSeries, {
            color: '#ec4899', // pink-500
            lineWidth: 1,
            lastValueVisible: false, // Remove MA20 label
            priceLineVisible: false,
        });

        // Legend implementation - Move OUTSIDE to chartInfoRef
        const legend = chartInfoRef.current;
        if (!legend) return;

        const setLegendText = (data: any) => {
            const dateStr = data.time.toString();
            const volume = data.volume !== undefined ? data.volume : (data.value || 0);
            const isKR = stock.currency === 'KRW';

            // Format volume (e.g., 1.2M, 500K)
            const formatVol = (v: number) => {
                if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
                if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
                return v.toLocaleString();
            };

            const formatPrice = (p: number) => {
                return isKR ? Math.floor(p).toLocaleString() : p.toLocaleString(undefined, { minimumFractionDigits: 2 });
            };

            const colorClass = data.close >= data.open ? 'text-red-400' : 'text-blue-400';

            legend.innerHTML = `
                <div class="flex items-center justify-between w-full border-b border-gray-700 pb-1 mb-1">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-400 font-mono">${dateStr}</span>
                        ${data.ma5 ? `<span class="text-[10px] text-yellow-500 whitespace-nowrap">MA5: ${formatPrice(data.ma5)}</span>` : ''}
                        ${data.ma20 ? `<span class="text-[10px] text-pink-500 whitespace-nowrap">MA20: ${formatPrice(data.ma20)}</span>` : ''}
                    </div>
                    <div class="text-emerald-400 font-bold ml-2">Vol: ${formatVol(volume)}</div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-[10px] md:text-sm font-mono">
                    <div class="flex flex-col"><span class="text-gray-500 text-[8px] md:text-[10px]">OPEN</span><span class="${colorClass}">${formatPrice(data.open)}</span></div>
                    <div class="flex flex-col"><span class="text-gray-500 text-[8px] md:text-[10px]">HIGH</span><span class="${colorClass}">${formatPrice(data.high)}</span></div>
                    <div class="flex flex-col"><span class="text-gray-500 text-[8px] md:text-[10px]">LOW</span><span class="${colorClass}">${formatPrice(data.low)}</span></div>
                    <div class="flex flex-col"><span class="text-gray-500 text-[8px] md:text-[10px]">CLOSE</span><span class="${colorClass}">${formatPrice(data.close)}</span></div>
                </div>
            `;
        };

        chart.subscribeCrosshairMove(param => {
            if (
                param.point === undefined ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > chartContainerRef.current!.clientWidth ||
                param.point.y < 0 ||
                param.point.y > chartContainerRef.current!.clientHeight
            ) {
                return;
            }

            const candle = param.seriesData.get(candlestickSeries) as any;
            const vol = param.seriesData.get(volumeSeries) as any;
            const ma5 = param.seriesData.get(ma5Series) as any;
            const ma20 = param.seriesData.get(ma20Series) as any;

            if (candle && vol) {
                setLegendText({
                    ...candle,
                    volume: vol.value,
                    ma5: ma5?.value,
                    ma20: ma20?.value
                });
            }
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries as ISeriesApi<"Candlestick">;
        volumeSeriesRef.current = volumeSeries as ISeriesApi<"Histogram">;
        ma5SeriesRef.current = ma5Series as ISeriesApi<"Line">;
        ma20SeriesRef.current = ma20Series as ISeriesApi<"Line">;

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

        if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
                time: today,
                value: 0, // We don't have realtime volume streaming yet
            });
        }

    }, [stock.price]);

    const isUS = stock.currency === 'USD';
    // Effective price in KRW. For US stocks, convert and floor. For KR stocks, use as is.
    const effectivePrice = isUS ? Math.floor(stock.price * exchangeRate) : stock.price;

    // Calculate max quantity based on mode
    const availableCredit = Math.max(0, creditLimit - usedCredit);
    const totalBuyingPower = balance + availableCredit;

    // For selling/shorting: you can sell what you own + what you can short with credit
    const maxShortable = Math.floor(availableCredit / effectivePrice);
    const maxSellQuantity = Math.max(0, holdingQuantity) + maxShortable;

    const maxQuantity = mode === "BUY"
        ? Math.floor(totalBuyingPower / effectivePrice)
        : maxSellQuantity;

    useEffect(() => {
        if (isOpen) {
            setQuantity(1);
            setOrderType("MARKET");
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

    const isShorting = mode === "SELL" && quantity > Math.max(0, holdingQuantity);
    const isCovering = mode === "BUY" && holdingQuantity < 0;

    const handleTrade = async () => {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            if (orderType === "MARKET") {
                if (mode === "BUY") {
                    await buyStock(user.uid, stock.symbol, stock.name, effectivePrice, quantity);
                } else {
                    await sellStock(user.uid, stock.symbol, stock.name, effectivePrice, quantity);
                }
            } else {
                await placeLimitOrder(user.uid, stock.symbol, stock.name, mode, limitPrice, quantity);
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
                        href={`https://www.google.com/finance/quote/${stock.symbol}:${stock.market || (isUS ? "NASDAQ" : "KRX")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-blue-400 font-normal transition-colors"
                    >
                        More Info
                    </a>
                </h2>

                <div className="flex flex-col md:flex-row md:gap-8">
                    {/* Chart Column */}
                    <div className="w-full md:w-[600px] mb-6 md:mb-0 shrink-0 flex flex-col gap-2">
                        <div ref={chartContainerRef} className="w-full h-[300px] md:h-[450px] bg-gray-900 rounded border border-gray-700 overflow-hidden relative" />
                        <div ref={chartInfoRef} className="min-h-[60px] bg-gray-900/50 p-2 rounded border border-gray-700 text-xs text-gray-400 flex flex-col justify-center">
                            차트 위에 마우스를 올리면 상세 정보를 확인할 수 있습니다.
                        </div>
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

                        <div className="flex gap-2 mb-4 bg-gray-900 p-1 rounded">
                            <button
                                onClick={() => setOrderType("MARKET")}
                                className={`flex-1 py-1 text-sm rounded ${orderType === "MARKET" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                Market
                            </button>
                            <button
                                onClick={() => {
                                    setOrderType("LIMIT");
                                    setLimitPrice(effectivePrice);
                                }}
                                className={`flex-1 py-1 text-sm rounded ${orderType === "LIMIT" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                Limit
                            </button>
                        </div>

                        <div className="space-y-4 flex-1">
                            <div>
                                <label className="block text-sm text-gray-400">{orderType === "MARKET" ? "Current Price" : "Target Price"}</label>
                                {orderType === "MARKET" ? (
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
                                ) : (
                                    <div className="flex flex-col gap-1 mt-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={limitPrice}
                                                onChange={(e) => setLimitPrice(parseInt(e.target.value) || 0)}
                                                className="w-full bg-gray-700 rounded p-2 text-white font-bold"
                                            />
                                            <span className="text-sm">KRW</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Current: {effectivePrice.toLocaleString()} KRW
                                        </div>
                                    </div>
                                )}
                                {isUS && orderType === "MARKET" && (
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
                                            : holdingQuantity > 0
                                                ? `${holdingQuantity} Shares owned + ${maxShortable} Shortable`
                                                : holdingQuantity < 0
                                                    ? `Shorting ${Math.abs(holdingQuantity)} Shares + ${maxShortable} Shortable`
                                                    : `${maxShortable} Shortable`}
                                    </span>
                                </div>
                                {mode === "BUY" && isCovering && (
                                    <div className="mt-2 p-2 bg-blue-900 border border-blue-600 rounded text-sm text-blue-200">
                                        ℹ️ This will cover your short position.
                                    </div>
                                )}
                                {mode === "BUY" && !isCovering && amount > balance && (
                                    <div className="mt-2 p-2 bg-yellow-900 border border-yellow-600 rounded text-sm text-yellow-200">
                                        ⚠️ Credit will be used: {(amount - balance).toLocaleString()} KRW
                                    </div>
                                )}
                                {mode === "SELL" && isShorting && (
                                    <div className="mt-2 p-2 bg-purple-900 border border-purple-600 rounded text-sm text-purple-200">
                                        ⚠️ This is a short sell. Margin will be used: {amount.toLocaleString()} KRW
                                    </div>
                                )}
                                {orderType === "LIMIT" && (
                                    (mode === "BUY" && limitPrice >= effectivePrice) || (mode === "SELL" && limitPrice <= effectivePrice)
                                ) && (
                                        <div className="mt-2 p-2 bg-orange-900 border border-orange-600 rounded text-sm text-orange-200">
                                            ⚠️ Current price satisfies your limit. This order will likely execute immediately.
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
                                disabled={loading || quantity <= 0 || (mode === "BUY" && amount > totalBuyingPower) || (mode === "SELL" && quantity > maxSellQuantity)}
                                className={`flex-1 py-2 rounded ${mode === "BUY" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {loading ? "Processing..." : orderType === "LIMIT" ? "Limit Order" : isShorting ? "Short" : isCovering ? "Buy to Cover" : mode}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
