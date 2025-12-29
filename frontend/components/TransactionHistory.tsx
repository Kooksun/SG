"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";
import { Stock } from "@/types";

interface Transaction {
    id: string;
    symbol?: string;
    name?: string;
    type: "BUY" | "SELL" | "SHORT" | "COVER" | "REWARD";
    price?: number;
    quantity?: number;
    amount?: number;
    points?: number;
    fee?: number;
    profit?: number;
    timestamp: Timestamp;
}

export default function TransactionHistory({
    uid,
    stocks
}: {
    uid: string;
    stocks?: Record<string, Stock>;
}) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, "transactions"),
            where("uid", "==", uid),
            orderBy("timestamp", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Transaction[] = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() } as Transaction);
            });
            setTransactions(data);
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching transactions in TransactionHistory:", error);
            }
        });

        return () => unsubscribe();
    }, [uid]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">Transaction History</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-gray-300">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="py-2">Time</th>
                            <th className="py-2">Symbol / Name</th>
                            <th className="py-2">Type</th>
                            <th className="py-2">Price</th>
                            <th className="py-2">Qty</th>
                            <th className="py-2">Amount</th>
                            <th className="py-2">Fee</th>
                            <th className="py-2">Profit/Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((tx) => {
                            const stockName = tx.symbol ? (stocks?.[tx.symbol]?.name || tx.name) : tx.name;

                            return (
                                <tr key={tx.id} className="border-b border-gray-700 hover:bg-gray-700">
                                    <td className="py-2">
                                        {tx.timestamp?.toDate().toLocaleString() || "-"}
                                    </td>
                                    <td className="py-2">
                                        {tx.symbol && (
                                            <div className="font-semibold text-white">{tx.symbol}</div>
                                        )}
                                        {stockName && (
                                            <div className="text-xs text-gray-400">{stockName}</div>
                                        )}
                                    </td>
                                    <td className={`py-2 font-bold ${tx.type === "BUY" ? "text-red-400" :
                                        tx.type === "SHORT" ? "text-purple-400" :
                                            tx.type === "COVER" ? "text-orange-400" :
                                                tx.type === "REWARD" ? "text-yellow-400" :
                                                    "text-blue-400" // SELL
                                        }`}>
                                        {tx.type}
                                    </td>
                                    <td className="py-2">
                                        {tx.price !== undefined ? tx.price.toLocaleString() : "-"}
                                    </td>
                                    <td className="py-2">
                                        {tx.quantity !== undefined ? tx.quantity : "-"}
                                    </td>
                                    <td className="py-2">
                                        {tx.amount !== undefined ? tx.amount.toLocaleString() :
                                            tx.points !== undefined ? `${tx.points.toLocaleString()} P` : "-"}
                                    </td>
                                    <td className="py-2 text-gray-400">
                                        {tx.fee !== undefined ? tx.fee.toLocaleString() : "-"}
                                    </td>
                                    <td className={`py-2 ${tx.profit && tx.profit > 0 ? "text-red-400" : tx.profit && tx.profit < 0 ? "text-blue-400" : "text-gray-500"}`}>
                                        {tx.profit !== undefined && tx.profit !== 0 ? tx.profit.toLocaleString() : "-"}
                                    </td>
                                </tr>
                            );
                        })}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={8} className="py-4 text-center text-gray-500">
                                    No transactions yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
