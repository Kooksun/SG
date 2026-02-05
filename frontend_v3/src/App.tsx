import React, { useState, useEffect } from 'react'
import TopTicker from './components/TopTicker'
import Navigation from './components/Navigation'
import LeaderboardPage from './pages/LeaderboardPage'
import MarketPage from './pages/MarketPage'
import MyPage from './pages/MyPage'
import AuthPage from './components/AuthPage'
import ProloguePage from './components/ProloguePage'
import { Loader2 } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { useUserAsset } from './hooks/useUserAsset'
import { useUserStore } from './hooks/useUserStore'

function App() {
    const { user, loading: authLoading } = useAuth();
    const { hasSeenPrologue } = useUserStore();
    const [currentView, setCurrentView] = useState<'leaderboard' | 'market' | 'my'>('market');

    // 유저 자산 동기화
    useUserAsset(user?.uid || null);

    useEffect(() => {
        if (!authLoading && user) {
            // 로그인 상태이면 글로벌에서 마이로 전환 유도 (옵션)
            // 여기서는 사용자가 강제로 페이지를 열었을 때 상황만 고려
        }
    }, [user, authLoading]);

    if (authLoading) {
        return (
            <div className="loading-screen">
                <Loader2 className="animate-spin" size={48} color="var(--accent-blue)" />
                <p>데이터를 불러오는 중...</p>
            </div>
        );
    }

    // 마이페이지 접근 시 로그인이 안 되어 있으면 가입/로그인 화면 노출
    const renderMyPage = () => {
        if (!user) {
            return <AuthPage onSuccess={() => setCurrentView('my')} />;
        }
        if (!hasSeenPrologue) {
            return <ProloguePage uid={user.uid} onComplete={() => { }} />;
        }
        return <MyPage />;
    };

    const renderView = () => {
        switch (currentView) {
            case 'leaderboard':
                return <LeaderboardPage />;
            case 'market':
                return <MarketPage />;
            case 'my':
                return renderMyPage();
            default:
                return <MarketPage />;
        }
    };

    return (
        <div className="app-layout">
            <Navigation
                currentView={currentView}
                onViewChange={setCurrentView}
            />

            <div className="main-wrapper">
                <TopTicker />

                <div className="content-area">
                    {renderView()}
                </div>
            </div>
        </div>
    )
}

export default App
