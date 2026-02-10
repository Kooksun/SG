import React, { useEffect, useState } from 'react';
import { BookOpen, TrendingUp, Wallet, ArrowRight, Sparkles } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Card from './Card';
import './ProloguePage.css';

interface ProloguePageProps {
    uid: string;
    onComplete: () => void;
}

export default function ProloguePage({ uid, onComplete }: ProloguePageProps) {
    const [prologue, setPrologue] = useState('');
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPrologue = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', uid));
                if (userDoc.exists()) {
                    setPrologue(userDoc.data().prologue || '');
                    setBalance(userDoc.data().balance || 0);
                }
            } catch (err) {
                console.error("Error fetching prologue:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchPrologue();
    }, [uid]);

    const handleStart = async () => {
        try {
            await updateDoc(doc(db, 'users', uid), {
                hasSeenPrologue: true
            });
        } catch (err) {
            console.error("Error updating prologue status:", err);
        }
        onComplete();
    };

    if (loading) return null;

    return (
        <div className="prologue-container">
            <div className="prologue-overlay"></div>

            <Card className="prologue-card" glow="emerald">
                <div className="prologue-header">
                    <Sparkles className="icon-sparkle" />
                    <h2>새로운 시작</h2>
                </div>

                <div className="prologue-content">
                    <BookOpen className="content-icon" />
                    <div className="prologue-text">
                        {prologue.split('\n').map((line, i) => (
                            <p key={i} className="prologue-paragraph">
                                {line.split(/(\[\[.*?\]\]|\{\{.*?\}\})/).map((part, j) => {
                                    if (part.startsWith('[[') && part.endsWith(']]')) {
                                        return <span key={j} className="highlight-player">{part.slice(2, -2)}</span>;
                                    }
                                    if (part.startsWith('{{') && part.endsWith('}}')) {
                                        return <span key={j} className="highlight-stock">{part.slice(2, -2)}</span>;
                                    }
                                    return part;
                                })}
                            </p>
                        ))}
                    </div>
                </div>

                <button onClick={handleStart} className="start-btn">
                    <span>거래소 입장하기</span>
                    <ArrowRight size={20} />
                </button>
            </Card>
        </div>
    );
}
