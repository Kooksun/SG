import React, { useState, useEffect } from 'react';

interface StockIconProps {
  symbol: string;
  name?: string;
  size?: number;
  className?: string;
}

const StockIcon: React.FC<StockIconProps> = ({ symbol, name, size = 20, className = '' }) => {
  const [errorCount, setErrorCount] = useState(0);
  const [imgSrc, setImgSrc] = useState('');

  const defaultUrl = `https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock${symbol}.svg`;

  useEffect(() => {
    let initialUrl = defaultUrl;
    
    if (name && name.includes(' ')) {
      const parts = name.split(' ');
      const firstWord = parts[0];
      let brand = firstWord.toUpperCase();
      
      const brandMap: Record<string, string> = {
        '히어로즈': 'HEROES',
        '마이티': 'MIGHTY',
        '네비게이터': 'NAVIGATOR',
        '파워': 'POWER',
        '트렉스': 'TREX',
        '플러스': 'PLUS'
      };
      
      if (brandMap[firstWord]) {
        brand = brandMap[firstWord];
      }

      if (/^[A-Z]+$/.test(brand)) {
        initialUrl = `https://ssl.pstatic.net/imgstock/fn/real/logo/etf/StockKRETF${brand}.svg`;
      }
    }
    
    setImgSrc(initialUrl);
    setErrorCount(0);
  }, [symbol, name]);

  const handleError = () => {
    if (imgSrc !== defaultUrl && errorCount === 0) {
      setImgSrc(defaultUrl);
      setErrorCount(1);
    } else {
      setErrorCount(2);
    }
  };

  if (errorCount >= 2 || !symbol || !imgSrc) {
    return (
      <div 
        className={`stock-icon-placeholder ${className}`}
        style={{ 
          width: size, 
          height: size, 
          borderRadius: '50%', 
          backgroundColor: 'var(--bg-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          fontWeight: 'bold',
          color: 'var(--text-secondary)',
          flexShrink: 0
        }}
      >
        {symbol?.charAt(0) || '?'}
      </div>
    );
  }

  return (
    <div 
      className={`stock-icon-wrapper ${className}`}
      style={{ 
        width: size, 
        height: size, 
        borderRadius: '50%', 
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <img
        src={imgSrc}
        alt={symbol}
        width={size}
        height={size}
        className="stock-icon-img"
        onError={handleError}
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover'
        }}
      />
    </div>
  );
};

export default StockIcon;
