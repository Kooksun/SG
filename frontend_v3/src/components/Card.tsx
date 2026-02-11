import React from 'react';
import './Card.css';

interface CardProps {
    children: React.ReactNode;
    title?: string;
    className?: string;
    glow?: 'blue' | 'emerald' | 'rose' | 'amber' | 'none';
    onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, title, className = '', glow = 'none', onClick }) => {
    return (
        <div
            className={`glass-card glow-${glow} ${className}`}
            onClick={onClick}
        >
            {title && <div className="card-header"><h3 className="card-title">{title}</h3></div>}
            <div className="card-content">
                {children}
            </div>
        </div>
    );
};

export default Card;
