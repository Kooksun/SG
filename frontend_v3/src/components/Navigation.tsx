import React from 'react';
import './Navigation.css';
import { Globe, Trophy, PieChart, Briefcase, History } from 'lucide-react';

interface NavigationProps {
    currentView: 'leaderboard' | 'market' | 'assets' | 'portfolio' | 'history';
    onViewChange: (view: 'leaderboard' | 'market' | 'assets' | 'portfolio' | 'history') => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange }) => {
    return (
        <nav className="side-navigation">

            <div className="nav-items">
                <button
                    className={`nav-item ${currentView === 'market' ? 'active' : ''}`}
                    onClick={() => onViewChange('market')}
                    title="시세 탐색"
                >
                    <Globe size={24} />
                    <span>시세탐색</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'leaderboard' ? 'active' : ''}`}
                    onClick={() => onViewChange('leaderboard')}
                    title="리더보드"
                >
                    <Trophy size={24} />
                    <span>리더보드</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'assets' ? 'active' : ''}`}
                    onClick={() => onViewChange('assets')}
                    title="내 자산"
                >
                    <PieChart size={24} />
                    <span>내 자산</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'portfolio' ? 'active' : ''}`}
                    onClick={() => onViewChange('portfolio')}
                    title="포트폴리오"
                >
                    <Briefcase size={24} />
                    <span>포트폴리오</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
                    onClick={() => onViewChange('history')}
                    title="거래내역"
                >
                    <History size={24} />
                    <span>거래내역</span>
                </button>
            </div>

            <div className="nav-footer">
                {/* 추가 링크나 설정 버튼 등 */}
            </div>
        </nav>
    );
};

export default Navigation;
