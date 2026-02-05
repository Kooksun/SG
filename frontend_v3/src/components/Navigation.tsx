import React from 'react';
import './Navigation.css';
import { Globe, User, LayoutDashboard, Trophy } from 'lucide-react';

interface NavigationProps {
    currentView: 'leaderboard' | 'market' | 'my';
    onViewChange: (view: 'leaderboard' | 'market' | 'my') => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange }) => {
    return (
        <nav className="side-navigation">
            <div className="nav-logo">
                <LayoutDashboard size={28} color="var(--accent-blue)" />
            </div>

            <div className="nav-items">
                <button
                    className={`nav-item ${currentView === 'leaderboard' ? 'active' : ''}`}
                    onClick={() => onViewChange('leaderboard')}
                    title="리더보드"
                >
                    <Trophy size={24} />
                    <span>리더보드</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'market' ? 'active' : ''}`}
                    onClick={() => onViewChange('market')}
                    title="시세 탐색"
                >
                    <Globe size={24} />
                    <span>시세탐색</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'my' ? 'active' : ''}`}
                    onClick={() => onViewChange('my')}
                    title="마이페이지"
                >
                    <User size={24} />
                    <span>마이페이지</span>
                </button>
            </div>

            <div className="nav-footer">
                {/* 추가 링크나 설정 버튼 등 */}
            </div>
        </nav>
    );
};

export default Navigation;
