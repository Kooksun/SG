import React from 'react';
import './Card.css';

interface CardProps {
    children: React.ReactNode;
    title?: string;
    className?: string;
    glow?: 'blue' | 'emerald' | 'rose' | 'none';
}

const Card: React.FC<CardProps> = ({ children, title, className = '', glow = 'none' }) => {
    return (
        <div className={`glass-card glow-${glow} ${className}`}>
            {title && <div className="card-header"><h3 className="card-title">{title}</h3></div>}
            <div className="card-content">
                {children}
            </div>
        </div>
    );
};

export default Card;
