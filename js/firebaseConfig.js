const firebaseConfig = {
  apiKey: "AIzaSyAhh-TC7k4LHxGw5rCJkvuDMkpjoQL4kIA",
  authDomain: "chess-master-vn.firebaseapp.com",
  projectId: "chess-master-vn",
  storageBucket: "chess-master-vn.firebasestorage.app",
  messagingSenderId: "835182455586",
  appId: "1:835182455586:web:c88b1efe6cd8728517537b"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const USERS_COL = 'users';
const DB_CURRENT = 'vnc_current_v2';

const RANKS = [
  { id: 1, name: 'Đồng', starsToUp: 5, color: 'text-orange-500', icon: '🥉' },
  { id: 2, name: 'Bạc', starsToUp: 5, color: 'text-slate-400', icon: '🥈' },
  { id: 3, name: 'Vàng', starsToUp: 5, color: 'text-yellow-400', icon: '🥇' },
  { id: 4, name: 'Bạch Kim', starsToUp: 5, color: 'text-cyan-400', icon: '💠' },
  { id: 5, name: 'Kim Cương', starsToUp: 5, color: 'text-blue-500', icon: '💎' },
  { id: 6, name: 'Tinh Anh', starsToUp: 5, color: 'text-purple-500', icon: '🔮' },
  { id: 7, name: 'Cao Thủ', starsToUp: Infinity, color: 'text-red-500', icon: '👑' },
  { id: 8, name: 'Thách Đấu', starsToUp: Infinity, color: 'text-yellow-500', icon: '⚡' }
];

const computeDisplayRank = (u, allUsers) => {
  if (!u || u.rankId < 7) return u ? u.rankId : 1;
  const caoThu = allUsers.filter(x => x.rankId >= 7).sort((a, b) => (b.stars - a.stars) || ((a.lastUpdate || 0) - (b.lastUpdate || 0)));
  const myPos = caoThu.findIndex(x => x.id === u.id);
  if (u.stars >= 20 && myPos >= 0 && myPos < 50) return 8;
  return 7;
};
