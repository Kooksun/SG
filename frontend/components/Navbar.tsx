"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth"; // I need to create this hook
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Navbar() {
    const { user } = useAuth();
    const router = useRouter();

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
                    {user ? (
                        <>
                            <Link href={`/user?uid=${user.uid}`} className="hover:text-gray-300">
                                My Page
                            </Link>
                            <button onClick={handleLogout} className="bg-red-600 px-3 py-1 rounded hover:bg-red-700">
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link href="/login" className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700">
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
