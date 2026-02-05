import React, { useState } from 'react';
import './StockSearch.css';
import { Search, X } from 'lucide-react';

interface StockSearchProps {
    onSearch: (query: string) => void;
}

const StockSearch: React.FC<StockSearchProps> = ({ onSearch }) => {
    const [query, setQuery] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        onSearch(val);
    };

    const handleClear = () => {
        setQuery('');
        onSearch('');
    };

    return (
        <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
                type="text"
                className="search-input"
                placeholder="종목명 또는 심볼을 검색하세요"
                value={query}
                onChange={handleChange}
            />
            {query && (
                <button className="search-clear-btn" onClick={handleClear} title="검색어 초기화">
                    <X size={16} />
                </button>
            )}
        </div>
    );
};

export default StockSearch;
