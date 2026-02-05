import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { authService } from '../lib/authService';
import Card from './Card';
import './AuthPage.css';

interface AuthPageProps {
    onSuccess: () => void;
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                await authService.signIn(email, password);
            } else {
                if (!nickname) throw new Error('닉네임을 입력해주세요.');
                await authService.signUp(email, password, nickname);
            }
            onSuccess();
        } catch (err: any) {
            console.error(err);
            setError(err.message || '인증에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-container">
            <div className="signup-bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
            </div>

            <Card className="auth-card" glow="blue">
                <div className="auth-header">
                    <div className="logo-area">
                        <div className="logo-icon">STOCK</div>
                        <h2 className="logo-text">GAME <span className="season">S3</span></h2>
                    </div>
                    <p className="auth-subtitle">
                        {isLogin ? '다시 오신 것을 환영합니다.' : '전설적인 투자의 시작.'}
                    </p>
                </div>

                {error && (
                    <div className="auth-error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    {!isLogin && (
                        <div className="input-group">
                            <label><UserIcon size={16} /> 닉네임</label>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="멋진 이름을 정해주세요"
                                required={!isLogin}
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <label><Mail size={16} /> 이메일</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label><Lock size={16} /> 비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <>
                                <span>{isLogin ? '로그인' : '가입하기'}</span>
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <button onClick={() => setIsLogin(!isLogin)} className="toggle-btn">
                        {isLogin ? '아직 회원이 아니신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
                    </button>
                </div>
            </Card>
        </div>
    );
}
