const { useState, useEffect, useCallback, useRef } = React;

function App() {
  const [view, setView] = useState(() => {
    const savedView = localStorage.getItem('vnc_view');
    if (savedView) return savedView;
    return localStorage.getItem(DB_CURRENT) ? 'home' : 'landing';
  });
  const [gameType, setGameType] = useState(() => localStorage.getItem('vnc_gameType') || 'normal');
  const [rankChangeMsg, setRankChangeMsg] = useState(null);

  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem(DB_CURRENT) || 'null'));
  const [authMode, setAuthMode] = useState(() => localStorage.getItem('vnc_authMode') || 'login');
  const [authInput, setAuthInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const passwordRef = useRef(null);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [showProfileUid, setShowProfileUid] = useState(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [profileStats, setProfileStats] = useState({ total: 0, winRate: 0, history: [], soulmates: [] });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const avatarInputRef = useRef(null);

  useEffect(() => { localStorage.setItem('vnc_view', view); }, [view]);
  useEffect(() => { localStorage.setItem('vnc_authMode', authMode); }, [authMode]);
  useEffect(() => { localStorage.setItem('vnc_gameType', gameType); }, [gameType]);

  const fetchMatchHistory = async (uid) => {
    try {
      const snap = await db.collection('match_history')
        .where('uid', '==', uid)
        .get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return docs.sort((a, b) => b.date - a.date);
    } catch (e) { console.warn('History fetch error', e); return []; }
  };

  const fetchFriends = async (uid) => {
    try {
      const snap = await db.collection('friendships')
        .where('uids', 'array-contains', uid)
        .get();
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFriends(all.filter(f => f.status === 'accepted'));
      setFriendRequests(all.filter(f => f.status === 'pending' && f.senderId !== uid));
    } catch (e) { console.warn('Friends fetch error', e); }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setAvatarUrl(dataUrl);
      localStorage.setItem(`vnc_avatar_${currentUser.id}`, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`vnc_avatar_${currentUser.id}`);
      if (saved) setAvatarUrl(saved);
      else setAvatarUrl(null);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (showProfileUid) {
      const u = leaderboard.find(x => x.id === showProfileUid) || (showProfileUid === currentUser?.id ? currentUser : null);
      let total = u?.totalMatches || 0;
      let wins = u?.wins || 0;
      let winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;

      fetchMatchHistory(showProfileUid).then(async history => {
        if (!u?.totalMatches && history.length > 0) {
          total = history.length;
          wins = history.filter(m => m.result === 'THẮNG').length;
          winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
        }

        // Also fetch soulmates for this specific user
        let soulmates = [];
        try {
          const sSnap = await db.collection('friendships')
            .where('uids', 'array-contains', showProfileUid)
            .get();
          soulmates = sSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status === 'accepted' && f.category !== 'none');
        } catch (e) { console.warn('Profile soulmates fetch error', e); }

        setProfileStats({ total, winRate, history: [], soulmates });
      });
    }
  }, [showProfileUid]);

  useEffect(() => {
    if (currentUser) {
      fetchLeaderboard();
      fetchMatchHistory(currentUser.id).then(setMatchHistory);

      const unsubscribe = db.collection('friendships')
        .where('uids', 'array-contains', currentUser.id)
        .onSnapshot(snap => {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setFriends(all.filter(f => f.status === 'accepted'));
          setFriendRequests(all.filter(f => f.status === 'pending' && f.senderId !== currentUser.id));
        }, e => console.warn('Friends sync error', e));

      return () => unsubscribe();
    }
  }, [currentUser?.id]);

  const sendFriendRequest = async (targetId) => {
    if (!currentUser || targetId === currentUser.id) return;
    try {
      const snap = await db.collection('friendships').where('uids', 'array-contains', currentUser.id).get();
      const already = snap.docs.some(d => d.data().uids.includes(targetId));
      if (already) return alert("Đã có lời mời hoặc đã là bạn bè!");

      const uids = [currentUser.id, targetId].sort();
      await db.collection('friendships').add({
        uids,
        senderId: currentUser.id,
        status: 'pending',
        category: 'none',
        timestamp: Date.now()
      });
      alert("Đã gửi lời mời kết bạn!");
    } catch (e) { alert("Lỗi gửi lời mời: " + e.message); }
  };

  const acceptFriendRequest = async (friendshipId) => {
    try {
      await db.collection('friendships').doc(friendshipId).update({ status: 'accepted' });
      fetchFriends(currentUser.id);
    } catch (e) { alert("Lỗi chấp nhận lời mời!"); }
  };

  const setTriKi = async (friendshipId, category, targetId) => {
    try {
      if (category === 'none') {
        await db.collection('friendships').doc(friendshipId).update({ category: 'none', pendingCategory: null, pendingCategorySenderId: null });
        fetchFriends(currentUser.id);
        alert("Đã hủy tri kỉ!");
        return;
      }

      const limit = category === 'love' ? 1 : 3;

      // Check my own limits
      const myCatCount = friends.filter(f => f.category === category || (f.pendingCategory === category && f.pendingCategorySenderId === currentUser.id)).length;
      if (myCatCount >= limit) return alert(`Bạn chỉ có thể có tối đa ${limit} ${category}!`);

      // Check recipient's limits
      const snap = await db.collection('friendships').where('uids', 'array-contains', targetId).get();
      const targetFriends = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status === 'accepted');

      const targetOfCat = targetFriends.filter(f => f.category === category || (f.pendingCategory === category && f.pendingCategorySenderId === targetId));
      if (targetOfCat.length >= limit) {
        return alert(`Đối phương đã đạt số lượng tối đa (${limit}) cho loại tri kỉ này!`);
      }

      await db.collection('friendships').doc(friendshipId).update({
        pendingCategory: category,
        pendingCategorySenderId: currentUser.id
      });
      fetchFriends(currentUser.id);
      alert("Đã gửi lời mời tri kỉ!");
    } catch (e) { alert("Lỗi cập nhật!"); }
  };

  const acceptSoulmateRequest = async (friendshipId, pendingCategory) => {
    try {
      await db.collection('friendships').doc(friendshipId).update({
        category: pendingCategory,
        pendingCategory: null,
        pendingCategorySenderId: null
      });
      fetchFriends(currentUser.id);
    } catch (e) { alert("Lỗi chấp nhận lời mời tri kỉ!"); }
  };

  const rejectSoulmateRequest = async (friendshipId) => {
    try {
      await db.collection('friendships').doc(friendshipId).update({
        pendingCategory: null,
        pendingCategorySenderId: null
      });
      fetchFriends(currentUser.id);
    } catch (e) { alert("Lỗi từ chối lời mời tri kỉ!"); }
  };

  const removeFriend = async (friendshipId) => {
    if (!window.confirm('Bạn có chắc muốn xóa người bạn này không?')) return;
    try {
      await db.collection('friendships').doc(friendshipId).delete();
      fetchFriends(currentUser.id);
    } catch (e) { alert('Lỗi xóa bạn bè: ' + e.message); }
  };

  const searchUsers = async (q) => {
    if (!q.trim()) return setSearchResults([]);
    try {
      const term = q.trim().toLowerCase();
      const snap = await db.collection('users').get();
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const results = allUsers.filter(u =>
        u.id.toLowerCase() === term ||
        (u.username && u.username.toLowerCase().includes(term)) ||
        (u.displayName && u.displayName.toLowerCase().includes(term))
      );

      setSearchResults(results.slice(0, 15));
    } catch (e) { console.warn('Search error', e); }
  };

  // --- HÀM XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ ---
  const handleAuth = async () => {
    const cleanAuth = authInput.trim();
    const cleanPass = passInput.trim();

    if (!cleanAuth || !cleanPass) {
      return setAuthError("Vui lòng nhập đầy đủ thông tin!");
    }

    setIsAuthLoading(true);
    setAuthError('');

    try {
      const userId = cleanAuth.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const userRef = db.collection(USERS_COL).doc(userId);
      const docSnap = await userRef.get();

      if (authMode === 'register') {
        if (docSnap.exists) {
          setAuthError("Tài khoản đã tồn tại, vui lòng chuyển sang Đăng nhập!");
          setIsAuthLoading(false);
          return;
        }

        const newUser = {
          id: userId,
          username: cleanAuth,
          displayName: cleanAuth.split('@')[0],
          password: cleanPass, // Lưu mật khẩu
          rankId: 1,
          stars: 0,
          lastUpdate: Date.now()
        };

        await userRef.set(newUser);

        const { password, ...userToSave } = newUser;
        localStorage.setItem(DB_CURRENT, JSON.stringify(userToSave));
        setCurrentUser(userToSave);
        setView('home');

      } else if (authMode === 'login') {
        if (!docSnap.exists) {
          setAuthError("Tài khoản không tồn tại!");
          setIsAuthLoading(false);
          return;
        }

        const userData = docSnap.data();

        // Cứu tài khoản cũ chưa có mật khẩu
        if (!userData.password) {
          await userRef.update({ password: cleanPass });
          userData.password = cleanPass;
        }
        else if (String(userData.password) !== String(cleanPass)) {
          setAuthError("Sai tên đăng nhập hoặc mật khẩu!");
          setIsAuthLoading(false);
          return;
        }

        const { password, ...userToSave } = userData;
        localStorage.setItem(DB_CURRENT, JSON.stringify(userToSave));
        setCurrentUser(userToSave);
        setView('home');
      }
    } catch (error) {
      console.error("Lỗi xác thực:", error);
      if (error.code === 'permission-denied') {
        setAuthError("Lỗi cấu hình: Database Firebase chưa mở quyền truy cập (Rules)!");
      } else {
        setAuthError("Lỗi kết nối máy chủ, vui lòng kiểm tra mạng!");
      }
    }

    setIsAuthLoading(false);
  };

  const handleEditDisplayName = () => {
    const currentName = currentUser.displayName || currentUser.username;
    const newName = prompt("Nhập tên hiển thị mới (Tên đăng nhập sẽ không đổi):", currentName);
    if (newName === null) return;
    saveUser({ ...currentUser, displayName: newName.trim() });
  };

  const saveUser = async (u) => {
    const updateData = { ...u, lastUpdate: Date.now() };
    localStorage.setItem(DB_CURRENT, JSON.stringify(updateData));
    setCurrentUser(updateData);
    try {
      await db.collection(USERS_COL).doc(u.id).set(updateData, { merge: true });
    } catch (e) { console.warn('Firestore write error', e); }
  };

  const fetchLeaderboard = async () => {
    try {
      const snap = await db.collection(USERS_COL)
        .orderBy("rankId", "desc")
        .orderBy("stars", "desc")
        .orderBy("lastUpdate", "asc")
        .limit(100)
        .get();

      let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (rows.length === 0) {
        const fallbackSnap = await db.collection(USERS_COL).limit(100).get();
        rows = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b.rankId - a.rankId) || (b.stars - a.stars) || ((a.lastUpdate || 0) - (b.lastUpdate || 0)));
      }

      const ranked = rows.map((u, idx) => {
        if (u.rankId >= 7 && u.stars >= 20 && idx < 50) return { ...u, displayRankId: 8 };
        return { ...u, displayRankId: u.rankId >= 7 ? 7 : u.rankId };
      });
      setLeaderboard(ranked);

      // Persist display rank for the current user
      if (currentUserRef.current) {
        const me = ranked.find(x => x.id === currentUserRef.current.id);
        if (me && me.displayRankId !== currentUserRef.current.displayRankId) {
          const updated = { ...currentUserRef.current, displayRankId: me.displayRankId };
          setCurrentUser(updated);
          localStorage.setItem(DB_CURRENT, JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error("Leaderboard Fetch Error:", e);
      try {
        const fallbackSnap = await db.collection(USERS_COL).limit(100).get();
        const fallbackRows = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        fallbackRows.sort((a, b) => (b.rankId - a.rankId) || (b.stars - a.stars) || ((a.lastUpdate || 0) - (b.lastUpdate || 0)));
        const ranked = fallbackRows.map((u, idx) => {
          if (u.rankId >= 7 && u.stars >= 20 && idx < 50) return { ...u, displayRankId: 8 };
          return { ...u, displayRankId: u.rankId >= 7 ? 7 : u.rankId };
        });
        setLeaderboard(ranked);
      } catch (e2) { console.error("Total Fetch Failure:", e2); }
    }
  };

  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('vnc_audioEnabled') === 'true');
  useEffect(() => { localStorage.setItem('vnc_audioEnabled', audioEnabled); }, [audioEnabled]);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showRematchRequestModal, setShowRematchRequestModal] = useState(false);
  const [rematchRejectedMsg, setRematchRejectedMsg] = useState("");
  const [matchSuccessMsg, setMatchSuccessMsg] = useState('');
  const [globalJoinId, setGlobalJoinId] = useState('');

  const audioEnabledRef = useRef(false);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);

  const playSfx = (type) => {
    if (!audioEnabledRef.current) return;
    let url = '';
    if (type === 'move') url = 'https://images.chesscomusercontent.com/chess-themes/sounds/_MP3_/default/move-self.mp3';
    if (type === 'capture') url = 'https://images.chesscomusercontent.com/chess-themes/sounds/_MP3_/default/capture.mp3';
    if (type === 'start') url = 'https://images.chesscomusercontent.com/chess-themes/sounds/_MP3_/default/game-start.mp3';
    if (type === 'end') url = 'https://images.chesscomusercontent.com/chess-themes/sounds/_MP3_/default/game-end.mp3';
    if (type === 'notify') url = 'https://images.chesscomusercontent.com/chess-themes/sounds/_MP3_/default/notify.mp3';
    if (url) new Audio(url).play().catch(() => { });
  };

  const [game, setGame] = useState(null);
  const gameRef = useRef(null);
  const matchEndedRef = useRef(false);
  const [board, setBoard] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem('vnc_mode') || "PvP");
  useEffect(() => { localStorage.setItem('vnc_mode', mode); }, [mode]);
  const [humanColor, setHumanColor] = useState(() => localStorage.getItem('vnc_humanColor') || "w");
  useEffect(() => { localStorage.setItem('vnc_humanColor', humanColor); }, [humanColor]);
  const [gameOverMsg, setGameOverMsg] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [floatingEmote, setFloatingEmote] = useState(null);
  const emoteTimeoutRef = useRef(null);

  const showEmotePopup = useCallback((emoji, sender) => {
    setFloatingEmote({ emoji, sender });
    if (emoteTimeoutRef.current) clearTimeout(emoteTimeoutRef.current);
    emoteTimeoutRef.current = setTimeout(() => setFloatingEmote(null), 3000);
  }, []);

  const mqttRef = useRef(null);
  const roomIdRef = useRef('');
  const netIdRef = useRef(Math.random().toString(36).substr(2, 9));

  const [roomId, setRoomId] = useState('');
  const [onlineRole, setOnlineRole] = useState(null);
  const [connStatus, setConnStatus] = useState('');
  const connStatusRef = useRef('');
  useEffect(() => { connStatusRef.current = connStatus; }, [connStatus]);

  const gameTypeRef = useRef(gameType);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { gameTypeRef.current = gameType; currentUserRef.current = currentUser; }, [gameType, currentUser]);

  const handleRankUpdate = async (isWin, isDraw = false) => {
    if (matchEndedRef.current) return;
    matchEndedRef.current = true;

    const u = currentUserRef.current;
    if (!u) return;

    let nU = { ...u };
    nU.totalMatches = (nU.totalMatches || 0) + 1;
    if (isWin) nU.wins = (nU.wins || 0) + 1;

    // Record history
    try {
      const resText = isDraw ? 'HÒA' : (isWin ? 'THẮNG' : 'THUA');
      const oppName = mode === 'AI' ? 'Máy (AI)' : (mode === 'Online' ? 'Người Chơi Online' : 'Người Chơi Cùng Máy');
      await db.collection('match_history').add({
        uid: u.id,
        opponent: oppName,
        result: resText,
        mode: mode,
        starsChange: (isDraw || gameTypeRef.current !== 'ranked') ? 0 : (isWin ? 1 : -1),
        date: Date.now()
      });
      fetchMatchHistory(u.id);
    } catch (e) { console.warn('Record history error', e); }

    if (gameTypeRef.current !== 'ranked') {
      await saveUser(nU);
      return;
    }

    if (isDraw) {
      await saveUser(nU);
      return setRankChangeMsg({ title: 'HÒA', msg: 'Rank không thay đổi.', type: 'info' });
    }

    let rank = RANKS.find(r => r.id === u.rankId);
    if (isWin) {
      nU.stars += 1;
      if (rank.id < 7 && nU.stars >= rank.starsToUp) {
        nU.rankId += 1;
        nU.stars = 0;
        setRankChangeMsg({ title: 'THĂNG HẠNG!', msg: `Chúc mừng bạn đã lên ${RANKS.find(r => r.id === nU.rankId).name} 🤩`, type: 'up' });
      } else setRankChangeMsg({ title: 'CHIẾN THẮNG', msg: '+1 Sao ⭐', type: 'up' });
    } else {
      nU.stars -= 1;
      if (nU.stars < 0) {
        if (nU.rankId > 1) {
          nU.rankId -= 1;
          const prevR = RANKS.find(r => r.id === nU.rankId);
          nU.stars = prevR.starsToUp - 1;
          setRankChangeMsg({ title: 'RỚT HẠNG', msg: `Bạn đã bị giáng xuống ${prevR.name} 😢`, type: 'down' });
        } else {
          nU.stars = 0;
          setRankChangeMsg({ title: 'THẤT BẠI', msg: '-1 Sao 💔', type: 'down' });
        }
      } else setRankChangeMsg({ title: 'THẤT BẠI', msg: '-1 Sao 💔', type: 'down' });
    }
    await saveUser(nU);
    fetchLeaderboard(); // Update display rank
  };

  const updateBoardInfo = useCallback(() => {
    const gm = gameRef.current;
    if (!gm) return;
    setBoard([...gm.board()]);

    if (gm.in_checkmate()) {
      const myCol = mode === 'AI' ? humanColor : (onlineRole === 'host' ? 'w' : 'b');
      const isWin = gm.turn() !== myCol;
      setGameOverMsg(`Chiếu Tướng! Cờ ${gm.turn() === 'w' ? 'Đen' : 'Trắng'} Thắng`);
      playSfx('end');
      handleRankUpdate(isWin, false);
    }
    else if (gm.in_draw()) { setGameOverMsg("Cờ Hòa!"); playSfx('end'); handleRankUpdate(false, true); }
    else if (gm.in_stalemate()) { setGameOverMsg("Hòa do hết nước đi!"); playSfx('end'); handleRankUpdate(false, true); }
    else if (gm.in_threefold_repetition()) { setGameOverMsg("Hòa do lặp lại 3 lần!"); playSfx('end'); handleRankUpdate(false, true); }
  }, [mode, onlineRole]);

  const updateBoardRef = useRef(updateBoardInfo);
  useEffect(() => { updateBoardRef.current = updateBoardInfo; }, [updateBoardInfo]);

  const resetGame = () => {
    const newGame = new window.Chess();
    setGame(newGame); gameRef.current = newGame; updateBoardRef.current();
    setSelectedSquare(null); setLegalMoves([]); setLastMove(null); setGameOverMsg(""); setIsThinking(false);
    matchEndedRef.current = false;

    if (mode === "AI" && humanColor === "b") {
      setIsThinking(true);
      setTimeout(() => {
        const aiMove = getBestMove(newGame, "w", 5);
        if (aiMove) {
          const moveRes = newGame.move(aiMove);
          if (moveRes) setLastMove({ from: moveRes.from, to: moveRes.to });
          playSfx(aiMove.includes('x') ? 'capture' : 'move');
        }
        updateBoardRef.current(); setIsThinking(false);
      }, 50);
    }
  };

  useEffect(() => { resetGame(); }, [mode, humanColor]);

  const doResetGameAndStart = () => {
    const newGame = new window.Chess(); setGame(newGame); gameRef.current = newGame; updateBoardRef.current();
    setGameOverMsg(""); setSelectedSquare(null); setLegalMoves([]); setLastMove(null); playSfx('start');
  };

  const handleOnlineData = useCallback((data) => {
    if (data.type === 'MOVE') {
      const move = gameRef.current.move(data.move);
      if (move) {
        setLastMove({ from: move.from, to: move.to });
        playSfx(move.captured ? 'capture' : 'move');
      }
      updateBoardRef.current();
    } else if (data.type === 'RESIGN') {
      setGameOverMsg(`Đối thủ đã Đầu Hàng! Bạn Thắng Trắng!`);
      playSfx('end');
      handleRankUpdate(true, false);
    } else if (data.type === 'REMATCH_REQ') {
      playSfx('notify');
      setShowRematchRequestModal(true);
    } else if (data.type === 'REMATCH_ACK') {
      doResetGameAndStart();
    } else if (data.type === 'REMATCH_REJECT') {
      playSfx('notify');
      setRematchRejectedMsg("Đối thủ vừa từ chối yêu cầu chơi lại của bạn!");
    } else if (data.type === 'SYNC') {
      gameRef.current.load(data.fen); updateBoardRef.current();
    } else if (data.type === 'EMOTE') {
      showEmotePopup(data.emoji, 'opponent');
    } else if (data.type === 'LEFT') {
      if (connStatusRef.current === 'connected') {
        playSfx('end');
        setGameOverMsg(prev => prev || "🏆 Đối thủ Đã Bỏ Chạy! Bạn Giành Chiến Thắng Kịch Tính!");
        setConnStatus('abandoned');
        setShowRematchRequestModal(false);
        if (mqttRef.current) { mqttRef.current.end(); mqttRef.current = null; roomIdRef.current = ''; }
        handleRankUpdate(true, false);
      } else {
        setConnStatus('error');
        setGameOverMsg("Kẻ địch đã biến mất. Hãy tìm bàn chơi khác!");
        setShowRematchRequestModal(false);
        roomIdRef.current = ''; setRoomId('');
        if (mqttRef.current) { mqttRef.current.end(); mqttRef.current = null; }
      }
    }
  }, [showEmotePopup]);
  const dataCb = useRef(handleOnlineData);
  useEffect(() => { dataCb.current = handleOnlineData; }, [handleOnlineData]);

  const sendNetworkData = (obj) => {
    if (mqttRef.current && roomIdRef.current) {
      mqttRef.current.publish(`vnc_room_${roomIdRef.current}`, JSON.stringify({ ...obj, sender: netIdRef.current }));
    }
  };

  const connectMQTT = (onReady) => {
    if (mqttRef.current) {
      onReady(mqttRef.current);
      return mqttRef.current; // FIX: must return client, not undefined
    }
    const clientId = 'vnc_' + netIdRef.current + '_' + Math.random().toString(36).slice(2, 7);
    const cli = window.mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId,
      clean: true,
      reconnectPeriod: 0,   // tắt auto-reconnect – chúng ta tự quản lý
      connectTimeout: 12000,
    });
    cli.on('connect', () => { mqttRef.current = cli; onReady(cli); });
    cli.on('error', (e) => { console.error('[MQTT]', e); setConnStatus('error'); setGameOverMsg('Lỗi kết nối máy chủ không dây!'); });
    return cli;
  };

  const disconnectOnline = () => {
    if (mqttRef.current) {
      if (connStatus === 'connected') sendNetworkData({ type: 'LEFT' });
      mqttRef.current.end(); mqttRef.current = null;
    }
    roomIdRef.current = ''; setRoomId(''); setConnStatus('');
  };

  const sendEmote = (emoji) => {
    setShowEmotePicker(false);
    showEmotePopup(emoji, 'me');
    if (mode === "Online" && connStatus === 'connected') {
      sendNetworkData({ type: 'EMOTE', emoji });
    }
  };

  const handleReturnToMenu = () => {
    setView('home');
    disconnectOnline();
    setGameOverMsg("");
    setRematchRejectedMsg("");
    setShowRematchRequestModal(false);
    setShowResignModal(false);
    setShowLeaveModal(false);
    playSfx('notify');
  };

  const triggerMatchSuccess = () => {
    playSfx('start');
    setMatchSuccessMsg("✨ Ghép trận thành công! Bắt đầu ngay...");
    setTimeout(() => setMatchSuccessMsg(""), 3500);
  };

  const startOnlineHost = () => {
    disconnectOnline(); setConnStatus('connecting');
    const rId = 'chess' + Math.floor(1000 + Math.random() * 9000);
    roomIdRef.current = rId; setRoomId(rId);

    const cli = connectMQTT((c) => {
      c.subscribe(`vnc_room_${rId}`);
      setConnStatus('waiting'); setOnlineRole('host'); setHumanColor('w'); resetGame();
    });

    cli.removeAllListeners('message');
    cli.on('message', (t, m) => {
      try {
        const d = JSON.parse(m.toString());
        if (d.sender === netIdRef.current) return;
        if (d.type === 'JOIN_REQ') {
          setConnStatus('connected'); setGameOverMsg(""); resetGame();
          sendNetworkData({ type: 'JOIN_ACK' });
          triggerMatchSuccess();
        } else dataCb.current(d);
      } catch (e) { }
    });
  };

  const joinOnlineGameCore = (targetIdStr) => {
    if (!targetIdStr.trim()) return; disconnectOnline();
    setConnStatus('connecting');
    const rId = targetIdStr.trim().toLowerCase(); roomIdRef.current = rId;

    let joined = false;
    const to = setTimeout(() => {
      if (!joined) { setConnStatus('error'); setGameOverMsg("Không tìm thấy bàn (Timeout)!"); disconnectOnline(); }
    }, 8000);

    const cli = connectMQTT((c) => {
      c.subscribe(`vnc_room_${rId}`);
      sendNetworkData({ type: 'JOIN_REQ' });
    });

    cli.removeAllListeners('message');
    cli.on('message', (t, m) => {
      try {
        const d = JSON.parse(m.toString());
        if (d.sender === netIdRef.current) return;
        if (d.type === 'JOIN_ACK') {
          joined = true; clearTimeout(to);
          setConnStatus('connected'); setOnlineRole('guest'); setHumanColor('b'); setGameOverMsg(""); resetGame();
          triggerMatchSuccess();
        } else dataCb.current(d);
      } catch (e) { }
    });
  };

  const findRandomMatch = () => {
    disconnectOnline(); setConnStatus('matchmaking');
    const tempId = 'chess' + Math.floor(1000 + Math.random() * 9000);
    roomIdRef.current = tempId;
    let qStatus = 'matchmaking';

    const cli = connectMQTT((c) => {
      c.subscribe('vnc_global_q'); c.subscribe(`vnc_room_${tempId}`);
      const ping = () => { if (qStatus === 'matchmaking') c.publish('vnc_global_q', JSON.stringify({ type: 'SEEK', rId: tempId, sender: netIdRef.current })); };
      ping();
      const iv = setInterval(() => { if (qStatus === 'matchmaking') ping(); else clearInterval(iv); }, 3000);
    });

    cli.removeAllListeners('message');
    cli.on('message', (t, m) => {
      try {
        const d = JSON.parse(m.toString());
        if (d.sender === netIdRef.current) return;

        if (t === 'vnc_global_q' && d.type === 'SEEK' && qStatus === 'matchmaking') {
          if (netIdRef.current < d.sender) {
            qStatus = 'connecting'; setConnStatus('connecting');
            cli.unsubscribe('vnc_global_q'); cli.unsubscribe(`vnc_room_${tempId}`);
            roomIdRef.current = d.rId; cli.subscribe(`vnc_room_${d.rId}`);
            setTimeout(() => sendNetworkData({ type: 'JOIN_REQ' }), 500);
          }
        }
        else if (t === `vnc_room_${roomIdRef.current}`) {
          if (d.type === 'JOIN_REQ') {
            qStatus = 'connected'; setConnStatus('connected');
            cli.unsubscribe('vnc_global_q');
            setOnlineRole('host'); setHumanColor('w'); setGameOverMsg(""); resetGame();
            sendNetworkData({ type: 'JOIN_ACK' }); triggerMatchSuccess();
          } else if (d.type === 'JOIN_ACK') {
            qStatus = 'connected'; setConnStatus('connected');
            cli.unsubscribe('vnc_global_q');
            setOnlineRole('guest'); setHumanColor('b'); setGameOverMsg(""); resetGame();
            triggerMatchSuccess();
          } else dataCb.current(d);
        }
      } catch (e) { }
    });
  };

  const triggerLeave = () => {
    playSfx('notify');
    setShowLeaveModal(true);
  };

  const triggerResign = () => {
    if (gameOverMsg) return;
    playSfx('notify');
    setShowResignModal(true);
  };

  const confirmResign = () => {
    setShowResignModal(false);
    playSfx('end');
    if (mode === "AI") {
      setGameOverMsg(`Bạn đã đầu hàng! Cờ ${humanColor === 'w' ? 'Đen' : 'Trắng'} (AI) Thắng`);
      handleRankUpdate(false, false);
    } else if (mode === "Online") {
      const myCol = onlineRole === 'host' ? 'w' : 'b';
      setGameOverMsg(`Bạn đã đầu hàng! Cờ ${myCol === 'w' ? 'Đen' : 'Trắng'} Thắng`);
      sendNetworkData({ type: 'RESIGN', color: myCol });
      handleRankUpdate(false, false);
    } else {
      const currentTurnColor = game.turn();
      setGameOverMsg(`Cờ ${currentTurnColor === 'w' ? 'Trắng' : 'Đen'} đầu hàng! Cờ ${currentTurnColor === 'w' ? 'Đen' : 'Trắng'} Thắng`);
      handleRankUpdate(false, false);
    }
  };

  const handleRestartClick = () => {
    playSfx('notify');
    if (mode === "Online") {
      if (connStatus !== 'connected') return;
      sendNetworkData({ type: 'REMATCH_REQ' });
      setGameOverMsg("⏳ Đã gửi lời mời tái đấu. Đang chờ đối thủ xác nhận...");
    } else {
      resetGame();
      playSfx('start');
    }
  };

  const acceptRematch = () => {
    setShowRematchRequestModal(false);
    sendNetworkData({ type: 'REMATCH_ACK' });
    doResetGameAndStart();
  };

  const rejectRematch = () => {
    setShowRematchRequestModal(false);
    sendNetworkData({ type: 'REMATCH_REJECT' });
    handleReturnToMenu();
  };

  const handleSquareClick = (row, col) => {
    if (!game || gameOverMsg || isThinking) return;
    if (mode === "Online") {
      if (connStatus !== 'connected') return;
      if (onlineRole === 'host' && game.turn() !== 'w') return;
      if (onlineRole === 'guest' && game.turn() !== 'b') return;
    }

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const isFlipped = (mode === "AI" && humanColor === "b") || (mode === "Online" && onlineRole === "guest");
    const actualCol = isFlipped ? 7 - col : col; const actualRow = isFlipped ? 7 - row : row;
    const square = files[actualCol] + ranks[actualRow];

    if (selectedSquare) {
      const moveObj = { from: selectedSquare, to: square, promotion: 'q' };
      const move = game.move(moveObj);

      if (move) {
        setLastMove({ from: move.from, to: move.to });
        setSelectedSquare(null); setLegalMoves([]); updateBoardInfo();
        playSfx(move.captured ? 'capture' : 'move');

        if (mode === "Online") sendNetworkData({ type: 'MOVE', move: moveObj });
        if (mode === "AI" && !game.game_over()) {
          setIsThinking(true);
          setTimeout(() => {
            const aiColor = humanColor === 'w' ? 'b' : 'w';
            const aiMove = getBestMove(game, aiColor, 5);
            if (aiMove) {
              const moveRes = game.move(aiMove);
              if (moveRes) setLastMove({ from: moveRes.from, to: moveRes.to });
              updateBoardInfo(); playSfx(aiMove.includes('x') ? 'capture' : 'move');
            }
            setIsThinking(false);
          }, 50);
        }
      } else {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square); setLegalMoves(game.moves({ square: square, verbose: true }));
        } else { setSelectedSquare(null); setLegalMoves([]); }
      }
    } else {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        if (mode === "AI" && piece.color !== humanColor) return;
        setSelectedSquare(square); setLegalMoves(game.moves({ square: square, verbose: true }));
      }
    }
  };

  const startGameView = (gMode, subMode = null, gJoinId = null) => {
    playSfx('notify'); setMode(gMode); setView('game');
    if (gMode === 'AI' || gMode === 'PvP') {
      disconnectOnline(); resetGame(); playSfx('start');
    } else if (gMode === 'Online') {
      if (subMode === 'matchmaking') findRandomMatch();
      else if (subMode === 'host') startOnlineHost();
      else if (subMode === 'guest' && gJoinId) joinOnlineGameCore(gJoinId);
    }
  };

  if (!game) return <div className="text-center mt-20 text-xl font-bold animate-pulse text-slate-500">Đang khởi tạo Engine...</div>;

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const isFlipped = (mode === "AI" && humanColor === "b") || (mode === "Online" && onlineRole === "guest");

  const renderBoard = () => {
    let squares = [];
    for (let r = 0; r < 8; r++) {
      const actualRow = isFlipped ? 7 - r : r;
      for (let c = 0; c < 8; c++) {
        const actualCol = isFlipped ? 7 - c : c;
        const isDark = (actualRow + actualCol) % 2 === 1;
        const squareId = files[actualCol] + ranks[actualRow];
        const piece = board[actualRow][actualCol];
        const isSelected = selectedSquare === squareId;
        const isLegalMove = legalMoves.find(m => m.to === squareId);
        const isLastMoveTarget = lastMove && lastMove.to === squareId;
        const isLastMoveSource = lastMove && lastMove.from === squareId;

        let bgClass = isDark ? "bg-[#769656]" : "bg-[#eeeed2]";
        if (isSelected) bgClass = "bg-[#f6f669]";
        else if (isLastMoveTarget) bgClass = isDark ? "bg-[#baca44]" : "bg-[#f6f669]";
        else if (isLegalMove) bgClass = isDark ? "bg-[#769656] relative" : "bg-[#eeeed2] relative";

        squares.push(
          <div key={squareId} onClick={() => handleSquareClick(r, c)} className={`aspect-square w-full h-full flex items-center justify-center relative ${bgClass} ${isLegalMove || (piece && piece.color === game.turn()) ? 'cursor-pointer' : ''}`}>
            {isLegalMove && !piece && <div className="absolute w-1/4 h-1/4 bg-black/20 rounded-full pointer-events-none"></div>}
            {isLastMoveSource && <div className="absolute w-1/4 h-1/4 bg-yellow-400/60 rounded-full pointer-events-none z-0 shadow-sm"></div>}
            {isLegalMove && piece && <div className="absolute inset-0 border-[4px] border-black/20 pointer-events-none"></div>}
            {piece && <img src={PIECE_IMAGES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]} alt={piece.type} className="w-[85%] h-[85%] object-contain chess-piece" draggable="false" />}
            {c === 0 && <span className={`absolute left-0.5 top-0.5 text-[8px] sm:text-[10px] font-bold select-none ${isDark ? 'text-white/70' : 'text-black/50'}`}>{ranks[actualRow]}</span>}
            {r === 7 && <span className={`absolute right-0.5 bottom-0 text-[8px] sm:text-[10px] font-bold select-none ${isDark ? 'text-white/70' : 'text-black/50'}`}>{files[actualCol]}</span>}
          </div>
        );
      }
    }
    return squares;
  };

  return (
    <React.Fragment>
      {audioEnabled && (
        <iframe width="0" height="0" src="https://www.youtube.com/embed/-SFkuXdDtg0?autoplay=1&loop=1&playlist=-SFkuXdDtg0" frameBorder="0" allow="autoplay" className="hidden" style={{ display: 'none' }}></iframe>
      )}

      {rankChangeMsg && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center px-4 animate-in fade-in zoom-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner ${rankChangeMsg.type === 'up' ? 'bg-yellow-100' : rankChangeMsg.type === 'down' ? 'bg-slate-100' : 'bg-blue-100'}`}>
              {rankChangeMsg.type === 'up' ? '🏆' : rankChangeMsg.type === 'down' ? '💔' : '🤝'}
            </div>
            <h3 className={`text-3xl font-black mb-2 ${rankChangeMsg.type === 'up' ? 'text-yellow-600' : rankChangeMsg.type === 'down' ? 'text-slate-600' : 'text-blue-600'}`}>{rankChangeMsg.title}</h3>
            <p className="text-slate-500 font-bold text-lg mb-8">{rankChangeMsg.msg}</p>
            <button onClick={() => setRankChangeMsg(null)} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 text-lg">Đóng</button>
          </div>
        </div>
      )}

      {view === 'landing' ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white relative overflow-hidden w-full px-4">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-700 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-700 rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-blob animation-delay-2000"></div>
            <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] bg-emerald-700 rounded-full mix-blend-screen filter blur-[100px] opacity-30 animate-blob animation-delay-4000"></div>
          </div>
          <div className="z-10 flex flex-col items-center w-full max-w-md text-center">
            <div className="text-8xl mb-6 drop-shadow-[0_0_40px_rgba(168,85,247,0.8)]">♟️</div>
            <h1 className="text-5xl sm:text-6xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-300 to-indigo-400">Cờ Vua Online</h1>
            <p className="text-white/60 text-lg font-medium mb-2">Chinh phục đấu trường trí tuệ</p>
            <p className="text-white/40 text-sm font-medium mb-10 max-w-xs">Đối kháng trực tuyến real-time • Hệ thống rank • Top 100 cao thủ toàn cầu</p>

            <div className="w-full flex flex-col gap-3 mb-8">
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 text-left">
                <span className="text-3xl">⚔️</span>
                <div><div className="font-bold text-white">Đấu Rank Trực Tuyến</div><div className="text-white/50 text-sm">Ghép trận tự động, leo rank từ Đồng → Thách Đấu</div></div>
              </div>
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 text-left">
                <span className="text-3xl">🤖</span>
                <div><div className="font-bold text-white">Luyện Với AI Thông Minh</div><div className="text-white/50 text-sm">AI minimax 5 tầng, rèn luyện kỹ năng mọi lúc</div></div>
              </div>
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 text-left">
                <span className="text-3xl">🏆</span>
                <div><div className="font-bold text-white">Bảng Phong Thần Top 100</div><div className="text-white/50 text-sm">Tranh đỉnh Thách Đấu với cao thủ trên toàn cầu</div></div>
              </div>
            </div>

            <button onClick={() => setView('auth')} className="w-full py-5 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black text-xl shadow-[0_0_40px_rgba(139,92,246,0.6)] transition-all hover:scale-[1.03] active:scale-95 mb-4">
              🎮 BẮT ĐẦU CHƠI NGAY
            </button>
            <p className="text-white/30 text-xs">Miễn phí hoàn toàn • Không cần cài đặt</p>
          </div>
        </div>
      ) : view === 'auth' ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white relative overflow-hidden w-full px-4">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob"></div>
          </div>
          <form onSubmit={e => { e.preventDefault(); handleAuth(); }} className="z-10 w-full max-w-sm bg-white/10 backdrop-blur-xl border border-white/20 p-6 sm:p-8 rounded-[2rem] shadow-2xl flex flex-col gap-4">
            <h2 className="text-3xl font-black text-center mb-2">{authMode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'}</h2>
            {authError && <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-center font-bold text-sm">{authError}</div>}
            <input type="text" placeholder="Số điện thoại hoặc Email" value={authInput} onChange={e => { setAuthInput(e.target.value); setAuthError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }} className="w-full bg-black/20 border border-white/10 text-white px-5 py-4 rounded-xl focus:outline-none focus:border-purple-500 font-medium" />
            <input ref={passwordRef} type="password" placeholder="Mật khẩu" value={passInput} onChange={e => { setPassInput(e.target.value); setAuthError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAuth(); } }} className="w-full bg-black/20 border border-white/10 text-white px-5 py-4 rounded-xl focus:outline-none focus:border-purple-500 font-medium" />

            <button type="submit" disabled={isAuthLoading} className="w-full py-4 mt-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-black text-lg shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50">
              {isAuthLoading ? 'ĐANG XỬ LÝ...' : (authMode === 'login' ? 'VÀO GAME' : 'ĐĂNG KÝ NGAY')}
            </button>

            <p className="text-center text-white/50 text-sm mt-4 font-medium">
              {authMode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
              <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }} className="ml-2 text-purple-400 hover:text-purple-300 font-bold underline decoration-2 underline-offset-2">
                {authMode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
              </button>
            </p>
          </form>
        </div>
      ) : view === 'leaderboard' ? (
        <div className="flex flex-col items-center min-h-screen bg-slate-900 text-white relative overflow-hidden w-full p-4 sm:p-8">
          <div className="z-10 w-full max-w-2xl flex flex-col h-[90vh] bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] shadow-2xl relative">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center gap-3">🏆 Bảng Phong Thần</h2>
              <button onClick={() => setView('home')} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center font-bold transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 scroller">
              {leaderboard.map((u, idx) => {
                const effectiveRankId = u.displayRankId || u.rankId;
                const rInfo = RANKS.find(r => r.id === effectiveRankId) || RANKS.find(r => r.id === u.rankId) || RANKS[0];
                const isMe = currentUser && u.id === currentUser.id;
                const userAvatar = isMe ? avatarUrl : localStorage.getItem(`vnc_avatar_${u.id}`);
                return (
                  <div key={u.id} className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border cursor-pointer hover:brightness-110 transition-all ${isMe ? "bg-indigo-500/20 border-indigo-500/50" : "bg-black/20 border-white/5"}`} onClick={() => setShowProfileUid(u.id)}>
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center font-black rounded-lg ${idx === 0 ? "bg-yellow-400 text-yellow-900" : idx === 1 ? "bg-slate-300 text-slate-800" : idx === 2 ? "bg-orange-400 text-orange-900" : "bg-white/10 text-white/50"}`}>{idx + 1}</div>
                    {/* Avatar */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl overflow-hidden border-2 border-white/20 shadow-md">
                      {userAvatar ? (
                        <img src={userAvatar} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center text-xl">{rInfo.icon}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base sm:text-lg truncate flex items-center gap-2">{u.displayName || u.username} {isMe && <span className="bg-indigo-500 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Bạn</span>}</div>
                      <div className={`text-xs sm:text-sm font-bold mt-1 ${rInfo.color}`}>{rInfo.name} • {u.stars} Sao</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <style>{`.scroller::-webkit-scrollbar { width: 6px; } .scroller::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }`}</style>
        </div>
      ) : view === 'home' ? (
        <div className="home-screen flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white relative overflow-hidden w-full py-10">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob"></div>
            <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob animation-delay-2000"></div>
            <div className="absolute bottom-[-10%] left-[20%] w-96 h-96 bg-emerald-600 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob animation-delay-4000"></div>
          </div>

          <div className="z-10 flex flex-col items-center w-full max-w-md px-4 pt-10 pb-20 overflow-y-auto w-full">
            {currentUser && (() => {
              const me = leaderboard.find(x => x.id === currentUser.id);
              const computedRankId = me ? (me.displayRankId || me.rankId) : (currentUser.displayRankId || currentUser.rankId);
              const r = RANKS.find(x => x.id === computedRankId) || RANKS[0];
              return (
                <div className="w-full bg-gradient-to-br from-indigo-900/80 to-slate-900/80 backdrop-blur-md border border-indigo-500/30 p-5 rounded-[2rem] shadow-2xl mb-8 flex items-center gap-5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative group/avatar">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                      id="avatar-upload-input"
                    />
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover rounded-2xl border-2 border-indigo-400/60 shadow-lg cursor-pointer"
                        onClick={() => setShowProfileUid(currentUser.id)}
                      />
                    ) : (
                      <div
                        className="w-full h-full bg-black/40 rounded-2xl border border-white/10 flex items-center justify-center text-4xl sm:text-5xl shadow-inner cursor-pointer"
                        onClick={() => setShowProfileUid(currentUser.id)}
                      >
                        {r.icon}
                      </div>
                    )}
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-500 hover:bg-indigo-400 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900 transition-colors z-10"
                      title="Đổi ảnh đại diện"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 w-0">
                    <div className="flex justify-between items-start mb-1 w-full gap-2">
                      <h3 className="font-black text-xl sm:text-2xl truncate flex-1 flex items-center gap-2 group">{currentUser.displayName || currentUser.username}<button onClick={handleEditDisplayName} className="opacity-0 group-hover:opacity-100 transition-opacity text-base hover:scale-125 transition-transform" title="Đổi tên hiển thị">✏️</button></h3>
                      <button onClick={() => { setCurrentUser(null); localStorage.removeItem(DB_CURRENT); setView('landing'); }} className="text-white/40 shrink-0 hover:text-red-400 text-xs font-bold bg-white/5 py-1 px-3 rounded-full transition-colors">Đăng xuất</button>
                    </div>
                    <div className={`font-black text-sm sm:text-base ${r.color} mb-2 uppercase tracking-wide`}>{r.name}</div>
                    <div className="w-full bg-black/40 h-3 rounded-full overflow-hidden border border-white/5 relative">
                      {r.id < 7 && <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${(currentUser.stars / r.starsToUp) * 100}%` }}></div>}
                      {r.id >= 7 && <div className="h-full bg-gradient-to-r from-yellow-500 to-red-500 w-full animate-pulse"></div>}
                    </div>
                    <div className="text-right text-xs text-white/50 font-bold mt-1">{r.id < 7 ? `${currentUser.stars}/${r.starsToUp} Sao` : `${currentUser.stars} Sao`}</div>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-3 w-full mb-6">
              <button onClick={() => { fetchLeaderboard(); setView('leaderboard'); }} className="flex-1 py-4 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-black text-lg shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center justify-center gap-2 transition-transform hover:scale-[1.03]">
                🏆 TOP 100
              </button>
              <button onClick={() => setShowFriendsModal(true)} className="flex-1 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-black text-lg shadow-[0_0_30px_rgba(99,102,241,0.5)] flex items-center justify-center gap-2 transition-transform hover:scale-[1.03]">
                👥 BẠN BÈ
              </button>
            </div>

            <div className="w-full bg-white/10 backdrop-blur-xl border border-white/20 p-4 sm:p-6 rounded-[2rem] shadow-2xl flex flex-col gap-3 sm:gap-4 mb-6">
              <button onClick={() => { setGameType('ranked'); startGameView('Online', 'matchmaking'); }} className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-black text-lg shadow-[0_0_20px_rgba(219,39,119,0.5)] flex items-center justify-center gap-2 transition-transform hover:scale-[1.03] animate-pulse">
                ⚔️ TỰ ĐỘNG GHÉP RANK
              </button>

              <button onClick={() => { setGameType('normal'); startGameView('Online', 'matchmaking'); }} className="w-full py-3 px-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold text-[15px] sm:text-base shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                🌍 Ghép Trận Phổ Thông
              </button>

              <div className="h-px w-full bg-white/10 my-2"></div>

              <button onClick={() => { setGameType('normal'); startGameView('Online', 'host'); }} className="w-full py-3 px-2 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-[15px] shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                🏠 Tạo Bàn Với Bạn Bè (Không tính điểm)
              </button>

              <div className="flex gap-2 w-full">
                <input type="text" value={globalJoinId} onChange={e => setGlobalJoinId(e.target.value)} placeholder="Nhập mã bàn..." className="flex-1 w-0 min-w-0 bg-white/20 border border-white/30 text-white placeholder-white/60 px-4 py-3 rounded-2xl focus:outline-none focus:bg-white/30 font-mono text-center font-bold text-[15px] transition-colors" />
                <button onClick={() => { setGameType('normal'); startGameView('Online', 'guest', globalJoinId); }} disabled={!globalJoinId.trim()} className="px-5 shrink-0 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-[15px] shadow-lg transition-transform hover:scale-[1.02] active:scale-95">Vào</button>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={() => { setGameType('normal'); startGameView('PvP'); }} className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow-inner flex flex-col items-center justify-center gap-1 transition-transform hover:scale-[1.02]">
                <span className="text-2xl">👥</span> 2 Người Cùng Máy
              </button>
              <button onClick={() => { setGameType('normal'); startGameView('AI'); }} className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow-inner flex flex-col items-center justify-center gap-1 transition-transform hover:scale-[1.02]">
                <span className="text-2xl">🤖</span> Luyện Với CPU
              </button>
            </div>



            <label className="mt-8 flex items-center gap-3 cursor-pointer group bg-black/20 px-6 py-3 rounded-full border border-white/5 hover:bg-black/40 transition-colors">
              <div className="relative">
                <input type="checkbox" checked={audioEnabled} onChange={e => setAudioEnabled(e.target.checked)} className="sr-only" />
                <div className={`block w-12 h-7 rounded-full transition-colors ${audioEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${audioEnabled ? 'translate-x-5' : ''}`}></div>
              </div>
              <span className="text-slate-300 font-bold text-sm group-hover:text-white transition-colors">Bật Âm Thanh</span>
            </label>
          </div>
        </div>
      ) : (
        <div className="min-h-screen w-full bg-slate-100 p-4 sm:p-8 flex flex-col items-center relative">

          {matchSuccessMsg && (
            <div className="fixed top-8 z-50 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold px-8 py-3 rounded-full shadow-[0_10px_40px_rgba(16,185,129,0.5)] animate-bounce border-2 border-white flex items-center gap-3 text-lg">
              {matchSuccessMsg}
            </div>
          )}

          {showLeaveModal && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center px-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-yellow-100 text-yellow-500 rounded-full flex items-center justify-center text-4xl mb-4">🚪</div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Bạn Muốn Rời Phòng?</h3>
                <p className="text-slate-500 font-medium mb-8">Bạn có chắc chắn muốn rời khỏi bàn cờ ngay lúc này và quay về Sảnh Chính không?</p>
                <div className="flex gap-4 w-full">
                  <button onClick={() => setShowLeaveModal(false)} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Trụ Lại Kéo Rank</button>
                  <button onClick={handleReturnToMenu} className="flex-1 py-3 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-xl shadow-lg transition-colors">Đồng Ý Rời Đi</button>
                </div>
              </div>
            </div>
          )}

          {showResignModal && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center px-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-4xl mb-4">🏳️</div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Đầu Hàng Ván Cờ?</h3>
                <p className="text-slate-500 font-medium mb-8">Bạn có chắc chắn muốn nhận thua không? Quyết định này sẽ gửi thẳng đến đối thủ.</p>
                <div className="flex gap-4 w-full">
                  <button onClick={() => setShowResignModal(false)} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Chơi Tiếp</button>
                  <button onClick={confirmResign} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition-colors">Chấp Nhận Thua</button>
                </div>
              </div>
            </div>
          )}

          {showRematchRequestModal && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center px-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center text-5xl mb-4">🔁</div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Lời Mời Tái Đấu!</h3>
                <p className="text-slate-500 font-medium mb-8">Đối thủ muốn phục thù. Bạn có dám nhận lời Tái Đấu một ván nữa không?</p>
                <div className="flex gap-4 w-full">
                  <button onClick={rejectRematch} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Từ Chối</button>
                  <button onClick={acceptRematch} className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-colors">Sẵn Sàng Múc</button>
                </div>
              </div>
            </div>
          )}

          {rematchRejectedMsg && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center px-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-5xl mb-4">🏃</div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Lại Bỏ Chạy Mất Rồi!</h3>
                <p className="text-slate-500 font-medium mb-8">{rematchRejectedMsg}</p>
                <button onClick={handleReturnToMenu} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-lg transition-colors">Trở Về Sảnh Chính</button>
              </div>
            </div>
          )}

          <div className="w-full max-w-lg mb-6 flex items-center justify-between relative z-10 p-2">
            <div className="flex gap-2 relative">
              <button onClick={triggerLeave} className="px-4 md:px-5 py-2.5 bg-white shadow-sm rounded-full text-sm font-bold text-slate-600 hover:text-blue-600 hover:shadow-md transition-all flex items-center gap-2 border border-slate-200 group">
                <span className="group-hover:-translate-x-1 transition-transform">⬅</span> <span className="hidden sm:inline">Rời Bàn</span>
              </button>
              {(mode !== "Online" || connStatus === 'connected') && (
                <React.Fragment>
                  <button onClick={triggerResign} className="hidden sm:flex px-4 md:px-5 py-2.5 bg-red-50 shadow-sm rounded-full text-sm font-bold text-red-600 hover:text-red-700 hover:bg-red-100 hover:shadow-md transition-all items-center gap-2 border border-red-200">
                    🏳️ Đầu Hàng
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowEmotePicker(!showEmotePicker)} className="px-3 py-2.5 bg-white shadow-sm rounded-full text-xl hover:bg-slate-100 hover:shadow-md transition-all flex items-center justify-center border border-slate-200" title="Biểu cảm">
                      😛
                    </button>
                    {showEmotePicker && (
                      <div className="absolute bottom-0px left-0 mb-3 bg-white shadow-xl border border-slate-200 rounded-3xl p-3 flex flex-wrap w-[200px] gap-2 z-[100] animate-in fade-in zoom-in duration-200">
                        {['😛', '🤣', '😭', '😡', '🔥', '👏', '🥶', '🤡'].map(e => (
                          <button key={e} onClick={() => sendEmote(e)} className="text-3xl hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                    {floatingEmote && (
                      <div className="absolute bottom-full left-4 mb-5 bg-white/90 shadow-lg px-4 py-2 rounded-2xl border border-slate-200 animate-bounce duration-300 z-[110] flex items-center gap-2">
                        <span className="text-4xl">{floatingEmote.emoji}</span>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setAudioEnabled(!audioEnabled)} className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-xl hover:bg-slate-50 transition-colors border border-slate-200" title="Bật/Tắt Âm Thanh">
                {audioEnabled ? '🔊' : '🔇'}
              </button>
              {mode === "AI" && (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                  <span className="hidden sm:inline text-xs text-slate-500 font-bold uppercase tracking-wider">Màu:</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setHumanColor("w"); playSfx('notify'); }} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm transition-all ${humanColor === "w" ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>W</button>
                    <button onClick={() => { setHumanColor("b"); playSfx('notify'); }} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm transition-all ${humanColor === "b" ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>B</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full max-w-lg flex flex-col items-center justify-center mb-8 relative z-20">
            {mode === "Online" && connStatus !== 'connected' && (
              <div className="w-full absolute top-[10%] left-0 bg-white/90 backdrop-blur-md border border-slate-200 p-8 rounded-[2rem] shadow-2xl z-30 animate-in fade-in slide-in-from-bottom-4">
                {connStatus === 'connecting' && (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="font-black text-blue-800 text-xl mb-2">Đang thiết lập bàn cờ mạng...</p>
                    <p className="text-slate-500 font-medium text-sm">Vui lòng đợi cấu hình bảo mật 443 HTTPS.</p>
                  </div>
                )}
                {connStatus === 'matchmaking' && (
                  <div className="text-center py-4">
                    <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-6 relative">
                      <span className="w-full h-full absolute rounded-full bg-purple-400 animate-ping opacity-60"></span>
                      <span className="text-4xl relative z-10">🌍</span>
                    </div>
                    <p className="font-black text-purple-800 text-2xl mb-2">Đang Chờ Người Chơi Khác...</p>
                    <p className="text-slate-500 font-medium text-sm mb-6">Đang rà quét sóng toàn cầu siêu tốc độ (Auto Sync).</p>
                  </div>
                )}
                {connStatus === 'error' && (
                  <div className="text-center py-4">
                    <div className="text-5xl mb-4">😓</div>
                    <h3 className="font-black text-red-600 text-xl mb-2 mt-2">Đã Xảy Ra Lỗi</h3>
                    <p className="text-slate-600 font-medium text-sm bg-red-50 p-3 rounded-lg border border-red-100 inline-block mb-4">{gameOverMsg || "Bàn cờ không tồn tại hoặc lỗi mạng ngắt kết nối."}</p>
                    <button onClick={handleReturnToMenu} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 transition-transform hover:scale-105 shadow-md active:scale-95 text-white font-bold rounded-xl w-full">Về Sảnh Máy Chủ</button>
                  </div>
                )}
                {connStatus === 'waiting' && (
                  <div className="text-center py-4">
                    <p className="text-blue-800 mb-4 font-bold text-lg">Bàn cờ riêng đã lập xong!</p>
                    <div className="bg-blue-50 border-2 border-dashed border-blue-300 p-4 rounded-2xl mb-6 relative group overflow-hidden">
                      <div className="absolute inset-0 bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1 relative z-10">Copy Mã Số Dưới Đây:</p>
                      <p className="text-4xl font-black text-blue-900 tracking-widest relative z-10">{roomId}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-500 flex items-center justify-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500 animate-ping inline-block"></span>
                      Gửi mã này cho bạn bè và chờ nhé...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`relative ${mode === "Online" && connStatus !== 'connected' && connStatus !== 'abandoned' ? 'opacity-20 pointer-events-none blur-sm' : ''} transition-all duration-700 w-full max-w-[500px] lg:max-w-[550px] mb-4`}>
            <div className="board-grid shadow-2xl rounded-lg overflow-hidden border-[6px] sm:border-[10px] border-slate-900 bg-[#eeeed2] w-full aspect-square">{renderBoard()}</div>

            {floatingEmote && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[40] text-7xl md:text-[100px] drop-shadow-2xl animate-bounce pointer-events-none transition-opacity duration-300 flex flex-col items-center">
                <div className="text-sm font-bold bg-black/60 text-white px-4 py-1 rounded-full mb-2">{floatingEmote.sender === 'me' ? 'Bạn' : 'Đối Thủ'}</div>
                {floatingEmote.emoji}
              </div>
            )}

            {gameOverMsg && !showRematchRequestModal && !rematchRejectedMsg && (
              <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-md flex flex-col items-center justify-center z-20 transition-all animate-in zoom-in duration-500 rounded-lg">
                <h2 className="text-3xl sm:text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] mb-8 px-4 text-center leading-tight">{gameOverMsg}</h2>
                <div className="flex flex-col sm:flex-row gap-4 px-4 w-full justify-center">
                  <button onClick={handleReturnToMenu} className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold sm:text-lg rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-transform hover:scale-105 active:scale-95 border border-white/10 flex-1 whitespace-nowrap">Về Sảnh Máy Chủ</button>

                  {(mode !== "Online" || connStatus === 'connected') && (
                    <button onClick={handleRestartClick} className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black sm:text-lg rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.6)] transition-transform hover:scale-105 active:scale-95 border border-white/20 flex-1 whitespace-nowrap">Chơi Lại (Phục Thù)</button>
                  )}
                </div>
              </div>
            )}
            {isThinking && (
              <div className="absolute -top-12 right-0 bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-3 shadow-lg">
                <span className="inline-block w-3 h-3 bg-blue-500 rounded-full animate-ping"></span> AI đang suy nghĩ...
              </div>
            )}
          </div>

          {(mode !== "Online" || connStatus === 'connected') && (
            <div className="mt-8 flex justify-between w-full max-w-lg items-center px-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className={`font-black uppercase tracking-wider text-sm ${game.turn() === 'b' ? 'text-indigo-600' : 'text-slate-400'}`}>Đen Đi</span>
                <span className={`w-4 h-4 rounded-full ${game.turn() === 'b' ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]' : 'bg-slate-300'}`}></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileUid && (() => {
        const u = leaderboard.find(x => x.id === showProfileUid) || (showProfileUid === currentUser?.id ? currentUser : null);
        if (!u) return null;
        const rInfo = RANKS.find(r => r.id === (u.displayRankId || u.rankId)) || RANKS[0];

        return (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[300] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col relative">
              <button onClick={() => setShowProfileUid(null)} className="absolute top-6 right-6 w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500 transition-colors z-10">✕</button>

              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 pt-12 text-white relative">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 relative shrink-0">
                    {showProfileUid === currentUser?.id && avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover rounded-3xl border-2 border-white/40 shadow-2xl"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/20 backdrop-blur-md rounded-3xl border border-white/30 flex items-center justify-center text-5xl shadow-2xl">
                        {rInfo.icon}
                      </div>
                    )}
                    {showProfileUid === currentUser?.id && (
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-indigo-500 transition-colors"
                        title="Đổi ảnh đại diện"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#6366f1" className="w-3.5 h-3.5">
                          <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black mb-1">{u.displayName || u.username}</h2>
                    <p className={`font-bold ${rInfo.color.replace('text-', 'text-white/80')} uppercase tracking-wider text-sm flex items-center gap-2`}>{rInfo.name} • {u.stars} Sao</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 scroller">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                    <span className="text-2xl mb-1">🎮</span>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Trận Đã Chơi</span>
                    <span className="text-2xl font-black text-slate-800">{profileStats.total}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                    <span className="text-2xl mb-1">📈</span>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tỉ Lệ Thắng</span>
                    <span className="text-2xl font-black text-slate-800">{profileStats.winRate}%</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">🤝 Tri Kỉ & Bạn Thân</h3>
                  <div className="flex flex-wrap gap-2">
                    {profileStats.soulmates.length === 0 ? <p className="text-slate-300 text-sm italic font-bold">Chưa có kết nối nào...</p> :
                      profileStats.soulmates.map(f => {
                        const otherId = f.uids.find(id => id !== showProfileUid);
                        const otherUser = leaderboard.find(x => x.id === otherId);
                        const cat = f.category;
                        const icon = cat === 'love' ? '❤️' : (cat === 'sister' ? '🌸' : (cat === 'brother' ? '✊' : '🤝'));
                        return (
                          <div key={f.id} className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-full flex items-center gap-2">
                            <span className="text-lg">{icon}</span>
                            <span className="text-sm font-bold text-slate-700">{otherUser?.displayName || otherUser?.username || otherId}</span>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FRIENDS MODAL */}
      {showFriendsModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col relative">
            <button onClick={() => { setShowFriendsModal(false); setSearchResults([]); setSearchQuery(''); }} className="absolute top-6 right-6 w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500 transition-colors z-10">✕</button>

            <div className="p-8 pb-4">
              <h2 className="text-3xl font-black text-slate-800 mb-6 flex items-center gap-3">👥 Bạn Bè ({friends.length})</h2>
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchUsers(searchQuery)} placeholder="Tìm ID hoặc Tên người chơi..." className="flex-1 bg-transparent border-none px-4 py-2 focus:outline-none font-bold text-slate-700" />
                <button onClick={() => searchUsers(searchQuery)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-black transition-colors">TÌM</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 pt-0 space-y-6 scroller">
              {searchResults.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-3">Kết quả tìm kiếm</h3>
                  <div className="space-y-2">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <span className="font-bold text-indigo-900">{u.displayName || u.username}</span>
                        {currentUser?.id !== u.id && !friends.find(f => f.uids.includes(u.id)) && !friendRequests.find(f => f.uids.includes(u.id)) ? (
                          <button onClick={() => sendFriendRequest(u.id)} className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg font-black hover:bg-indigo-700 transition-colors">+ KẾT BẠN</button>
                        ) : <span className="text-[10px] font-black text-indigo-300 uppercase italic">Đã kết nối</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {friendRequests.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] mb-3">Lời mời chờ chấp nhận ({friendRequests.length})</h3>
                  <div className="space-y-2">
                    {friendRequests.map(r => {
                      const sender = leaderboard.find(x => x.id === r.senderId) || { username: r.senderId };
                      return (
                        <div key={r.id} className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                          <span className="font-bold text-red-900">{sender.displayName || sender.username}</span>
                          <button onClick={() => acceptFriendRequest(r.id)} className="text-xs bg-red-500 text-white px-4 py-2 rounded-lg font-black hover:bg-red-600 transition-colors">CHẤP NHẬN</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Danh sách bạn bè</h3>
                <div className="space-y-3">
                  {friends.length === 0 ? <p className="text-center py-10 text-slate-300 font-bold italic">Bạn chưa có người bạn nào 😭</p> :
                    friends.map(f => {
                      const otherId = f.uids.find(id => id !== currentUser.id);
                      const u = leaderboard.find(x => x.id === otherId) || { username: otherId };
                      const isPendingMe = f.pendingCategory && f.pendingCategorySenderId !== currentUser.id;
                      const isSentByMe = f.pendingCategory && f.pendingCategorySenderId === currentUser.id;

                      const friendAvatar = localStorage.getItem(`vnc_avatar_${otherId}`);
                      return (
                        <div key={f.id} className="flex flex-col p-4 bg-slate-50 rounded-2xl border border-slate-100 group gap-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar bạn bè */}
                            <div
                              className="w-11 h-11 shrink-0 rounded-xl overflow-hidden bg-indigo-100 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform shadow-sm border border-slate-200"
                              onClick={() => setShowProfileUid(u.id)}
                              title="Xem hồ sơ"
                            >
                              {friendAvatar ? (
                                <img src={friendAvatar} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xl select-none">
                                  {(u.displayName || u.username || '?')[0].toUpperCase()}
                                </span>
                              )}
                            </div>

                            {/* Tên + ID */}
                            <div className="flex-1 min-w-0" onClick={() => setShowProfileUid(u.id)}>
                              <div className="font-bold text-slate-800 flex items-center gap-2 cursor-pointer hover:text-indigo-600">
                                {u.displayName || u.username}
                                {f.category && f.category !== 'none' && (
                                  <span className="text-lg" title={f.category}>
                                    {f.category === 'love' ? '❤️' : (f.category === 'sister' ? '🌸' : (f.category === 'brother' ? '✊' : '🤝'))}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold">ID: {u.id}</div>
                            </div>

                            {/* Actions: tri kỉ + xóa */}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              {['love', 'sister', 'brother', 'friend'].map(cat => (
                                <button key={cat} onClick={() => setTriKi(f.id, cat, otherId)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border ${f.category === cat ? 'bg-white border-transparent shadow-sm' : 'bg-transparent border-slate-200 grayscale opacity-40 hover:grayscale-0 hover:opacity-100'}`} title={`Sét ${cat}`}>
                                  {cat === 'love' ? '❤️' : (cat === 'sister' ? '🌸' : (cat === 'brother' ? '✊' : '🤝'))}
                                </button>
                              ))}
                              <button onClick={() => setTriKi(f.id, 'none', otherId)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] border border-slate-200 text-slate-400 font-black hover:bg-red-50 hover:text-red-500 hover:border-red-200" title="Hủy tri kỉ">♡</button>
                              <button onClick={() => removeFriend(f.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] border border-red-200 text-red-400 font-black hover:bg-red-500 hover:text-white" title="Xóa bạn bè">🗑</button>
                            </div>
                          </div>

                          {isPendingMe && (
                            <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-lg border border-indigo-100 mt-1">
                              <span className="text-xs font-bold text-indigo-800 flex items-center gap-2">
                                Mời làm {f.pendingCategory === 'love' ? '❤️' : (f.pendingCategory === 'sister' ? '🌸' : (f.pendingCategory === 'brother' ? '✊' : '🤝'))}
                              </span>
                              <div className="flex gap-2">
                                <button onClick={() => acceptSoulmateRequest(f.id, f.pendingCategory)} className="text-[10px] bg-indigo-600 text-white px-3 py-1.5 rounded font-black hover:bg-indigo-700">CHẤP NHẬN</button>
                                <button onClick={() => rejectSoulmateRequest(f.id)} className="text-[10px] bg-slate-300 text-slate-700 px-3 py-1.5 rounded font-black hover:bg-slate-400">TỪ CHỐI</button>
                              </div>
                            </div>
                          )}
                          {isSentByMe && (
                            <div className="text-[10px] font-bold text-slate-400 italic bg-slate-100 p-2 rounded-lg mt-1 text-center border border-slate-200">
                              Đang chờ đồng ý làm {f.pendingCategory === 'love' ? '❤️' : (f.pendingCategory === 'sister' ? '🌸' : (f.pendingCategory === 'brother' ? '✊' : '🤝'))}...
                            </div>
                          )}
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
