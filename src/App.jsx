import React, { useState, useEffect } from 'react';
import { Book, Camera, CheckCircle, Edit3, Sparkles, LogOut, Plus, Trash2, ChevronLeft, BookOpen, Users, Shield } from 'lucide-react';
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

const APP_CONFIG = {
  allowedUsers: JSON.parse(import.meta.env.VITE_ALLOWED_USERS || "{}"),
};

// --- THEMES ---
const THEMES = {
  mei: { id: 'mei', name: 'Mei', bg: 'bg-pink-50', card: 'bg-white', text: 'text-gray-800', textMuted: 'text-gray-500', primary: 'bg-pink-500 hover:bg-pink-600', primaryText: 'text-pink-600', secondary: 'bg-purple-100 text-purple-700', border: 'border-pink-200', icon: '🌸' },
  lele: { id: 'lele', name: 'Lele', bg: 'bg-rose-950', card: 'bg-rose-900', text: 'text-rose-100', textMuted: 'text-rose-400', primary: 'bg-pink-600 hover:bg-pink-700', primaryText: 'text-pink-300', secondary: 'bg-rose-800 text-pink-200', border: 'border-rose-800', icon: '💖' },
  ny: { id: 'ny', name: 'Ny', bg: 'bg-blue-50', card: 'bg-white', text: 'text-gray-800', textMuted: 'text-gray-500', primary: 'bg-blue-500 hover:bg-blue-600', primaryText: 'text-blue-600', secondary: 'bg-cyan-100 text-cyan-700', border: 'border-blue-200', icon: '🚀' },
  dx: { id: 'dx', name: 'DX', bg: 'bg-slate-950', card: 'bg-slate-900', text: 'text-slate-100', textMuted: 'text-slate-400', primary: 'bg-blue-600 hover:bg-blue-700', primaryText: 'text-blue-400', secondary: 'bg-slate-800 text-blue-300', border: 'border-slate-800', icon: '🌌' },
  parent: { id: 'parent', name: 'Parent Hub', bg: 'bg-emerald-50', card: 'bg-white', text: 'text-gray-800', textMuted: 'text-gray-500', primary: 'bg-emerald-500 hover:bg-emerald-600', primaryText: 'text-emerald-600', secondary: 'bg-teal-100 text-teal-700', border: 'border-emerald-200', icon: '👨‍👩‍👧‍👦' }
};

// --- GEMINI API HELPER ---
const callGemini = async (prompt, base64Image = null, isJson = false) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const parts = [{ text: prompt }];
  
  if (base64Image) {
    const mimeType = base64Image.match(/data:(.*?);base64/)[1];
    const data = base64Image.split(',')[1];
    parts.push({ inlineData: { mimeType, data } });
  }
  
  const payload = { contents: [{ parts }], generationConfig: isJson ? { responseMimeType: "application/json" } : {} };

  // Use a more conservative retry strategy for 429s
  for (let attempt = 0, delay = 2000; attempt < 3; attempt++, delay *= 3) {
    try {
      const response = await fetch(url, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error(`Gemini API Error (${response.status}):`, errorBody);
        
        if (response.status === 429) {
          throw new Error("RATE_LIMIT");
        }
        throw new Error(`HTTP_${response.status}`);
      }
      
      const result = await response.json();
      if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("INVALID_RESPONSE");
      }
      return result.candidates[0].content.parts[0].text;
    } catch (e) {
      // Don't retry on rate limit or if we've exhausted attempts
      if (e.message === "RATE_LIMIT" || attempt === 2) throw e;
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

const compressImage = (file, maxWidth = 800) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = maxWidth / Math.max(img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
    };
  });
};

