"use client";

import UserDashboard from "@/components/UserDashboard";
import { useSearchParams } from "next/navigation";

export default function UserPage() {
    const searchParams = useSearchParams();
    const uid = searchParams?.get("uid") ?? "";

    if (!uid) {
        return (
            <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div className="text-center space-y-2">
                    <p className="text-xl">선택된 사용자가 없습니다.</p>
                    <p className="text-gray-400">리더보드나 포트폴리오에서 사용자를 선택해 주세요.</p>
                </div>
            </main>
        );
    }

    return <UserDashboard uid={uid} />;
}
