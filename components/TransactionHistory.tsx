"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";

interface Transaction {
    id: string;
    symbol: string;
    type: "BUY" | "SELL";
    price: number;
    quantity: number;
    amount: number;
    fee?: number;
    profit?: number;
    timestamp: Timestamp;
}

export default function TransactionHistory({ uid }: { uid: string }) {
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
                            <th className="py-2">Symbol</th>
                            <th className="py-2">Type</th>
                            <th className="py-2">Price</th>
                            <th className="py-2">Qty</th>
                            <th className="py-2">Amount</th>
                            <th className="py-2">Fee</th>
                            <th className="py-2">Profit/Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((tx) => (
                            <tr key={tx.id} className="border-b border-gray-700 hover:bg-gray-700">
                                <td className="py-2">
                                    {tx.timestamp?.toDate().toLocaleString()}
                                </td>
                                <td className="py-2">{tx.symbol}</td>
                                <td className={`py-2 font-bold ${tx.type === "BUY" ? "text-red-400" : "text-blue-400"}`}>
                                    {tx.type}
                                </td>
                                <td className="py-2">{tx.price.toLocaleString()}</td>
                                <td className="py-2">{tx.quantity}</td>
                                <td className="py-2">{tx.amount.toLocaleString()}</td>
                                <td className="py-2 text-gray-400">
                                    {tx.fee ? tx.fee.toLocaleString() : "0"}
                                </td>
                                <td className={`py-2 ${tx.profit && tx.profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
                                    {tx.type === "SELL" && tx.profit !== undefined ? tx.profit.toLocaleString() : "-"}
                                </td>
                            </tr>
                        ))}
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