const performWarp = (img, c, targetW, targetH) => {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");

  const getPt = (u, v) => ({
    x:
      (img.width / 1000) *
      ((1 - u) * (1 - v) * c.tl[0] +
        u * (1 - v) * c.tr[0] +
        u * v * c.br[0] +
        (1 - u) * v * c.bl[0]),
    y:
      (img.height / 1000) *
      ((1 - u) * (1 - v) * c.tl[1] +
        u * (1 - v) * c.tr[1] +
        u * v * c.br[1] +
        (1 - u) * v * c.bl[1]),
  });

  const divs = 16;
  for (let y = 0; y < divs; y++) {
    for (let x = 0; x < divs; x++) {
      const p1 = getPt(x / divs, y / divs),
        p2 = getPt((x + 1) / divs, y / divs);
      const p4 = getPt(x / divs, (y + 1) / divs);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo((x * targetW) / divs, (y * targetH) / divs);
      ctx.lineTo(((x + 1) * targetW) / divs, (y * targetH) / divs);
      ctx.lineTo(((x + 1) * targetW) / divs, ((y + 1) * targetH) / divs);
      ctx.lineTo((x * targetW) / divs, ((y + 1) * targetH) / divs);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        img,
        p1.x,
        p1.y,
        p2.x - p1.x || 1,
        p4.y - p1.y || 1,
        (x * targetW) / divs,
        (y * targetH) / divs,
        targetW / divs + 1,
        targetH / divs + 1,
      );
      ctx.restore();
    }
  }
  return canvas.toDataURL("image/jpeg", 0.85);
};

