import React from 'react';
import { Gamepad2 } from 'lucide-react';
import './MinigamePage.css';

const MinigamePage: React.FC = () => {
    return (
        <div className="minigame-page">
            <header className="minigame-header">
                <h1>미니게임</h1>
                <p>시즌 3 신규 컨셉: 캔들 예측 퀴즈</p>
            </header>

            <div className="minigame-placeholder-card">
                <div className="minigame-icon-wrapper">
                    <Gamepad2 size={48} />
                </div>
                <h2>캔들 예측 퀴즈 (준비 중)</h2>
                <p>
                    실제 과거 주가 데이터(캔들 차트)를 보고 다음에 올 캔들의 방향을 맞춰보세요!
                    연승 시 신용한도 영구 상향 보상을 획득할 수 있습니다.
                </p>
                <div className="coming-soon-badge">Coming Soon</div>
            </div>
        </div>
    );
};

export default MinigamePage;
