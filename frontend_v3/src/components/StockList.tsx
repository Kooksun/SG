import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import './StockList.css';
import { TrendingUp, TrendingDown, Star } from 'lucide-react';
import { useUserStore } from '../hooks/useUserStore';
import StockIcon from './StockIcon';
import { tradeService } from '../lib/tradeService';

export interface StockItem {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    market: string;
}

interface StockListProps {
    stocks: StockItem[];
    onSelect: (stock: StockItem) => void;
}

// Removing old StockRow in favor of virtualized cells


const StockRowCells: React.FC<{ 
    stock: StockItem; 
    onSelect: (stock: StockItem) => void; 
}> = ({ stock, onSelect }) => {
    const { uid, watchlist } = useUserStore();
    const isWatched = watchlist.includes(stock.symbol);
    const prevPriceRef = useRef<number>(stock.price);
    const [flashClass, setFlashClass] = useState<'flash-up' | 'flash-down' | ''>('');

    const toggleWatch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!uid) return;
        try {
            await tradeService.toggleWatchlist(uid, stock.symbol, !isWatched);
        } catch (err) {
            console.error('Watchlist toggle failed:', err);
        }
    };

    useEffect(() => {
        if (prevPriceRef.current !== stock.price) {
            const isUp = stock.price > prevPriceRef.current;
            setFlashClass(isUp ? 'flash-up' : 'flash-down');
            prevPriceRef.current = stock.price;
            const timer = setTimeout(() => setFlashClass(''), 1000);
            return () => clearTimeout(timer);
        }
    }, [stock.price]);

    const handleClick = () => onSelect(stock);

    return (
        <>
            <td onClick={handleClick} className={`cell-name ${flashClass}`} style={{ cursor: 'pointer' }}>
                <div className="stock-info-row">
                    {uid && (
                        <button className={`star-btn ${isWatched ? 'active' : ''}`} onClick={toggleWatch}>
                            <Star size={16} fill={isWatched ? "var(--accent-amber)" : "none"} />
                        </button>
                    )}
                    <div className="stock-info-wrapper flex items-center gap-3">
                        <StockIcon symbol={stock.symbol} name={stock.name} size={36} className="stock-icon-large" />
                        <div className="stock-info">
                            <span className="stock-name">{stock.name}</span>
                            <span className="stock-symbol">{stock.symbol} ∙ {stock.market}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td onClick={handleClick} className={`cell-price text-right font-bold ${flashClass}`} style={{ cursor: 'pointer' }}>
                {stock.price.toLocaleString()}
            </td>
            <td onClick={handleClick} className={`cell-change text-right font-medium ${stock.change >= 0 ? 'up' : 'down'} ${flashClass}`} style={{ cursor: 'pointer' }}>
                <div className="price-change-wrapper">
                    <div className="price-change-row">
                        <span className="change-icon">{stock.change > 0 ? '▲' : (stock.change < 0 ? '▼' : '')}</span>
                        <span className="change-amount">{Math.abs(stock.change).toLocaleString()}</span>
                    </div>
                    <div className="price-change-percent">
                        ({stock.change > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                    </div>
                </div>
            </td>
            <td onClick={handleClick} className={`cell-volume text-right volume-cell ${flashClass}`} style={{ cursor: 'pointer' }}>
                {stock.volume > 1000000
                    ? `${(stock.volume / 1000000).toFixed(1)}M`
                    : stock.volume > 1000
                        ? `${(stock.volume / 1000).toFixed(1)}K`
                        : stock.volume.toLocaleString()}
            </td>
        </>
    );
};

const StockList: React.FC<StockListProps> = ({ stocks, onSelect }) => {
    const virtuosoRef = useRef<any>(null);

    // Reset scroll when stocks change (filter change)
    useEffect(() => {
        if (virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' });
        }
    }, [stocks]);

    // Header for the virtual table
    const TableHeader = () => (
        <tr className="fixed-header-row">
            <th className="cell-name">종목명</th>
            <th className="cell-price text-right">현재가</th>
            <th className="cell-change text-right">전일대비</th>
            <th className="cell-volume text-right">거래량</th>
        </tr>
    );

    // Custom Table component for Virtuoso to preserve our CSS classes
    const TableContainer = (props: any) => (
        <table {...props} className="stock-table virtual-table" />
    );

    if (stocks.length === 0) {
        return (
            <div className="stock-list-container">
                <table className="stock-table">
                    <thead><TableHeader /></thead>
                    <tbody>
                        <tr>
                            <td colSpan={4} className="empty-message">검색 결과가 없습니다.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="stock-list-container virtual-container">
            <TableVirtuoso
                ref={virtuosoRef}
                style={{ height: '100%' }}
                data={stocks}
                components={{
                    Table: TableContainer,
                }}
                fixedHeaderContent={TableHeader}
                itemContent={(_index, stock) => (
                    <StockRowCells stock={stock} onSelect={onSelect} />
                )}
            />
        </div>
    );
};

export default StockList;
