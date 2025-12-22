"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth"; // I need to create this hook
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import MissionModal from "./MissionModal";
import { Gift } from "lucide-react";

export default function Navbar() {
    const { user } = useAuth();
    const router = useRouter();
    const [isMissionOpen, setIsMissionOpen] = useState(false);
    const [hasUnclaimed, setHasUnclaimed] = useState(false);

    useEffect(() => {
        if (!user) return;

        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        const unsubscribe = onSnapshot(doc(db, "users", user.uid, "missions", today), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const missions = docSnapshot.data().missions || [];
                const unclaimed = missions.some((m: any) => m.status === "COMPLETED");
                setHasUnclaimed(unclaimed);
            } else {
                setHasUnclaimed(false);
            }
        });

        return () => unsubscribe();
    }, [user]);

    const handleLogout = async () => {
        await signOut(auth);
        router.push("/login");
    };

    return (
        <nav className="bg-gray-800 text-white p-4">
            <div className="container mx-auto flex justify-between items-center">
                <Link href="/" className="text-xl font-bold">
                    Stock Game v2
                </Link>
                <div className="flex gap-4 items-center">
                    <Link href="/" className="hover:text-gray-300">
                        Dashboard
                    </Link>
                    {user && (
                        <>
                            <button
                                onClick={() => setIsMissionOpen(true)}
                                className="relative flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors"
                            >
                                <Gift size={18} className={hasUnclaimed ? "text-yellow-400 animate-bounce" : "text-gray-400"} />
                                <span className="text-sm font-medium">Missions</span>
                                {hasUnclaimed && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse"></span>
                                )}
                            </button>
                            <Link href={`/user?uid=${user.uid}`} className="hover:text-gray-300">
                                My Page
                            </Link>
                            <button onClick={handleLogout} className="bg-red-600 px-3 py-1 rounded hover:bg-red-700">
                                Logout
                            </button>

                            <MissionModal
                                uid={user.uid}
                                isOpen={isMissionOpen}
                                onClose={() => setIsMissionOpen(false)}
                            />
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
