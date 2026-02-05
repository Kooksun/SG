import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useUserStore } from './useUserStore';

export function useAuth() {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const setUserInfo = useUserStore((state) => state.setUserInfo);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Firestore에서 사용자 상세 정보 가져와서 store에 저장
                const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserInfo({
                        uid: firebaseUser.uid,
                        nickname: data.displayName || '투자자',
                        balance: data.balance || 0,
                        equity: (data.balance || 0) + (data.totalStockValue || 0),
                        stocks: data.stockCount || 0, // 나중에 실제 count로 업데이트 필요
                    });
                }
            } else {
                setUserInfo({
                    uid: null,
                    nickname: '투자자',
                    balance: 0,
                    equity: 0,
                    stocks: 0
                });
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUserInfo]);

    return { user, loading };
}
