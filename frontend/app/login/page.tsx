"use client";

import { useState } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { applyDailyInterestAndAutoLiquidate } from "@/lib/credit";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            if (isSignUp) {
                // Sign Up
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update Display Name
                await updateProfile(user, {
                    displayName: displayName || email.split("@")[0],
                });

                // Create User Document
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    email: user.email,
                    displayName: displayName || email.split("@")[0],
                    balance: 500000000, // 500 Million KRW
                    creditLimit: 500000000, // 500 Million KRW Credit Limit
                    usedCredit: 0, // No credit used initially
                    lastInterestDate: new Date().toISOString().slice(0, 10),
                    totalAssetValue: 500000000,
                    startingBalance: 500000000,
                    createdAt: serverTimestamp(),
                });
            } else {
                // Login
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Check if user has credit fields, if not, initialize them
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const updates: any = {};

                    // Initialize missing credit fields for legacy users
                    if (typeof userData.creditLimit !== "number") {
                        updates.creditLimit = 500000000;
                    }
                    if (typeof userData.usedCredit !== "number") {
                        updates.usedCredit = 0;
                    }
                    if (typeof userData.startingBalance !== "number") {
                        updates.startingBalance = 500000000;
                    }
                    if (!userData.lastInterestDate) {
                        updates.lastInterestDate = new Date().toISOString().slice(0, 10);
                    }

                    // Update if there are any missing fields
                    if (Object.keys(updates).length > 0) {
                        await setDoc(userDocRef, updates, { merge: true });
                    }
                }
            }

            // Apply deferred daily interest and enforce credit limit at login time
            // Logic moved to backend scheduler
            // const currentUid = auth.currentUser?.uid;
            // if (currentUid) {
            //     try {
            //         await applyDailyInterestAndAutoLiquidate(currentUid);
            //     } catch (interestErr) {
            //         console.warn("Interest accrual failed at login", interestErr);
            //     }
            // }

            router.push("/");
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
                <div className="text-center">
                    <h2 className="text-3xl font-bold">Stock Game</h2>
                    <p className="mt-2 text-gray-400">
                        {isSignUp ? "Create an account" : "Sign in to start trading"}
                    </p>
                </div>

                {error && (
                    <div className="p-4 text-sm text-red-500 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                        {error}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-6">
                    {isSignUp && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-3 py-2 mt-1 bg-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Trader Name"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 bg-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="name@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 bg-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50"
                    >
                        {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
                    </button>
                </form>

                <div className="text-center">
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-sm text-blue-400 hover:text-blue-300"
                    >
                        {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}
