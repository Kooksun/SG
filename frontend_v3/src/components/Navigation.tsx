import React from 'react';
import './Navigation.css';
import { Globe, User, LayoutDashboard } from 'lucide-react';

interface NavigationProps {
    currentView: 'global' | 'my';
    onViewChange: (view: 'global' | 'my') => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange }) => {
    return (
        <nav className="side-navigation">
            <div className="nav-logo">
                <LayoutDashboard size={28} color="var(--accent-blue)" />
            </div>

            <div className="nav-items">
                <button
                    className={`nav-item ${currentView === 'global' ? 'active' : ''}`}
                    onClick={() => onViewChange('global')}
                    title="글로벌 대시보드"
                >
                    <Globe size={24} />
                    <span>글로벌</span>
                </button>

                <button
                    className={`nav-item ${currentView === 'my' ? 'active' : ''}`}
                    onClick={() => onViewChange('my')}
                    title="마이 대시보드"
                >
                    <User size={24} />
                    <span>마이</span>
                </button>
            </div>

            <div className="nav-footer">
                {/* 추가 링크나 설정 버튼 등 */}
            </div>
        </nav>
    );
};

export default Navigation;
