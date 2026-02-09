import React from 'react';
import { User, LogOut } from 'lucide-react';
import { authService } from '../lib/authService';
import './DashboardHeader.css';

interface DashboardHeaderProps {
    nickname: string;
    subtitle: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ nickname, subtitle }) => {
    return (
        <header className="dashboard-header">
            <div className="header-main">
                <div className="welcome-info">
                    <div className="user-badge">
                        <User size={16} />
                        <span>Investor</span>
                    </div>
                    <h1 className="welcome-text">안녕하세요, <span className="highlight">{nickname}</span>님</h1>
                    <p className="subtitle">{subtitle}</p>
                </div>
                <button className="logout-btn" onClick={() => authService.signOut()} title="로그아웃">
                    <LogOut size={18} />
                    <span>로그아웃</span>
                </button>
            </div>
        </header>
    );
};

export default DashboardHeader;
