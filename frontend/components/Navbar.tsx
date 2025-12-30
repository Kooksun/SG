"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth"; // I need to create this hook
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, User, LogOut, TrendingUp } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import Ticker from "./Ticker";

export default function Navbar() {
    const { user } = useAuth();
    const router = useRouter();
    const [hasUnclaimed, setHasUnclaimed] = useState(false);

    useEffect(() => {
        if (!user?.uid) {
            setHasUnclaimed(false);
            return;
        }

        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        const unsubscribe = onSnapshot(doc(db, "users", user.uid, "missions", today), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const missions = docSnapshot.data().missions || [];
                const unclaimed = missions.some((m: any) => m.status === "COMPLETED");
                setHasUnclaimed(unclaimed);
            } else {
                setHasUnclaimed(false);
            }
        }, (error) => {
            if (error.code !== "permission-denied") {
                console.error("Error fetching missions in Navbar:", error);
            }
            setHasUnclaimed(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const handleLogout = async () => {
        await signOut(auth);
        router.push("/");
    };

    return (
        <nav className="bg-gray-900 border-b border-gray-800 text-white p-3 sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
            <div className="container mx-auto flex justify-between items-center px-4">
                <Link href="/" className="text-xl font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-2 flex-shrink-0">
                    <TrendingUp size={24} className="text-emerald-400" />
                    StockGame v2
                </Link>

                <Ticker />

                <div className="flex gap-2 items-center flex-shrink-0">
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:bg-gray-800 text-gray-300 hover:text-white"
                    >
                        <LayoutDashboard size={18} />
                        <span>Dashboard</span>
                    </Link>
                    {user && (
                        <>
                            <Link
                                href={`/user?uid=${user.uid}`}
                                className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:bg-gray-800 text-gray-300 hover:text-white"
                            >
                                <User size={18} />
                                <span>My Page</span>
                                {hasUnclaimed && (
                                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-900 animate-pulse"></span>
                                )}
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20"
                            >
                                <LogOut size={16} />
                                Logout
                            </button>
                        </>
                    )}
                    {!user && (
                        <Link href="/login" className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700">
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
