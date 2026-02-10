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
import { ToastProvider } from './context/ToastContext'
import { useOrderToast } from './hooks/useOrderToast'
import PortfolioPage from './pages/PortfolioPage'
import HistoryPage from './pages/HistoryPage'
import { useDetailedHoldings } from './hooks/useDetailedHoldings'
import { useTradeHistory } from './hooks/useTradeHistory'
import { useStocks } from './hooks/useStocks'
import './components/Toast.css'

function AppContent() {
    const { user, loading: authLoading } = useAuth();
    const { hasSeenPrologue, uid } = useUserStore();
    const [currentView, setCurrentView] = useState<'leaderboard' | 'market' | 'assets' | 'portfolio' | 'history'>('market');

    // 유저 자산 동기화
    useUserAsset(user?.uid || null);

    // 매매 결과 알림 리스너
    useOrderToast(user?.uid || null);

    // 데이터 패칭 (포트폴리오, 거래내역용)
    const { stocks } = useStocks();
    const { detailedHoldings } = useDetailedHoldings(uid);
    const { history, hasMore, loadingMore, loadMore } = useTradeHistory(uid);

    useEffect(() => {
        if (!authLoading && user) {
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

    const renderMyPage = () => {
        if (!user) {
            return <AuthPage onSuccess={() => setCurrentView('assets')} />;
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
            case 'assets':
                return renderMyPage();
            case 'portfolio':
                return user ? <PortfolioPage holdings={detailedHoldings} stocks={stocks} /> : <AuthPage onSuccess={() => setCurrentView('portfolio')} />;
            case 'history':
                return user ? (
                    <HistoryPage
                        history={history}
                        hasMore={hasMore}
                        loadingMore={loadingMore}
                        loadMore={loadMore}
                    />
                ) : <AuthPage onSuccess={() => setCurrentView('history')} />;
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
    );
}

function App() {
    return (
        <ToastProvider>
            <AppContent />
        </ToastProvider>
    )
}

export default App
