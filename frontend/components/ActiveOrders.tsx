"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, deleteDoc, doc, orderBy } from "firebase/firestore";

import { Stock } from "@/types";

interface Order {
    id: string;
    symbol: string;
    name: string;
    type: "BUY" | "SELL";
    targetPrice: number;
    quantity: number;
    status: "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";
    timestamp: any;
}

interface ActiveOrdersProps {
    stocks?: Record<string, Stock>;
    exchangeRate?: number;
}

export default function ActiveOrders({ stocks = {}, exchangeRate = 1400 }: ActiveOrdersProps) {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "active_orders"),
            where("uid", "==", user.uid),
            where("status", "==", "PENDING"),
            orderBy("timestamp", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newOrders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Order));
            setOrders(newOrders);
        });

        return () => unsubscribe();
    }, [user]);

    const handleCancel = async (id: string, orderName: string) => {
        if (!window.confirm(`${orderName} 주문을 취소하시겠습니까?`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, "active_orders", id));
        } catch (e) {
            console.error("Failed to cancel order:", e);
        }
    };

    if (orders.length === 0) return null;

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-6 border-b border-gray-700 pb-3 flex items-center gap-2">
                Pending Limit Orders
                <span className="text-xs font-normal text-gray-500 bg-gray-900 px-2 py-0.5 rounded-full">
                    {orders.length}
                </span>
            </h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left py-2 font-normal">Stock</th>
                            <th className="text-left py-2 font-normal">Type</th>
                            <th className="text-right py-2 font-normal">Current</th>
                            <th className="text-right py-2 font-normal">Target</th>
                            <th className="text-right py-2 font-normal">Qty</th>
                            <th className="text-right py-2 font-normal">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => {
                            const stockInfo = stocks[order.symbol];
                            const isUS = stockInfo?.currency === 'USD';
                            const currentPrice = stockInfo
                                ? (isUS ? Math.floor(stockInfo.price * exchangeRate) : stockInfo.price)
                                : null;
                            const priceChange = stockInfo?.change || 0;

                            return (
                                <tr key={order.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700 transition-colors">
                                    <td className="py-2">
                                        <div className="font-medium">{order.name}</div>
                                        <div className="text-xs text-gray-500">{order.symbol}</div>
                                    </td>
                                    <td className="py-2">
                                        <span className={order.type === "BUY" ? "text-red-400 font-bold" : "text-blue-400 font-bold"}>
                                            {order.type}
                                        </span>
                                    </td>
                                    <td className="text-right py-2 font-mono">
                                        {currentPrice !== null ? (
                                            <span className={priceChange > 0 ? "text-red-500" : priceChange < 0 ? "text-blue-500" : "text-white"}>
                                                {currentPrice.toLocaleString()}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">-</span>
                                        )}
                                    </td>
                                    <td className="text-right py-2 font-mono">
                                        {order.targetPrice.toLocaleString()}
                                    </td>
                                    <td className="text-right py-2">
                                        {order.quantity.toLocaleString()}
                                    </td>
                                    <td className="text-right py-2">
                                        <button
                                            onClick={() => handleCancel(order.id, order.name)}
                                            className="text-gray-400 hover:text-red-400 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

