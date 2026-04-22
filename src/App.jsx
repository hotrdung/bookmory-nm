import React, { useState, useEffect } from 'react';
import { Book, Camera, Check, CheckCircle, Edit3, Sparkles, LogOut, Plus, Trash2, ChevronLeft, BookOpen, Users, Shield, Download, Upload, Settings } from 'lucide-react';
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
  getDocs,
  deleteDoc,
  onSnapshot,
  updateDoc,
  query,
  where,
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
const GEMINI_MODELS = (import.meta.env.VITE_GEMINI_MODELS || "gemini-2.5-flash,gemini-3-flash-preview,gemini-3.1-flash-lite-preview,gemma-4-31b").split(",");

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
const callGemini = async (prompt, images = [], isJson = false) => {
  const parts = [{ text: prompt }];
  const imageList = Array.isArray(images) ? images : (images ? [images] : []);
  
  imageList.forEach(base64Image => {
    if (base64Image) {
      const mimeType = base64Image.match(/data:(.*?);base64/)[1];
      const data = base64Image.split(',')[1];
      parts.push({ inlineData: { mimeType, data } });
    }
  });
  
  const payload = { contents: [{ parts }], generationConfig: isJson ? { responseMimeType: "application/json" } : {} };

  // Try each model in sequence as a fallback
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    // Exponential backoff retry strategy per model
    let delay = 1500;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (imageList.length > 0 && attempt === 0 && i === 0) {
          const totalSize = imageList.reduce((acc, img) => acc + (img?.length || 0), 0);
          console.log(`Sending ${imageList.length} image(s) to Gemini (${model}) (Total size: ${Math.round(totalSize / 1024)}KB)`);
        }
        
        const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
        });
        
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          console.error(`Gemini API Error (${model}, ${response.status}):`, errorBody);
          
          if (response.status === 429) throw new Error("RATE_LIMIT");
          if (response.status >= 500) throw new Error(`SERVER_ERROR_${response.status}`);
          throw new Error(`HTTP_${response.status}`);
        }
        
        const result = await response.json();
        if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error("INVALID_RESPONSE");
        }
        return result.candidates[0].content.parts[0].text;
      } catch (e) {
        const isRetryable = e.message === "RATE_LIMIT" || e.message.startsWith("SERVER_ERROR");
        
        // If it's the last attempt for this model, either fail to next model or throw if last model
        if (attempt === 2 || !isRetryable) {
          if (i < GEMINI_MODELS.length - 1 && isRetryable) {
            console.warn(`Model ${model} failed after retries. Trying next model: ${GEMINI_MODELS[i+1]}`);
            break; // Break the attempt loop, continue the model loop
          }
          throw e; // Final failure
        }
        
        console.warn(`Attempt ${attempt + 1} for ${model} failed: ${e.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; 
      }
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
        // Only downscale if the image is wider than maxWidth
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Use quality 0.7 for even smaller file size, enough for Gemini OCR
        resolve(canvas.toDataURL("image/jpeg", 0.7));
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
  const [userProgressList, setUserProgressList] = useState([]);
  const [listTab, setListTab] = useState("my"); // my, library
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

  const handleExportData = () => {
    const data = {
      family_books: allFamilyBooks,
      reading_progress: userProgressList,
      version: "1.0",
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookmory_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleClearAllData = async () => {
    if (!confirm("⚠️ DANGER: This will delete ALL books and progress for the entire family! Are you absolutely sure?")) return;
    if (!confirm("FINAL WARNING: This cannot be undone. Delete everything?")) return;

    try {
      setLoading(true);
      // Delete Books
      const booksSnap = await getDocs(collection(db, "family_books"));
      for (const d of booksSnap.docs) {
        await deleteDoc(doc(db, "family_books", d.id));
      }
      // Delete Progress
      const progressSnap = await getDocs(collection(db, "reading_progress"));
      for (const d of progressSnap.docs) {
        await deleteDoc(doc(db, "reading_progress", d.id));
      }
      alert("All data has been cleared.");
    } catch (err) {
      console.error(err);
      alert("Failed to clear data.");
    } finally {
      setLoading(false);
    }
  };

  const handleImportData = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.family_books || !data.reading_progress) throw new Error("Invalid backup file format.");

        setLoading(true);
        // Import Books
        for (const book of data.family_books) {
          await setDoc(doc(db, "family_books", book.id), book);
        }
        // Import Progress
        for (const prog of data.reading_progress) {
          await setDoc(doc(db, "reading_progress", prog.id || doc(collection(db, "reading_progress")).id), prog);
        }
        alert("Data imported successfully!");
      } catch (err) {
        console.error(err);
        alert("Import failed: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteBook = async (bookId) => {
    if (!confirm("Are you sure you want to delete this book? This will also delete everyone's reading progress for it!")) return;
    
    try {
      setLoading(true);
      // 1. Delete Book
      await deleteDoc(doc(db, "family_books", bookId));
      
      // 2. Delete all related progress
      const progressSnap = await getDocs(
        query(collection(db, "reading_progress"), where("bookId", "==", bookId))
      );
      for (const d of progressSnap.docs) {
        await deleteDoc(doc(db, "reading_progress", d.id));
      }
      
      setView("dashboard");
      alert("Book deleted.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete book.");
    } finally {
      setLoading(false);
    }
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

  // Fetch Books (Library) and User Progress
  useEffect(() => {
    if (!firebaseUser || !appUser) return;

    const booksRef = collection(db, "family_books");
    const progressRef = collection(db, "reading_progress");

    const unsubBooks = onSnapshot(booksRef, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setAllFamilyBooks(data);
    });

    const unsubProgress = onSnapshot(progressRef, (snapshot) => {
      const pData = [];
      snapshot.forEach((doc) => pData.push({ id: doc.id, ...doc.data() }));
      setUserProgressList(pData);
    });

    return () => {
      unsubBooks();
      unsubProgress();
    };
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

  // Books I am currently reading
  const myReadingProgress = userProgressList.filter(p => p.userEmail === activeKidEmail);
  const myBooks = myReadingProgress.map(p => {
    const book = allFamilyBooks.find(b => b.id === p.bookId);
    return book ? { ...book, progress: p } : null;
  }).filter(Boolean);

  // Books available in the library (added by anyone)
  const libraryBooks = allFamilyBooks;

  const activeKidConfig = APP_CONFIG.allowedUsers[activeKidEmail?.toLowerCase()];

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
                  setListTab("my");
                  setView("list");
                }}
                onExport={handleExportData}
                onImport={handleImportData}
                onClear={handleClearAllData}
              />
            )}
            {view === "list" && (
              <BookList
                books={listTab === "my" ? myBooks : libraryBooks}
                tab={listTab}
                setTab={setListTab}
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
                ownerEmail={firebaseUser.email} 
                onBack={() => setView("list")} 
              />
            )}
            {view === "edit" && (
              <AddBook 
                theme={currentTheme} 
                ownerEmail={firebaseUser.email} 
                bookToEdit={selectedBook}
                onBack={() => setView("detail")} 
              />
            )}
            {view === "detail" && (
              <BookDetail 
                book={selectedBook} 
                userEmail={activeKidEmail || firebaseUser.email} 
                isParent={appUser?.role === 'parent'}
                theme={currentTheme} 
                onBack={() => setView("list")}
                onEdit={() => setView("edit")}
                onDelete={() => handleDeleteBook(selectedBook.id)}
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

function ParentDashboard({ config, themes, onSelectKid, onExport, onImport, onClear }) {
  const kids = Object.values(config.allowedUsers).filter(u => u.role === 'kid');
  return (
    <div className="space-y-6 pb-20">
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

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-bold text-gray-800 flex items-center">
          <Settings size={18} className="mr-2 text-gray-400" />
          Data Management
        </h3>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Backup & Restore</p>
        
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onExport} className="flex items-center justify-center space-x-2 p-3 bg-gray-50 rounded-2xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition">
            <Download size={14} />
            <span>Export JSON</span>
          </button>
          
          <label className="flex items-center justify-center space-x-2 p-3 bg-gray-50 rounded-2xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition cursor-pointer">
            <Upload size={14} />
            <span>Import JSON</span>
            <input type="file" accept=".json" className="hidden" onChange={onImport} />
          </label>
        </div>

        <button onClick={onClear} className="w-full flex items-center justify-center space-x-2 p-3 bg-red-50 rounded-2xl font-bold text-xs text-red-500 hover:bg-red-100 transition mt-2">
          <Trash2 size={14} />
          <span>Clear All Data</span>
        </button>
      </div>
    </div>
  );
}

function BookList({ books, tab, setTab, theme, onAdd, onSelect }) {
  return (
    <div className="space-y-6">
      <div className={`flex p-1 rounded-2xl w-full mb-4 ${theme.secondary}`}>
        <button onClick={() => setTab('my')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${tab === 'my' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>My Books</button>
        <button onClick={() => setTab('library')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${tab === 'library' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>Family Library</button>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="text-6xl mb-4 opacity-50">{theme.icon}</div>
          <h2 className={`text-xl font-bold mb-2 ${theme.textMuted}`}>{tab === 'my' ? "You aren't reading anything yet!" : "Library is empty!"}</h2>
          {tab === 'my' && (
             <button onClick={() => setTab('library')} className={`mt-6 px-6 py-3 rounded-full text-white font-bold shadow-lg flex items-center justify-center mx-auto space-x-2 ${theme.primary}`}>
               <BookOpen size={20} /> <span>Browse Library</span>
             </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {books.map(book => {
              let percent = 0;
              if (tab === 'my' && book.progress) {
                const totalLogged = Object.values(book.progress.logs || {}).reduce((sum, log) => sum + (log.pagesRead || 0), 0);
                percent = Math.min(100, Math.round((totalLogged / (book.progress.totalPages || 1)) * 100));
              }

              return (
                <div key={book.id} onClick={() => onSelect(book)} className={`${theme.card} rounded-3xl p-4 shadow-sm border ${theme.border} cursor-pointer hover:shadow-md transition transform hover:-translate-y-1`}>
                  <div className="aspect-[3/4] bg-gray-100 rounded-2xl mb-3 overflow-hidden relative shadow-inner flex items-center justify-center">
                    {book.coverUrl ? <img src={book.coverUrl} alt="cover" className="w-full h-full object-cover" /> : <BookOpen size={40} className="text-gray-300" />}
                    {tab === 'library' && (
                       <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-full text-[10px] font-bold shadow-sm">
                         By {APP_CONFIG.allowedUsers[book.ownerEmail.toLowerCase()]?.name || '??'}
                       </div>
                    )}
                  </div>
                  <h3 className={`font-bold line-clamp-1 text-sm ${theme.text}`}>{book.title || 'Untitled Book'}</h3>
                  <p className={`text-xs mb-2 line-clamp-1 ${theme.textMuted}`}>{book.author || 'Unknown Author'}</p>
                  
                  {tab === 'my' && (
                    <>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-auto">
                        <div className={`${theme.primary} h-2 rounded-full transition-all`} style={{ width: `${percent}%` }}></div>
                      </div>
                      <div className="text-[10px] text-right mt-1 text-gray-400 font-bold">{percent}%</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {tab === 'my' && (
            <button onClick={onAdd} className={`fixed bottom-6 right-6 w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${theme.primary}`}><Plus size={28} /></button>
          )}
        </>
      )}
    </div>
  );
}

function AddBook({ theme, ownerEmail, onBack, bookToEdit = null }) {
  const [title, setTitle] = useState(bookToEdit?.title || '');
  const [author, setAuthor] = useState(bookToEdit?.author || "");
  const [bookImages, setBookImages] = useState(bookToEdit?.coverUrl ? [bookToEdit.coverUrl] : []); 
  const [tocImages, setTocImages] = useState([]);
  const [toc, setToc] = useState(bookToEdit?.toc || []);
  
  const [tags, setTags] = useState(bookToEdit?.tags || []);
  const [summary, setSummary] = useState(bookToEdit?.summary || "");

  // Progress tracking fields
  const [totalPages, setTotalPages] = useState(bookToEdit?.totalPages?.toString() || '');
  const [readingGoal, setReadingGoal] = useState(bookToEdit?.readingGoal?.toString() || '');
  const [dueDate, setDueDate] = useState(bookToEdit?.dueDate || '');

  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState('');

  const updatePages = (val) => {
    setTotalPages(val);
    if (val && readingGoal) {
      const days = Math.ceil(parseInt(val) / parseInt(readingGoal));
      const date = new Date();
      date.setDate(date.getDate() + days);
      setDueDate(date.toISOString().split('T')[0]);
    }
  };

  const handleImageUpload = async (e, isToc = false) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setIsProcessingAI(true);
    setAiError("Compressing photos...");
    try {
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file, isToc ? 1024 : 800))
      );
      if (isToc) setTocImages([...tocImages, ...compressedFiles]);
      else setBookImages([...bookImages, ...compressedFiles]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingAI(false);
      setAiError("");
    }
  };

  const handleAnalyzeAll = async () => {
    if (bookImages.length === 0) return alert("Please upload at least the book cover!");
    
    setIsProcessingAI(true);
    setAiError("AI is reading everything... This may take a moment.");
    try {
      const prompt = `Analyze these book images. 
      Group 1 (First ${bookImages.length} images): Front cover and info pages. The 1st image is the FRONT COVER.
      Group 2 (Next ${tocImages.length} images): Table of Contents pages.

      1. From Group 1: Identify title, author, Audience (Kid/Teen/Adult), Genre tags, and provide a 1-2 sentence summary.
      2. Find the 4 corners of the FRONT COVER (the very 1st image) as [x,y] coordinates (0-1000) for straightening.
      3. From Group 2: Identify all chapters/sections in order with page numbers.
      4. From any group: Identify total pages.

      Return ONLY a JSON object: {
        "corners": {"tl":[x,y], "tr":[x,y], "br":[x,y], "bl":[x,y]}, 
        "title": "...", 
        "author": "...", 
        "totalPages": 0, 
        "tags": ["...", "..."], 
        "summary": "...",
        "toc": [{"id": "...", "title": "...", "page": "...", "completed": false, "notes": []}]
      }`;

      const allImages = [...bookImages, ...tocImages];
      const result = await callGemini(prompt, allImages, true);
      const data = JSON.parse(result);
      
      if (data.corners && bookImages[0]) {
        const rectified = await warpImage(bookImages[0], data.corners, 600, 850);
        const newBookImages = [...bookImages];
        newBookImages[0] = rectified;
        setBookImages(newBookImages);
      }
      
      if (data.title) setTitle(data.title);
      if (data.author) setAuthor(data.author);
      if (data.totalPages) updatePages(data.totalPages.toString());
      if (data.tags) setTags(data.tags);
      if (data.summary) setSummary(data.summary);
      if (data.toc && data.toc.length > 0) {
        setToc(data.toc.map(item => ({ ...item, completed: false, notes: [] })));
      }
    } catch (err) {
      setAiError("AI had trouble reading everything. You can check details manually!");
      console.error("Analysis error:", err);
    } finally { setIsProcessingAI(false); }
  };

  const handleSave = async () => {
    if (!title.trim()) return alert("Please enter a book title!");
    if (!totalPages || isNaN(parseInt(totalPages))) return alert("Please enter total pages!");
    
    setSaving(true);
    try {
      // 1. Save/Update Master Book
      const bookDocRef = bookToEdit ? doc(db, 'family_books', bookToEdit.id) : doc(collection(db, 'family_books'));
      const now = Date.now();
      const bookData = {
        id: bookDocRef.id,
        title,
        author,
        coverUrl: bookImages[0] || "",
        toc,
        tags,
        summary,
        totalPages: parseInt(totalPages),
        ownerEmail: bookToEdit?.ownerEmail || ownerEmail,
        updatedAt: now,
      };
      if (!bookToEdit) bookData.createdAt = now;
      
      await setDoc(bookDocRef, bookData, { merge: true });

      // 2. Start/Update Progress for this user (if not just editing)
      if (!bookToEdit) {
        const progressDocRef = doc(collection(db, 'reading_progress'));
        const newProgress = {
          bookId: bookDocRef.id,
          userEmail: ownerEmail,
          totalPages: parseInt(totalPages),
          readingGoal: parseInt(readingGoal || 10),
          dueDate: dueDate,
          startDate: now,
          lastPageRead: 0,
          logs: {},
          toc: toc, 
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(progressDocRef, newProgress);
      }

      onBack();
    } catch (err) {
      console.error(err);
      alert("Failed to save book.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm mr-4 text-gray-500"><ChevronLeft size={24} /></button>
        <h2 className="text-2xl font-bold">{bookToEdit ? "Edit Book" : "Add New Book"}</h2>
      </div>

      {aiError && <div className="p-3 bg-blue-100 text-blue-700 rounded-xl text-xs font-medium animate-pulse">{aiError}</div>}

      <div className="grid grid-cols-1 gap-4">
        <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} text-center relative`}>
          <div className="flex flex-wrap gap-3 mb-4 justify-center">
            {bookImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img} className={`w-20 h-28 rounded-xl object-cover border-2 ${i === 0 ? 'border-pink-400' : 'border-gray-200'}`} alt="Book Photo" />
                {i === 0 && <span className="absolute -top-2 -left-2 bg-pink-500 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase shadow-sm">Cover</span>}
                <button onClick={() => setBookImages(bookImages.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-white text-gray-500 rounded-full p-1 shadow-md border">✕</button>
              </div>
            ))}
            {bookImages.length === 0 && <div className={`w-20 h-28 rounded-xl ${theme.bg} flex items-center justify-center border-2 border-dashed ${theme.border}`}><BookOpen size={24} className={theme.primaryText} opacity={0.5} /></div>}
          </div>
          <label className={`cursor-pointer inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-full font-bold text-sm ${theme.primary} text-white shadow-lg transition-transform hover:scale-105`}>
            <Camera size={18} />
            <span>{bookImages.length > 0 ? 'Add More Photos' : 'Select Book Photos'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e, false)} />
          </label>
          <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-widest">Select multiple: Cover + Back + Info</p>
        </div>
        <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} text-center`}>
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {tocImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img} className="w-12 h-16 rounded-md object-cover border" alt="ToC Page" />
                <button onClick={() => setTocImages(tocImages.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-white text-gray-500 rounded-full p-0.5 shadow-sm border">✕</button>
              </div>
            ))}
            {tocImages.length === 0 && <div className={`w-12 h-16 rounded-md ${theme.bg} border-2 border-dashed ${theme.border}`} />}
          </div>
          <label className={`cursor-pointer inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-full font-bold text-xs ${theme.secondary}`}>
            <Camera size={14} />
            <span>Add ToC Pages</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e, true)} />
          </label>
        </div>
      </div>

      {(bookImages.length > 0 || tocImages.length > 0) && !title && (
        <button onClick={handleAnalyzeAll} disabled={isProcessingAI} className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg flex items-center justify-center space-x-2 ${isProcessingAI ? 'bg-gray-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}>
          {isProcessingAI ? <Sparkles className="animate-spin" size={20} /> : <Sparkles size={20} />}
          <span>{isProcessingAI ? 'AI is Processing...' : 'AI Magic: Process Everything'}</span>
        </button>
      )}

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} space-y-4`}>
        <div>
          <label className={`block text-xs font-bold mb-1 ml-2 ${theme.textMuted}`}>Book Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={`w-full p-4 rounded-2xl border-none focus:ring-2 focus:ring-pink-300 font-bold ${theme.bg} ${theme.text}`} placeholder="E.g. The Hobbit" />
        </div>
        <div>
          <label className={`block text-xs font-bold mb-1 ml-2 ${theme.textMuted}`}>Author</label>
          <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className={`w-full p-4 rounded-2xl border-none focus:ring-2 focus:ring-pink-300 ${theme.bg} ${theme.text}`} placeholder="Who wrote it?" />
        </div>
        
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2">
            {tags.map((tag, i) => (
              <span key={i} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${theme.secondary}`}>{tag}</span>
            ))}
          </div>
        )}
        
        {summary && (
          <div className="px-2">
             <label className={`block text-[10px] font-bold mb-1 uppercase ${theme.textMuted}`}>Summary</label>
             <p className={`text-xs italic leading-relaxed ${theme.text}`}>{summary}</p>
          </div>
        )}
      </div>

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border} grid grid-cols-2 gap-4`}>
        <div className="col-span-1">
          <label className={`block text-[10px] font-bold mb-1 ml-2 uppercase ${theme.textMuted}`}>Total Pages</label>
          <input type="number" value={totalPages} onChange={e => updatePages(e.target.value)} className={`w-full p-3 rounded-xl border-none ${theme.bg} ${theme.text} font-bold`} placeholder="300" />
        </div>
        <div className="col-span-1">
          <label className={`block text-[10px] font-bold mb-1 ml-2 uppercase ${theme.textMuted}`}>Goal (Pages/Day)</label>
          <input type="number" value={readingGoal} onChange={e => setReadingGoal(e.target.value)} className={`w-full p-3 rounded-xl border-none ${theme.bg} ${theme.text} font-bold`} placeholder="10" />
        </div>
        {!bookToEdit && (
          <div className="col-span-2">
            <label className={`block text-[10px] font-bold mb-1 ml-2 uppercase ${theme.textMuted}`}>Target Finish Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`w-full p-3 rounded-xl border-none ${theme.bg} ${theme.text}`} />
          </div>
        )}
      </div>

      <div className={`${theme.card} p-6 rounded-3xl shadow-sm border ${theme.border}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-800">Chapters Checklist</h3>
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
        ) : tocImages.length === 0 && <div className={`text-center py-6 text-sm border-2 border-dashed rounded-xl mb-4 ${theme.textMuted} ${theme.border}`}>Scan the Table of Contents page(s) to automatically create a checklist!</div>}
        
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

function BookDetail({ book, userEmail, isParent, theme, onBack, onEdit, onDelete }) {
  const [localBook, setLocalBook] = useState(book);
  const [activeTab, setActiveTab] = useState('progress');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [activeChapterForNote, setActiveChapterForNote] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);

  const saveUpdates = async (updatedBook) => {
    setLocalBook(updatedBook);
    const bookRef = doc(db, 'family_books', updatedBook.id);
    await updateDoc(bookRef, { ...updatedBook, updatedAt: Date.now() });
  };

  const saveProgress = async (updated) => {
    const progressDocRef = doc(db, 'reading_progress', updated.id || localBook.progress.id);
    const dataToSave = { ...updated, updatedAt: Date.now() };
    await setDoc(progressDocRef, dataToSave, { merge: true });
    setLocalBook({ ...localBook, progress: dataToSave });
  };

  const handleStartReading = async () => {
    const totalPages = prompt("How many total pages in this book?", "300");
    const goal = prompt("How many pages do you want to read per day?", "10");
    if (!totalPages || !goal) return;

    const progressDocRef = doc(collection(db, 'reading_progress'));
    const now = Date.now();
    const newProgress = {
      id: progressDocRef.id,
      bookId: localBook.id,
      userEmail: userEmail,
      totalPages: parseInt(totalPages),
      readingGoal: parseInt(goal),
      startDate: now,
      lastPageRead: 0,
      logs: {},
      toc: localBook.toc || [], // Personal copy
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(progressDocRef, newProgress);
    setLocalBook({ ...localBook, progress: newProgress });
  };

  const toggleChapter = async (chapterIdx) => {
    const newToc = [...(localBook.progress.toc || [])];
    newToc[chapterIdx].completed = !newToc[chapterIdx].completed;
    await saveProgress({ ...localBook.progress, toc: newToc });
  };

  const progress = localBook.progress;
  const totalLogged = progress ? Object.values(progress.logs || {}).reduce((sum, log) => sum + (log.pagesRead || 0), 0) : 0;
  const progressPercent = progress ? Math.min(100, Math.round((totalLogged / progress.totalPages) * 100)) : 0;

  // Calculate day stats
  const getDayStats = () => {
    if (!progress) return { completed: 0, partial: 0, missed: 0 };
    const start = new Date(progress.startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    let completed = 0, partial = 0, missed = 0;
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const log = progress.logs[dateStr];
      if (log) {
        if (log.pagesRead >= progress.readingGoal) completed++;
        else partial++;
      } else {
        missed++;
      }
    }
    return { completed, partial, missed };
  };

  const stats = getDayStats();

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm text-gray-500 shrink-0"><ChevronLeft size={24} /></button>
        {isParent && (
          <div className="flex space-x-2">
            <button onClick={onEdit} className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-blue-500 transition"><Edit3 size={20} /></button>
            <button onClick={onDelete} className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-red-500 transition"><Trash2 size={20} /></button>
          </div>
        )}
      </div>

      <div className="flex items-start space-x-4">
        <div className="w-24 shrink-0">
          <img src={localBook.coverUrl || "https://placehold.co/150x220?text=No+Cover"} alt={localBook.title} className="w-full rounded-xl shadow-lg border-2 border-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`text-2xl font-black leading-tight mb-1 ${theme.text}`}>{localBook.title}</h2>
          <p className={`font-bold ${theme.primaryText}`}>{localBook.author || 'Unknown Author'}</p>
        </div>
      </div>

      {!progress ? (
        <div className={`${theme.card} p-8 rounded-[2rem] shadow-sm border ${theme.border} text-center`}>
          <Sparkles className="mx-auto mb-4 text-yellow-400" size={40} />
          <h3 className="font-bold text-xl mb-2">Want to read this?</h3>
          <p className={`text-sm mb-6 ${theme.textMuted}`}>Start tracking your reading progress and hit your daily goals!</p>
          <button onClick={handleStartReading} className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg ${theme.primary}`}>Start Reading</button>
        </div>
      ) : (
        <>
          <div className={`${theme.card} p-6 rounded-[2rem] shadow-sm border ${theme.border} text-center`}>
            <div className="flex justify-between items-center mb-4">
               <h3 className={`font-bold uppercase tracking-wider text-[10px] ${theme.textMuted}`}>Progress Tracker</h3>
               <button onClick={() => setShowCheckIn(true)} className={`px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-md ${theme.primary}`}>Check-In</button>
            </div>
            <div className="text-5xl font-black mb-4"><span className={theme.primaryText}>{progressPercent}%</span></div>
            <div className={`w-full rounded-full h-4 mb-4 shadow-inner overflow-hidden ${theme.bg}`}>
              <div className={`${theme.primary} h-full rounded-full transition-all duration-500`} style={{ width: `${progressPercent}%` }}></div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
               <div className="bg-emerald-50 p-2 rounded-2xl">
                 <div className="text-emerald-600 font-black text-lg">{stats.completed}</div>
                 <div className="text-[8px] font-bold text-emerald-800 uppercase">Goal Met</div>
               </div>
               <div className="bg-orange-50 p-2 rounded-2xl">
                 <div className="text-orange-600 font-black text-lg">{stats.partial}</div>
                 <div className="text-[8px] font-bold text-orange-800 uppercase">Partial</div>
               </div>
               <div className="bg-rose-50 p-2 rounded-2xl">
                 <div className="text-rose-600 font-black text-lg">{stats.missed}</div>
                 <div className="text-[8px] font-bold text-rose-800 uppercase">Missed</div>
               </div>
            </div>
          </div>

          {/* Personal Checklist (only if reading) */}
          {progress && (progress.toc || []).length > 0 && (
            <div className={`${theme.card} p-6 rounded-[2rem] shadow-sm border ${theme.border}`}>
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-800">My Checklist</h3>
                 <span className="text-[10px] font-bold text-pink-500 bg-pink-50 px-2 py-1 rounded-lg">
                   {progress.toc.filter(c => c.completed).length} / {progress.toc.length}
                 </span>
              </div>
              <div className="space-y-3">
                {progress.toc.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => toggleChapter(idx)}
                    className={`flex items-center space-x-3 p-3 rounded-2xl cursor-pointer transition ${item.completed ? 'bg-green-50 opacity-60' : theme.bg}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                       {item.completed && <Check size={14} strokeWidth={4} />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${item.completed ? 'text-green-700 line-through' : theme.text}`}>{item.title}</p>
                      {item.page && <p className="text-[10px] text-gray-400">Starts at page {item.page}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`flex p-1 rounded-full w-max mx-auto mb-6 ${theme.secondary}`}>
            <button onClick={() => setActiveTab('progress')} className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === 'progress' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>Chapters</button>
            <button onClick={() => setActiveTab('notes')} className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === 'notes' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>All Notes</button>
          </div>

          {activeTab === 'progress' ? (
            <div className="space-y-3">
              {localBook.toc?.map((chapter) => (
                <div key={chapter.id} className={`${theme.card} p-4 rounded-2xl shadow-sm border ${theme.border} flex items-center space-x-4 transition ${chapter.completed ? 'opacity-70' : ''}`}>
                  <button onClick={() => toggleChapter(localBook.toc.indexOf(chapter))} className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition ${chapter.completed ? `${theme.primary} border-transparent text-white` : `border-gray-300 text-transparent hover:border-gray-400`}`}>
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
        </>
      )}

      {showNoteModal && (
        <NoteModal chapter={activeChapterForNote} theme={theme} onClose={() => setShowNoteModal(false)} onSave={(noteText) => {
          const updatedToc = localBook.toc.map(ch => ch.id === activeChapterForNote.id ? { ...ch, notes: [...(ch.notes || []), { text: noteText, date: Date.now() }] } : ch);
          saveUpdates({ ...localBook, toc: updatedToc });
          setShowNoteModal(false);
        }}/>
      )}

      {localBook.summary && (
        <div className={`${theme.card} p-5 rounded-[2rem] shadow-sm border ${theme.border}`}>
          <h3 className={`font-bold text-[10px] uppercase mb-2 ${theme.textMuted}`}>About this book</h3>
          <p className={`text-xs leading-relaxed italic ${theme.text}`}>{localBook.summary}</p>
          {localBook.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {localBook.tags.map((tag, i) => (
                <span key={i} className={`px-2 py-1 rounded-lg text-[9px] font-bold ${theme.secondary}`}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {showCheckIn && (
        <CheckInModal 
          progress={progress} 
          theme={theme} 
          onClose={() => setShowCheckIn(false)} 
          onSave={async (pagesRead, currentPage) => {
            const today = new Date().toISOString().split('T')[0];
            const updatedLogs = { ...progress.logs, [today]: { pagesRead, currentPage, date: Date.now() } };
            
            // Auto-complete ToC items based on page number
            const updatedToc = (progress.toc || []).map(item => {
              const itemPage = parseInt(item.page);
              if (!isNaN(itemPage) && itemPage > 0 && itemPage <= currentPage) {
                return { ...item, completed: true };
              }
              return item;
            });

            await saveProgress({ 
              ...progress, 
              logs: updatedLogs, 
              toc: updatedToc,
              lastPageRead: currentPage 
            });
            setShowCheckIn(false);
          }}
        />
      )}
    </div>
  );
}

function CheckInModal({ progress, theme, onClose, onSave }) {
  const [pagesRead, setPagesRead] = useState('');
  const [currentPage, setCurrentPage] = useState(progress.lastPageRead?.toString() || '');
  const [mode, setMode] = useState('page'); // Default to page
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-6">
      <div className={`w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 ${theme.card}`}>
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black mb-1">Check-In</h3>
          <p className={`text-xs font-bold uppercase tracking-widest ${theme.primaryText}`}>{today}</p>
        </div>
        
        <div className="space-y-6">
           <div className={`flex p-1 rounded-xl mb-4 ${theme.bg}`}>
             <button onClick={() => setMode('count')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition ${mode === 'count' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>Pages Read</button>
             <button onClick={() => setMode('page')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition ${mode === 'page' ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}>Current Page</button>
           </div>

           <div className="text-center">
             {mode === 'count' ? (
               <>
                 <label className={`block text-[10px] font-bold uppercase mb-2 ${theme.textMuted}`}>How many pages read today?</label>
                 <input autoFocus type="number" value={pagesRead} onChange={e => setPagesRead(e.target.value)} className={`w-full text-center text-4xl font-black p-4 rounded-3xl border-none ${theme.bg} ${theme.text}`} placeholder="0" />
               </>
             ) : (
               <>
                 <label className={`block text-[10px] font-bold uppercase mb-2 ${theme.textMuted}`}>What page are you on now?</label>
                 <input autoFocus type="number" value={currentPage} onChange={e => setCurrentPage(e.target.value)} className={`w-full text-center text-4xl font-black p-4 rounded-3xl border-none ${theme.bg} ${theme.text}`} placeholder={progress.lastPageRead || "0"} />
                 <p className="text-[10px] mt-2 font-bold text-gray-400">Last recorded: Page {progress.lastPageRead || 0}</p>
               </>
             )}
           </div>
           
           <div className={`p-4 rounded-2xl border ${theme.border} flex justify-between items-center`}>
              <span className={`text-xs font-bold ${theme.textMuted}`}>Goal: {progress.readingGoal} Pages</span>
              <span className={`text-[10px] font-black ${theme.primaryText}`}>Total: {progress.totalPages} Pages</span>
           </div>

           <div className="flex space-x-3">
             <button onClick={onClose} className={`flex-1 py-4 rounded-2xl font-bold ${theme.secondary}`}>Later</button>
             <button onClick={() => {
               let finalRead = parseInt(pagesRead) || 0;
               let finalPage = progress.lastPageRead || 0;
               
               if (mode === 'page') {
                 finalPage = parseInt(currentPage) || 0;
                 finalRead = Math.max(0, finalPage - (progress.lastPageRead || 0));
               } else {
                 finalPage = (progress.lastPageRead || 0) + finalRead;
               }
               onSave(finalRead, finalPage);
             }} className={`flex-[2] py-4 rounded-2xl text-white font-bold shadow-lg ${theme.primary}`}>Log Progress</button>
           </div>
        </div>
      </div>
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