const warpImage = (base64, corners, targetW, targetH) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => resolve(performWarp(img, corners, targetW, targetH));
  });
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [activeKidEmail, setActiveKidEmail] = useState(null);

  const [allFamilyBooks, setAllFamilyBooks] = useState([]);
  const [view, setView] = useState("auth"); // auth, dashboard, list, add, detail
  const [selectedBook, setSelectedBook] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleEmailLogin = (email) => {
    const emailKey = email.toLowerCase();
    const configUser = APP_CONFIG.allowedUsers[emailKey];
    if (configUser) {
      setAppUser(configUser);
      if (configUser.role === "parent") {
        setView("dashboard");
      } else {
        setActiveKidEmail(configUser.email.toLowerCase());
        setView("list");
      }
    } else {
      alert("This email is not authorized for this family app.");
      signOut(auth);
      setAppUser(null);
      setView("auth");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      handleEmailLogin(result.user.email);
    } catch (error) {
      console.error("Google Auth Error", error);
      alert("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setAppUser(null);
    setActiveKidEmail(null);
    setView("auth");
  };

  // Auth Setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (u && u.email) {
        handleEmailLogin(u.email);
      } else {
        setView("auth");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Books
  useEffect(() => {
    if (!firebaseUser || !appUser) return;

    // Using a standard root collection for the real deployment
    const booksRef = collection(db, "family_books");

    const unsubscribe = onSnapshot(
      booksRef,
      (snapshot) => {
        const data = [];
        snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => b.createdAt - a.createdAt);
        setAllFamilyBooks(data);
      },
      (error) => {
        console.error("Error fetching books:", error);
      },
    );

    return () => unsubscribe();
  }, [firebaseUser, appUser]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">
        Loading NM Bookmory...
      </div>
    );

  const currentTheme =
    appUser?.role === "parent" && view === "dashboard"
      ? THEMES.parent
      : THEMES[APP_CONFIG.allowedUsers[activeKidEmail]?.themeId || "mei"];

  const visibleBooks = allFamilyBooks.filter(
    (b) => b.ownerEmail === activeKidEmail,
  );
  const activeKidConfig =
    APP_CONFIG.allowedUsers[activeKidEmail?.toLowerCase()];

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 ${currentTheme?.bg || "bg-gray-50"} ${currentTheme?.text || "text-gray-800"}`}
    >
      {view === "auth" ? (
        <LoginScreen onGoogleLogin={handleGoogleLogin} />
      ) : (
        <div className="max-w-md mx-auto min-h-screen flex flex-col relative pb-20 md:pb-0">
          <Header
            theme={currentTheme}
            title={
              appUser.role === "parent" && view === "dashboard"
                ? "Parent Hub"
                : `${activeKidConfig?.name}'s Books`
            }
            onLogout={handleLogout}
            showBack={appUser.role === "parent" && view !== "dashboard"}
            onBack={() => setView("dashboard")}
          />

          <main className="flex-1 p-4 overflow-y-auto">
            {view === "dashboard" && (
              <ParentDashboard
                config={APP_CONFIG}
                themes={THEMES}
                onSelectKid={(email) => {
                  setActiveKidEmail(email);
                  setView("list");
                }}
              />
            )}
            {view === "list" && (
              <BookList
                books={visibleBooks}
                theme={currentTheme}
                onAdd={() => setView("add")}
                onSelect={(b) => {
                  setSelectedBook(b);
                  setView("detail");
                }}
              />
            )}
            {view === "add" && (
              <AddBook
                theme={currentTheme}
                ownerEmail={activeKidEmail}
                onBack={() => setView("list")}
              />
            )}
            {view === "detail" && (
              <BookDetail
                book={selectedBook}
                theme={currentTheme}
                onBack={() => setView("list")}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENTS ---

function LoginScreen({ onGoogleLogin }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-100 to-pink-100 p-6">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-sm w-full text-center space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-800 mb-2">NM Bookmory</h1>
          <p className="text-gray-500 font-medium">Read, track, and learn together!</p>
        </div>
        <button 
          onClick={onGoogleLogin}
          className="w-full flex items-center justify-center space-x-3 p-4 bg-white border-2 border-gray-200 rounded-2xl hover:bg-gray-50 transition shadow-sm font-bold text-gray-700"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          <span>Sign in with Gmail</span>
        </button>
      </div>
    </div>
  );
}

function Header({ theme, title, onLogout, showBack, onBack }) {
  return (
    <header className={`p-4 flex justify-between items-center ${theme.card} shadow-sm rounded-b-3xl z-10 sticky top-0`}>
      <div className="flex items-center space-x-2">
        {showBack ? (
          <button onClick={onBack} className={`p-2 mr-1 rounded-full transition ${theme.secondary} ${theme.textMuted}`}><ChevronLeft size={20}/></button>
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${theme.bg}`}>{theme.icon}</div>
        )}
        <h1 className={`text-xl font-bold ${theme.primaryText}`}>{title}</h1>
      </div>
      <button onClick={onLogout} className={`p-2 rounded-full transition ${theme.secondary} ${theme.textMuted}`}><LogOut size={18} /></button>
    </header>
  );
}

function ParentDashboard({ config, themes, onSelectKid }) {
  const kids = Object.values(config.allowedUsers).filter(u => u.role === 'kid');
  return (
    <div className="space-y-6">
      <div className="bg-emerald-100 p-6 rounded-3xl text-emerald-800 text-center">
        <Shield size={32} className="mx-auto mb-2 opacity-50" />
        <h2 className="font-bold text-xl mb-1">Parent Dashboard</h2>
        <p className="text-sm opacity-80">Select a profile to view progress or add books.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {kids.map(kid => {
          const t = themes[kid.themeId];
          return (
            <button key={kid.email} onClick={() => onSelectKid(kid.email)} className={`flex flex-col items-center p-6 ${t.bg} rounded-3xl hover:opacity-80 transition shadow-sm border border-transparent hover:${t.border}`}>
              <span className="text-5xl mb-3">{t.icon}</span>
              <span className={`font-bold text-lg ${t.primaryText}`}>{kid.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  );
}

function BookList({ books, theme, onAdd, onSelect }) {
  return (
    <div className="space-y-6">
      {books.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="text-6xl mb-4 opacity-50">{theme.icon}</div>
          <h2 className={`text-xl font-bold mb-2 ${theme.textMuted}`}>No books yet!</h2>
          <button onClick={onAdd} className={`mt-6 px-6 py-3 rounded-full text-white font-bold shadow-lg flex items-center justify-center mx-auto space-x-2 ${theme.primary}`}>
            <Plus size={20} /> <span>Add a Book</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {books.map(book => {
              const totalItems = book.toc?.length || 0;
              const completedItems = book.toc?.filter(item => item.completed).length || 0;
              const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
              return (
                <div key={book.id} onClick={() => onSelect(book)} className={`${theme.card} rounded-3xl p-4 shadow-sm border ${theme.border} cursor-pointer hover:shadow-md transition transform hover:-translate-y-1`}>
                  <div className="aspect-[3/4] bg-gray-100 rounded-2xl mb-3 overflow-hidden relative shadow-inner flex items-center justify-center">
                    {book.coverUrl ? <img src={book.coverUrl} alt="cover" className="w-full h-full object-cover" /> : <BookOpen size={40} className="text-gray-300" />}
                  </div>
                  <h3 className={`font-bold line-clamp-1 text-sm ${theme.text}`}>{book.title || 'Untitled Book'}</h3>
                  <p className={`text-xs mb-2 line-clamp-1 ${theme.textMuted}`}>{book.author || 'Unknown Author'}</p>
                  <div className="w-full bg-gray-100 rounded-full h-2 mt-auto">
                    <div className={`${theme.primary} h-2 rounded-full transition-all`} style={{ width: `${percent}%` }}></div>
                  </div>
                  <div className="text-[10px] text-right mt-1 text-gray-400 font-bold">{percent}%</div>
                </div>
              );
            })}
          </div>
          <button onClick={onAdd} className={`fixed bottom-6 right-6 w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${theme.primary}`}><Plus size={28} /></button>
        </>
      )}
    </div>
  );
}

function AddBook({ theme, ownerEmail, onBack }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState("");
  const [coverUrl, setCoverUrl] = useState(null);
  const [toc, setToc] = useState([]);
  
  const [isProcessingCover, setIsProcessingCover] = useState(false);
  const [isProcessingToc, setIsProcessingToc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800);
      setIsProcessingCover(true);
      setAiError("Analyzing & Straightening...");

      const prompt = `Analyze this book cover. 
      1. Find the 4 corners of the book cover (tl, tr, br, bl) as [x,y] coordinates (0-1000).
      2. Identify the title and author.
      Return ONLY a JSON object: {"corners": {"tl":[x,y], "tr":[x,y], "br":[x,y], "bl":[x,y]}, "title": "...", "author": "..."}`;

      const result = await callGemini(prompt, compressed, true);
      const data = JSON.parse(result);
      
      if (data.corners) {
        const rectified = await warpImage(compressed, data.corners, 600, 850);
        setCoverUrl(rectified);
      } else {
        setCoverUrl(compressed);
      }
      
      if (data.title) setTitle(data.title);
      if (data.author) setAuthor(data.author);
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        setAiError("AI is busy (limit reached). Please wait a minute before retrying.");
      } else {
        setAiError("Couldn't auto-read the cover. You can type details manually!");
      }
      console.error("Cover upload error:", err);
    } finally { setIsProcessingCover(false); }
  };

  const handleTocUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1024);
      setIsProcessingToc(true);
      setAiError("Analyzing & Straightening...");

      const prompt = `Analyze this Table of Contents image. 
      1. Find the 4 corners of the page (tl, tr, br, bl) as [x,y] coordinates (0-1000).
      2. Create a checklist of chapters/sections.
      Return ONLY a JSON object: {"corners": {"tl":[x,y], "tr":[x,y], "br":[x,y], "bl":[x,y]}, "toc": [{"id": "...", "title": "...", "page": "...", "completed": false, "notes": []}]}`;

      const result = await callGemini(prompt, compressed, true);
      const data = JSON.parse(result);

      if (data.corners) {
        await warpImage(compressed, data.corners, 800, 1100);
        // Warping performed, but not currently used for storage in ToC
      }

      if (Array.isArray(data.toc) && data.toc.length > 0) {
        setToc(
          data.toc.map((item) => ({ ...item, completed: false, notes: [] })),
        );
      } else throw new Error("Invalid format");
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        setAiError("AI is busy (limit reached). Please wait a minute before retrying.");
      } else {
        setAiError("Couldn't build the ToC from image. Try taking a clearer picture!");
      }
      console.error("ToC upload error:", err);
    } finally { setIsProcessingToc(false); }
  };

  const handleSave = async () => {
    if (!title.trim()) return alert("Please enter a book title!");
    setSaving(true);
    try {
      const newBook = {
        title,
        author,
        totalPages: "",
        coverUrl: coverUrl || "",
        toc,
        ownerEmail,
        createdAt: Date.now(),
      };
      const newDocRef = doc(collection(db, 'family_books'));
      await setDoc(newDocRef, newBook);
      onBack();
    } catch {
      alert("Failed to save book.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm mr-4 text-gray-500"><ChevronLeft size={24} /></button>
        <h2 className="text-2xl font-bold">Add New Book</h2>
      </div>

      {aiError && <div className="p-3 bg-red-100 text-red-700 rounded-xl text-sm font-medium">{aiError}</div>}

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} text-center relative overflow-hidden`}>
        {coverUrl ? <img src={coverUrl} alt="Preview" className="w-32 h-auto mx-auto rounded-xl shadow-md mb-4" /> : 
          <div className={`w-24 h-32 mx-auto rounded-xl ${theme.bg} flex items-center justify-center mb-4 border-2 border-dashed ${theme.border}`}><BookOpen size={32} className={theme.primaryText} opacity={0.5} /></div>}
        <label className={`cursor-pointer inline-flex items-center space-x-2 px-4 py-2 rounded-full font-bold ${isProcessingCover ? 'bg-gray-200 text-gray-500' : theme.secondary}`}>
          {isProcessingCover ? <Sparkles className="animate-spin" size={18} /> : <Camera size={18} />}
          <span>{isProcessingCover ? 'Scanning Cover...' : 'Snap Book Cover'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={isProcessingCover} />
        </label>
      </div>

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} space-y-4`}>
        <div>
          <label className={`block text-sm font-bold mb-1 ml-2 ${theme.textMuted}`}>Book Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={`w-full p-4 rounded-2xl border-none focus:ring-2 focus:ring-pink-300 font-bold ${theme.bg} ${theme.text}`} placeholder="E.g. The Hobbit" />
        </div>
        <div>
          <label className={`block text-sm font-bold mb-1 ml-2 ${theme.textMuted}`}>Author</label>
          <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className={`w-full p-4 rounded-2xl border-none focus:ring-2 focus:ring-pink-300 ${theme.bg} ${theme.text}`} placeholder="Who wrote it?" />
        </div>
      </div>

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-800">Chapters / Parts</h3>
          <label className={`cursor-pointer flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold ${isProcessingToc ? 'bg-gray-200 text-gray-500' : theme.secondary}`}>
            {isProcessingToc ? <Sparkles className="animate-spin" size={14} /> : <Camera size={14} />}
            <span>{isProcessingToc ? 'Scanning...' : 'Scan ToC'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleTocUpload} disabled={isProcessingToc} />
          </label>
        </div>

        {toc.length > 0 ? (
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2">
            {toc.map((item, idx) => (
              <div key={idx} className={`flex items-center space-x-2 p-2 rounded-xl text-sm ${theme.bg}`}>
                <span className={`font-bold w-6 ${theme.textMuted}`}>{idx + 1}</span>
                <input value={item.title} onChange={e => { const newToc = [...toc]; newToc[idx].title = e.target.value; setToc(newToc); }} className={`flex-1 bg-transparent border-none outline-none font-medium ${theme.text}`} />
                <button onClick={() => setToc(toc.filter((_, i) => i !== idx))} className="text-red-400 p-1"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        ) : <div className={`text-center py-6 text-sm border-2 border-dashed rounded-xl mb-4 ${theme.textMuted} ${theme.border}`}>Scan the Table of Contents page to automatically create a checklist!</div>}
        
        <button onClick={() => setToc([...toc, { id: Date.now().toString(), title: `Chapter ${toc.length + 1}`, page: '', completed: false, notes: [] }])} className={`w-full py-3 rounded-xl border-2 border-dashed font-bold transition flex items-center justify-center space-x-2 ${theme.border} ${theme.textMuted} hover:${theme.bg}`}>
          <Plus size={16} /> <span>Add Chapter Manually</span>
        </button>
      </div>

      <button onClick={handleSave} disabled={saving} className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg flex items-center justify-center space-x-2 ${saving ? 'bg-gray-400' : theme.primary}`}>
        {saving ? <span>Saving...</span> : <span>Save to Bookshelf</span>}
      </button>
    </div>
  );
}

function BookDetail({ book, theme, onBack }) {
  const [localBook, setLocalBook] = useState(book);
  const [activeTab, setActiveTab] = useState('progress');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [activeChapterForNote, setActiveChapterForNote] = useState(null);

  const saveUpdates = async (updatedBook) => {
    setLocalBook(updatedBook);
    const bookRef = doc(db, 'family_books', updatedBook.id);
    await updateDoc(bookRef, updatedBook);
  };

  const toggleChapter = (chapterId) => {
    const updatedToc = localBook.toc.map(ch => ch.id === chapterId ? { ...ch, completed: !ch.completed } : ch);
    saveUpdates({ ...localBook, toc: updatedToc });
  };

  const totalChapters = localBook.toc?.length || 0;
  const completedChapters = localBook.toc?.filter(ch => ch.completed).length || 0;
  const progressPercent = totalChapters === 0 ? 0 : Math.round((completedChapters / totalChapters) * 100);

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-right-4">
      <div className="flex items-start space-x-4">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm text-gray-500 shrink-0"><ChevronLeft size={24} /></button>
        <div className="flex-1 flex items-start space-x-4">
           {localBook.coverUrl && <img src={localBook.coverUrl} alt="cover" className="w-20 rounded-lg shadow-md object-cover aspect-[3/4]" />}
           <div>
             <h2 className={`text-2xl font-black leading-tight ${theme.text}`}>{localBook.title}</h2>
             <p className={`font-medium ${theme.textMuted}`}>{localBook.author}</p>
           </div>
        </div>
      </div>

      <div className={`${theme.card} p-6 rounded-[2rem] shadow-sm border ${theme.border} text-center`}>
        <h3 className={`font-bold mb-2 uppercase tracking-wider text-xs ${theme.textMuted}`}>Reading Progress</h3>
        <div className="text-5xl font-black mb-4"><span className={theme.primaryText}>{progressPercent}%</span></div>
        <div className={`w-full rounded-full h-4 mb-2 shadow-inner overflow-hidden ${theme.bg}`}>
          <div className={`${theme.primary} h-full rounded-full transition-all duration-500`} style={{ width: `${progressPercent}%` }}></div>
        </div>
        <p className={`text-sm font-bold ${theme.textMuted}`}>{completedChapters} of {totalChapters} chapters done</p>
      </div>

      <div className={`flex p-1 rounded-full w-max mx-auto mb-6 ${theme.secondary}`}>
        <button onClick={() => setActiveTab('progress')} className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === 'progress' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>Chapters</button>
        <button onClick={() => setActiveTab('notes')} className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === 'notes' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>All Notes</button>
      </div>

      {activeTab === 'progress' ? (
        <div className="space-y-3">
          {localBook.toc?.map((chapter) => (
            <div key={chapter.id} className={`${theme.card} p-4 rounded-2xl shadow-sm border ${theme.border} flex items-center space-x-4 transition ${chapter.completed ? 'opacity-70' : ''}`}>
              <button onClick={() => toggleChapter(chapter.id)} className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition ${chapter.completed ? `${theme.primary} border-transparent text-white` : `border-gray-300 text-transparent hover:border-gray-400`}`}>
                <CheckCircle size={20} className={chapter.completed ? 'block' : 'hidden'} />
              </button>
              <div className="flex-1 min-w-0">
                <h4 className={`font-bold truncate ${chapter.completed ? `line-through ${theme.textMuted}` : theme.text}`}>{chapter.title}</h4>
              </div>
              <button onClick={() => { setActiveChapterForNote(chapter); setShowNoteModal(true); }} className={`p-2 rounded-full transition ${chapter.notes?.length > 0 ? theme.secondary : `hover:${theme.secondary} ${theme.textMuted}`}`}><Edit3 size={18} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {localBook.toc?.flatMap(ch => ch.notes?.map(n => ({...n, chTitle: ch.title})) || []).map((note, i) => (
            <div key={i} className={`${theme.card} p-4 rounded-2xl shadow-sm border ${theme.border}`}>
              <div className={`text-xs font-bold mb-2 ${theme.textMuted}`}>{note.chTitle}</div>
              <p className={`whitespace-pre-wrap text-sm font-medium ${theme.text}`}>{note.text}</p>
            </div>
          ))}
        </div>
      )}

      {showNoteModal && (
        <NoteModal chapter={activeChapterForNote} theme={theme} onClose={() => setShowNoteModal(false)} onSave={(noteText) => {
          const updatedToc = localBook.toc.map(ch => ch.id === activeChapterForNote.id ? { ...ch, notes: [...(ch.notes || []), { text: noteText, date: Date.now() }] } : ch);
          saveUpdates({ ...localBook, toc: updatedToc });
          setShowNoteModal(false);
        }}/>
      )}
    </div>
  );
}

function NoteModal({ chapter, theme, onClose, onSave }) {
  const [text, setText] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  const handleSmartCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessingAI(true);
    try {
      const base64 = await compressImage(file, 1024);
      const prompt = `Extract all the text from this image accurately. Return ONLY the extracted text.`;
      const result = await callGemini(prompt, base64);
      setText((prev) => prev + (prev ? "\n\n" : "") + result);
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        alert("AI limit reached. Please wait a moment.");
      } else {
        alert("Couldn't read text from the image.");
      }
      console.error("Smart capture error:", err);
    } finally {
      setIsProcessingAI(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className={`w-full rounded-t-[2rem] p-6 pb-10 animate-in slide-in-from-bottom-full ${theme.card}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className={`font-bold text-xl ${theme.text}`}>Note: {chapter.title}</h3>
          <button onClick={onClose} className={`p-2 rounded-full ${theme.secondary} ${theme.textMuted}`}>✕</button>
        </div>
        <div className="relative mb-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your thoughts or scan a paragraph!" className={`w-full h-40 p-4 rounded-2xl border resize-none font-medium ${theme.bg} ${theme.text} ${theme.border}`} />
          <div className="absolute bottom-4 right-4">
            <label className={`cursor-pointer w-10 h-10 rounded-full flex items-center justify-center shadow-md transition ${isProcessingAI ? 'bg-gray-300' : theme.primary} text-white`}>
              {isProcessingAI ? <Sparkles className="animate-spin" size={20} /> : <Camera size={20} />}
              <input type="file" accept="image/*" className="hidden" onChange={handleSmartCapture} disabled={isProcessingAI} />
            </label>
          </div>
        </div>
        <button onClick={() => { if(text.trim()) onSave(text); else onClose(); }} className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg ${theme.primary}`}>Save Note</button>
      </div>
    </div>
  );
}