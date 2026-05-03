import React, { useState, useEffect } from 'react';
import {
  Book,
  Camera,
  Check,
  CheckCircle,
  Edit3,
  Sparkles,
  LogOut,
  Plus,
  Trash2,
  ChevronLeft,
  BookOpen,
  Users,
  Shield,
  Download,
  Upload,
  Settings,
  LayoutGrid,
  List,
  Search,
  Filter,
  ArrowUpDown,
  Menu,
  X,
  Printer,
} from "lucide-react";
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
  mei: {
    id: "mei",
    name: "Mei",
    bg: "bg-[#FFF9FB]",
    card: "bg-white",
    text: "text-[#5D4148]",
    textMuted: "text-[#B4979E]",
    primary: "bg-[#FF94AD] hover:bg-[#FF758F]",
    primaryText: "text-[#FF758F]",
    secondary: "bg-[#FFE9ED] text-[#FF758F]",
    border: "border-[#FFECF0]",
    icon: "🌸",
  },
  lele: {
    id: "lele",
    name: "Lele",
    bg: "bg-[#1E090D]",
    card: "bg-[#2D0F14]",
    text: "text-[#FFF0F3]",
    textMuted: "text-[#9D6B74]",
    primary: "bg-[#FF4D6D] hover:bg-[#FF758F]",
    primaryText: "text-[#FF758F]",
    secondary: "bg-[#42111A] text-[#FFB3C1]",
    border: "border-[#4D1923]",
    icon: "💖",
  },
  ny: {
    id: "ny",
    name: "Ny",
    bg: "bg-[#F8FBFF]",
    card: "bg-white",
    text: "text-[#334155]",
    textMuted: "text-[#94A3B8]",
    primary: "bg-[#60A5FA] hover:bg-[#3B82F6]",
    primaryText: "text-[#3B82F6]",
    secondary: "bg-[#EFF6FF] text-[#3B82F6]",
    border: "border-[#F1F5F9]",
    icon: "🚀",
  },
  dx: {
    id: "dx",
    name: "DX",
    bg: "bg-[#0B0F1A]",
    card: "bg-[#161B2E]",
    text: "text-[#E2E8F0]",
    textMuted: "text-[#64748B]",
    primary: "bg-[#38BDF8] hover:bg-[#0EA5E9]",
    primaryText: "text-[#38BDF8]",
    secondary: "bg-[#1E293B] text-[#7DD3FC]",
    border: "border-[#1E293B]",
    icon: "🌌",
  },
  parent: {
    id: "parent",
    name: "Parent Hub",
    bg: "bg-[#F9FDFB]",
    card: "bg-white",
    text: "text-[#1E2923]",
    textMuted: "text-[#718076]",
    primary: "bg-[#4ADE80] hover:bg-[#22C55E]",
    primaryText: "text-[#22C55E]",
    secondary: "bg-[#F0FDF4] text-[#16A34A]",
    border: "border-[#ECFDF5]",
    icon: "👨‍👩‍👧‍👦",
  },
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

  // --- HISTORY MANAGEMENT ---
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state) {
        if (event.state.view) setView(event.state.view);
        if (event.state.selectedBook) setSelectedBook(event.state.selectedBook);
        if (event.state.listTab) setListTab(event.state.listTab);
      } else if (appUser) {
        if (appUser.role === 'parent') setView('dashboard');
        else setView('list');
        setSelectedBook(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    if (view !== 'auth') {
      window.history.replaceState({ view, selectedBook, listTab }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  useEffect(() => {
    if (view === 'auth') return;
    
    const currentState = { view, selectedBook, listTab };
    const historyState = window.history.state;
    
    if (!historyState || 
        historyState.view !== view || 
        historyState.selectedBook?.id !== selectedBook?.id || 
        historyState.listTab !== listTab) {
      window.history.pushState(currentState, '');
    }
  }, [view, selectedBook, listTab]);

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
            username={
              activeKidConfig?.name ||
              (appUser.role === "parent" ? "Parent" : "Guest")
            }
            onLogout={handleLogout}
            showBack={
              view !== "dashboard" &&
              view !== "list" &&
              (appUser.role === "parent" ||
                view === "detail" ||
                view === "add" ||
                view === "edit")
            }
            onBack={() => {
              if (appUser.role === "parent" && view === "list")
                setView("dashboard");
              else if (view === "detail") setView("list");
              else if (view === "add") setView("list");
              else if (view === "edit") setView("detail");
              else if (appUser.role === "parent") setView("dashboard");
            }}
            tab={view === "list" ? listTab : null}
            setTab={setListTab}
            title={
              view === "list"
                ? listTab === "my"
                  ? "My Books"
                  : "Family Library"
                : view === "detail"
                  ? userProgressList.some(
                      (p) =>
                        p.bookId === selectedBook?.id &&
                        p.userEmail === activeKidEmail,
                    )
                    ? "Reading Progress"
                    : "Book Details"
                  : view === "add"
                    ? "ADD BOOK"
                    : view === "edit"
                      ? "EDIT BOOK"
                      : null
            }
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
                ownerEmail={appUser.email}
                onBack={() => setView("list")}
              />
            )}
            {view === "edit" && (
              <AddBook
                theme={currentTheme}
                ownerEmail={appUser.email}
                bookToEdit={selectedBook}
                onBack={() => setView("detail")}
              />
            )}
            {view === "detail" && (
              <BookDetail
                book={selectedBook}
                userEmail={activeKidEmail || appUser.email}
                kidName={activeKidConfig?.name || appUser.name}
                isParent={appUser?.role === "parent"}
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#FFF0F5] via-[#F5F9FF] to-[#EBF3FF] p-4 relative overflow-hidden">
      {/* Decorative elements - "Clouds" */}
      <div className="absolute -top-10 -left-20 w-64 h-64 bg-white/40 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute top-1/2 -right-20 w-80 h-80 bg-white/30 rounded-full blur-3xl animate-pulse delay-700"></div>
      <div className="absolute -bottom-10 left-10 w-48 h-48 bg-white/20 rounded-full blur-2xl animate-pulse delay-1000"></div>

      {/* Floating icons */}
      <div className="absolute top-10 left-6 text-2xl opacity-20 rotate-12 animate-bounce-slow">📚</div>
      <div className="absolute bottom-16 right-6 text-2xl opacity-20 -rotate-12 animate-bounce-slow delay-500">✨</div>
      <div className="absolute top-1/4 right-4 text-xl opacity-20 animate-pulse delay-200">🌸</div>
      <div className="absolute bottom-1/4 left-4 text-xl opacity-20 animate-pulse delay-1000">🚀</div>

      <div className="w-full max-w-[340px] text-center space-y-6 z-10">
        <div className="space-y-6 animate-in fade-in slide-in-from-top-10 duration-700">
          <div className="flex justify-center">
            <img src="/assets/bookmory_logo.png" alt="Bookmory Logo" className="h-14 w-auto drop-shadow-sm" />
          </div>
          
          <div className="relative inline-block">
             <img src="/assets/bookmory_avatar.png" alt="Bookmory Avatar" className="w-40 h-40 mx-auto drop-shadow-xl animate-float" />
             <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-gray-200/20 blur-xl rounded-full -z-10"></div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-gray-800 tracking-tight">Welcome to Bookmory!</h2>
            <p className="text-gray-500 font-medium px-4 leading-relaxed text-xs">Let's track your reading adventure! Ready to explore stories? Sign in below.</p>
          </div>
        </div>

        <div className="space-y-6 animate-in zoom-in-95 duration-500 py-4">
          <button 
            onClick={onGoogleLogin}
            className="w-full flex items-center justify-center space-x-3 p-4 bg-white/80 backdrop-blur-md border-2 border-white/50 rounded-3xl hover:border-blue-200 transition-all shadow-xl shadow-blue-500/5 font-black text-gray-700 active:scale-95 group"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            <span className="text-sm tracking-tight">Sign in with Google Account</span>
          </button>

          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] opacity-80">Use your family email to join</p>
        </div>
        
        <div className="pt-4">
          <button className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Create Family Account</button>
        </div>
      </div>
    </div>
  );
}

function Header({
  theme,
  username,
  onLogout,
  tab,
  setTab,
  title,
  showBack,
  onBack,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header
      className={`relative px-4 py-2 flex justify-between items-center ${theme.card} shadow-sm rounded-b-2xl z-20 sticky top-0 min-h-[72px]`}
    >
      <div className="flex items-center shrink-0 min-w-0 z-10">
        {showBack && (
          <button
            onClick={onBack}
            className={`p-1 mr-1 rounded-xl transition ${theme.secondary} ${theme.text}`}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <img
          src="/assets/bookmory_logo.png"
          alt="Bookmory Logo"
          className="h-11 w-auto drop-shadow-sm"
        />
      </div>

      <div className="flex items-center z-10 space-x-4">
        {title && (
          <span
            className={`text-[14px] font-black uppercase tracking-[0.2em] opacity-80 ${theme.textMuted}`}
          >
            {title}
          </span>
        )}
        {tab && (
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-2 rounded-xl transition ${theme.secondary} ${theme.textMuted} flex items-center space-x-2`}
            >
              <div className="flex flex-col items-end mr-1">
                <span className="text-[14px] font-black uppercase tracking-wider pl-1">
                  {username}
                </span>
              </div>
              {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div
                  className={`absolute right-0 mt-2 w-48 rounded-2xl shadow-2xl border ${theme.border} ${theme.card} overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-100`}
                >
                  <div className="p-2 border-b border-gray-50 bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 py-2">
                    Switch View
                  </div>
                  <button
                    onClick={() => {
                      setTab("my");
                      setIsMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-bold transition ${tab === "my" ? `${theme.primary} text-white` : `${theme.text} hover:bg-gray-100`}`}
                  >
                    My Books
                  </button>
                  <button
                    onClick={() => {
                      setTab("library");
                      setIsMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-bold transition ${tab === "library" ? `${theme.primary} text-white` : `${theme.text} hover:bg-gray-100`}`}
                  >
                    Family Library
                  </button>
                  <div className="border-t border-gray-100 mt-1" />
                  <button
                    onClick={() => {
                      onLogout();
                      setIsMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-4 text-sm font-bold text-red-500 transition hover:bg-red-50`}
                  >
                    <div className="flex items-center space-x-2">
                      <LogOut size={16} />
                      <span>Logout</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
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
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [selectedTags, setSelectedTags] = useState([]);

  const allTags = Array.from(new Set(books.flatMap(b => b.tags || []))).sort();

  const getPercent = (book) => {
    if (!book.progress) return 0;
    const totalLogged = Object.values(book.progress.logs || {}).reduce((sum, log) => sum + (log.pagesRead || 0), 0);
    return Math.min(100, Math.round((totalLogged / (book.progress.totalPages || 1)) * 100));
  };

  const filteredBooks = books
    .filter(book => {
      const matchesSearch = 
        book.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        book.author?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTags = 
        selectedTags.length === 0 || 
        selectedTags.some(tag => book.tags?.includes(tag));
      return matchesSearch && matchesTags;
    })
    .sort((a, b) => {
      if (sortBy === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (sortBy === 'added') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === 'progress') return getPercent(b) - getPercent(a);
      return 0;
    });

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search title or author..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-opacity-50 transition ${theme.card} ${theme.text} shadow-sm`}
            />
          </div>
          <button
            onClick={() =>
              setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
            }
            className={`p-3 rounded-2xl transition shadow-sm ${theme.card} ${theme.textMuted} hover:${theme.text}`}
          >
            {viewMode === "grid" ? (
              <List size={20} />
            ) : (
              <LayoutGrid size={20} />
            )}
          </button>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          <div
            className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-bold shrink-0 ${theme.secondary}`}
          >
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent border-none focus:ring-0 p-0 text-inherit font-bold"
            >
              <option value="updated">Updated</option>
              <option value="added">Added</option>
              <option value="progress">Progress</option>
            </select>
          </div>

          <div className="h-6 w-px bg-gray-200 shrink-0" />

          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedTags.includes(tag)
                  ? `${theme.primary} text-white shadow-md`
                  : `${theme.card} ${theme.textMuted} border border-transparent shadow-sm`
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {filteredBooks.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="text-6xl mb-4 opacity-50">{theme.icon}</div>
          <h2 className={`text-xl font-bold mb-2 ${theme.textMuted}`}>
            {books.length === 0
              ? tab === "my"
                ? "You aren't reading anything yet!"
                : "Library is empty!"
              : "No books match your filters!"}
          </h2>
          {books.length === 0 && tab === "my" && (
            <button
              onClick={() => setTab("library")}
              className={`mt-6 px-6 py-3 rounded-full text-white font-bold shadow-lg flex items-center justify-center mx-auto space-x-2 ${theme.primary}`}
            >
              <BookOpen size={20} /> <span>Browse Library</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className={
              viewMode === "grid" ? "grid grid-cols-2 gap-4" : "space-y-3"
            }
          >
            {filteredBooks.map((book) => {
              const percent = getPercent(book);

              if (viewMode === "list") {
                return (
                  <div
                    key={book.id}
                    onClick={() => onSelect(book)}
                    className={`${theme.card} rounded-2xl p-3 shadow-sm border ${theme.border} cursor-pointer hover:shadow-md transition flex items-center space-x-4`}
                  >
                    <div className="w-12 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 shadow-inner flex items-center justify-center">
                      {book.coverUrl ? (
                        <img
                          src={book.coverUrl}
                          alt="cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen size={20} className="text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <h3
                        className={`font-bold line-clamp-1 text-sm ${theme.text}`}
                      >
                        {book.title || "Untitled Book"}
                      </h3>
                      <p
                        className={`text-[11px] line-clamp-1 ${theme.textMuted}`}
                      >
                        by {book.author || "Unknown Author"}
                      </p>
                    </div>
                    <div className="text-right">
                      {book.progress ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={`text-xs font-black ${theme.primaryText}`}
                          >
                            {percent}%
                          </span>
                          <div
                            className={`w-12 bg-gray-100 rounded-full h-1 mt-1 overflow-hidden`}
                          >
                            <div
                              className={`${theme.primary} h-full rounded-full transition-all`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : (
                        <button
                          className={`px-3 py-1.5 rounded-full text-[10px] font-black text-white shadow-sm ${theme.primary}`}
                        >
                          READ
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={book.id}
                  onClick={() => onSelect(book)}
                  className={`${theme.card} rounded-3xl p-4 shadow-sm border ${theme.border} cursor-pointer hover:shadow-md transition transform hover:-translate-y-1 flex flex-col h-full`}
                >
                  <div className="aspect-[3/4] bg-gray-100 rounded-2xl mb-3 overflow-hidden relative shadow-inner flex items-center justify-center shrink-0">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt="cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen size={40} className="text-gray-300" />
                    )}
                    {tab === "library" && (
                      <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-full text-[10px] font-bold shadow-sm">
                        By{" "}
                        {APP_CONFIG.allowedUsers[book.ownerEmail.toLowerCase()]
                          ?.name || "??"}
                      </div>
                    )}
                  </div>
                  <h3
                    className={`font-bold line-clamp-1 text-sm ${theme.text}`}
                  >
                    {book.title || "Untitled Book"}
                  </h3>
                  <p className={`text-xs mb-2 line-clamp-1 ${theme.textMuted}`}>
                    {book.author || "Unknown Author"}
                  </p>

                  <div className="mt-auto pt-2">
                    {book.progress ? (
                      <>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`${theme.primary} h-2 rounded-full transition-all`}
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                        <div className="text-[10px] text-right mt-1 text-gray-400 font-bold">
                          {percent}%
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-center">
                        <span
                          className={`text-[10px] font-bold px-3 py-1 rounded-full ${theme.secondary} opacity-60`}
                        >
                          Not Started
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <button
        onClick={onAdd}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-30 ${theme.primary}`}
      >
        <Plus size={28} />
      </button>
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

function BookDetail({ book, userEmail, kidName, isParent, theme, onBack, onEdit, onDelete }) {
  const [localBook, setLocalBook] = useState(book);
  const [activeTab, setActiveTab] = useState('progress');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [activeChapterForNote, setActiveChapterForNote] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showReport, setShowReport] = useState(false);

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
      <div className="flex items-center justify-end">
        {isParent && (
          <div className="flex space-x-2">
            <button
              onClick={onEdit}
              className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-blue-500 transition"
            >
              <Edit3 size={20} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-red-500 transition"
            >
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start space-x-4">
        <div className="w-24 shrink-0">
          <img
            src={
              localBook.coverUrl || "https://placehold.co/150x220?text=No+Cover"
            }
            alt={localBook.title}
            className="w-full rounded-xl shadow-lg border-2 border-white"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className={`text-2xl font-black leading-tight mb-1 ${theme.text}`}
          >
            {localBook.title}
          </h2>
          <p className={`font-bold ${theme.primaryText}`}>
            {localBook.author || "Unknown Author"}
          </p>
        </div>
      </div>

      {!progress ? (
        <div
          className={`${theme.card} p-8 rounded-[2rem] shadow-sm border ${theme.border} text-center`}
        >
          <Sparkles className="mx-auto mb-4 text-yellow-400" size={40} />
          <h3 className="font-bold text-xl mb-2">Want to read this?</h3>
          <p className={`text-sm mb-6 ${theme.textMuted}`}>
            Start tracking your reading progress and hit your daily goals!
          </p>
          <button
            onClick={handleStartReading}
            className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg ${theme.primary}`}
          >
            Start Reading
          </button>
        </div>
      ) : (
        <>
          <div
            className={`${theme.card} p-6 rounded-[3rem] shadow-sm border ${theme.border} text-center relative overflow-hidden`}
          >
            <div className="flex justify-between items-center mb-6">
              <h3
                className={`font-bold uppercase tracking-wider text-[10px] ${theme.textMuted}`}
              >
                Progress Tracker
              </h3>
            </div>

            <div className="relative w-48 h-48 mx-auto mb-8 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  className="fill-none stroke-gray-100"
                  strokeWidth="12"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  className={`fill-none ${theme.primaryText} stroke-current transition-all duration-1000`}
                  strokeWidth="12"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={
                    2 * Math.PI * 88 * (1 - progressPercent / 100)
                  }
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`text-5xl font-black ${theme.primaryText}`}>
                  {progressPercent}%
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest ${theme.textMuted}`}
                >
                  Completed
                </div>
              </div>
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 text-3xl animate-bounce-slow">
                🐦
              </div>
            </div>

            <div className="text-center mb-8">
              <h4 className={`text-xl font-black mb-1 ${theme.text}`}>
                Keep Reading, {kidName}! 📖✨
              </h4>
              <p className={`text-xs font-bold ${theme.textMuted}`}>
                Check-in today's reading to hit your goal!
              </p>
            </div>

            <button
              onClick={() => setShowCheckIn(true)}
              className={`w-full py-5 rounded-[2rem] text-lg font-black text-white shadow-xl transition-all active:scale-95 flex items-center justify-center space-x-3 mb-8 ${theme.primary}`}
            >
              <div className="bg-white/20 p-2 rounded-xl">
                <BookOpen size={24} />
              </div>
              <span>Check-In</span>
            </button>

            <div className="text-left mb-4 px-2">
              <h3
                className={`font-bold uppercase tracking-wider text-[10px] ${theme.textMuted}`}
              >
                Daily Goals
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-[2rem] border ${theme.border} relative overflow-hidden bg-orange-50/80 text-left`}
              >
                <div className="text-orange-500 mb-2 flex justify-between items-center">
                  <span className="text-xl">🦊</span>
                  <span className="text-[8px] font-black uppercase text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                    Goal
                  </span>
                </div>
                <div className="text-[10px] font-black mb-1 text-orange-900">
                  Daily Goal
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[8px] font-bold text-orange-700/70">
                    {progress.readingGoal} Pages
                  </span>
                  <span
                    className={`text-[8px] font-black ${theme.primaryText}`}
                  >
                    {stats.completed > 0 ? "100%" : "0%"}
                  </span>
                </div>
                <div className="w-full h-1 bg-orange-100 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full ${stats.completed > 0 ? "bg-orange-400" : "bg-orange-200"} rounded-full`}
                    style={{ width: stats.completed > 0 ? "100%" : "0%" }}
                  ></div>
                </div>
              </div>
              <div
                className={`p-4 rounded-[2rem] border ${theme.border} relative overflow-hidden bg-emerald-50/80 text-left`}
              >
                <div className="text-emerald-500 mb-2 flex justify-between items-center">
                  <span className="text-xl">🐰</span>
                  {stats.completed > 0 ? (
                    <CheckCircle size={14} className="text-emerald-500" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-200" />
                  )}
                </div>
                <div className="text-[10px] font-black mb-1 text-emerald-900">
                  Streak
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[8px] font-bold text-emerald-700/70">
                    {stats.completed} Days
                  </span>
                  <span className="text-[8px] font-black text-emerald-600">
                    Keep it up!
                  </span>
                </div>
                <div className="w-full h-1 bg-emerald-100 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: stats.completed > 0 ? "100%" : "0%" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center items-center mb-6 space-x-2">
            <div className={`flex p-1 rounded-full w-max ${theme.secondary}`}>
              <button
                onClick={() => setActiveTab("progress")}
                className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === "progress" ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}
              >
                Chapters
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className={`px-6 py-2 rounded-full font-bold text-sm transition ${activeTab === "notes" ? `${theme.card} shadow-sm ${theme.text}` : theme.textMuted}`}
              >
                All Notes
              </button>
            </div>
            {activeTab === "notes" && (
              <button
                onClick={() => setShowReport(true)}
                className={`p-2 rounded-full ${theme.primary} text-white shadow-md transition hover:scale-105`}
                title="Create Reading Report"
              >
                <Printer size={20} />
              </button>
            )}
          </div>

          {activeTab === "progress" ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2 px-2">
                <h3
                  className={`font-bold text-[10px] uppercase ${theme.textMuted}`}
                >
                  Reading Checklist
                </h3>
                {progress?.toc?.length > 0 && (
                  <span
                    className={`text-[10px] font-black px-2 py-1 rounded-lg ${theme.secondary}`}
                  >
                    {progress.toc.filter((c) => c.completed).length} /{" "}
                    {progress.toc.length}
                  </span>
                )}
              </div>
              {(localBook.progress?.toc || localBook.toc || []).map(
                (chapter, idx) => (
                  <div
                    key={chapter.id || idx}
                    className={`${theme.card} p-4 rounded-2xl shadow-sm border ${theme.border} flex items-center space-x-4 transition ${chapter.completed ? "opacity-70" : ""}`}
                  >
                    <button
                      onClick={() => toggleChapter(idx)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition ${chapter.completed ? `${theme.primary} border-transparent text-white` : `border-gray-300 text-transparent hover:border-gray-400`}`}
                    >
                      <CheckCircle
                        size={20}
                        className={chapter.completed ? "block" : "hidden"}
                      />
                      {!chapter.completed && (
                        <div className="w-2 h-2 rounded-full bg-gray-200" />
                      )}
                    </button>
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => toggleChapter(idx)}
                    >
                      <h4
                        className={`font-bold truncate ${chapter.completed ? `line-through ${theme.textMuted}` : theme.text}`}
                      >
                        {chapter.title}
                      </h4>
                      {chapter.page && (
                        <p className="text-[10px] text-gray-400">
                          Page {chapter.page}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setActiveChapterForNote(chapter);
                        setShowNoteModal(true);
                      }}
                      className={`p-2 rounded-full transition ${chapter.notes?.length > 0 ? theme.secondary : `hover:${theme.secondary} ${theme.textMuted}`}`}
                    >
                      <Edit3 size={18} />
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(localBook.progress?.toc || localBook.toc || [])
                .flatMap(
                  (ch) =>
                    ch.notes?.map((n) => ({ ...n, chTitle: ch.title })) || [],
                )
                .map((note, i) => (
                  <div
                    key={i}
                    className={`${theme.card} p-4 rounded-2xl shadow-sm border ${theme.border}`}
                  >
                    <div
                      className={`text-xs font-bold mb-2 ${theme.textMuted}`}
                    >
                      {note.chTitle}
                    </div>
                    <p
                      className={`whitespace-pre-wrap text-sm font-medium ${theme.text}`}
                    >
                      {note.text}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {showNoteModal && (
        <NoteModal
          chapter={activeChapterForNote}
          theme={theme}
          onClose={() => setShowNoteModal(false)}
          onSave={(noteText) => {
            const newNote = { text: noteText, date: Date.now() };
            if (localBook.progress) {
              const updatedToc = (localBook.progress.toc || []).map((ch) =>
                ch.id === activeChapterForNote.id ||
                ch.title === activeChapterForNote.title
                  ? { ...ch, notes: [newNote] }
                  : ch,
              );
              saveProgress({ ...localBook.progress, toc: updatedToc });
            } else {
              const updatedToc = (localBook.toc || []).map((ch) =>
                ch.id === activeChapterForNote.id
                  ? { ...ch, notes: [newNote] }
                  : ch,
              );
              saveUpdates({ ...localBook, toc: updatedToc });
            }
            setShowNoteModal(false);
          }}
        />
      )}

      {localBook.summary && (
        <div
          className={`${theme.card} p-5 rounded-[2rem] shadow-sm border ${theme.border}`}
        >
          <h3
            className={`font-bold text-[10px] uppercase mb-2 ${theme.textMuted}`}
          >
            About this book
          </h3>
          <p className={`text-xs leading-relaxed italic ${theme.text}`}>
            {localBook.summary}
          </p>
          {localBook.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {localBook.tags.map((tag, i) => (
                <span
                  key={i}
                  className={`px-2 py-1 rounded-lg text-[9px] font-bold ${theme.secondary}`}
                >
                  {tag}
                </span>
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
            const today = new Date().toISOString().split("T")[0];
            const updatedLogs = {
              ...progress.logs,
              [today]: { pagesRead, currentPage, date: Date.now() },
            };

            // Auto-complete ToC items based on page number
            const updatedToc = (progress.toc || []).map((item) => {
              // Extract the first number found in the page string (e.g., "Page 10" -> 10)
              const pageMatch = String(item.page || "").match(/\d+/);
              const itemPage = pageMatch ? parseInt(pageMatch[0]) : NaN;

              if (!isNaN(itemPage) && itemPage > 0 && itemPage <= currentPage) {
                return { ...item, completed: true };
              }
              return item;
            });

            await saveProgress({
              ...progress,
              logs: updatedLogs,
              toc: updatedToc,
              lastPageRead: currentPage,
            });
            setShowCheckIn(false);
          }}
        />
      )}
      {progress && (
        <button
          onClick={async () => {
            if (
              !confirm(
                "Are you sure you want to stop reading this book and remove it from your list? Your progress will be deleted.",
              )
            )
              return;
            try {
              await deleteDoc(doc(db, "reading_progress", progress.id));
              onBack();
            } catch (err) {
              console.error(err);
              alert("Failed to stop reading.");
            }
          }}
          className="w-full py-4 rounded-2xl font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-colors mt-4"
        >
          Stop Reading & Remove from My Books
        </button>
      )}

      {showReport && (
        <ReadingReportModal
          progress={progress}
          book={localBook}
          theme={theme}
          onClose={() => setShowReport(false)}
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
  const [text, setText] = useState((chapter.notes || []).map(n => n.text).join('\n\n'));
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

function ReadingReportModal({ progress, book, theme, onClose }) {
  const [reportType, setReportType] = useState('summary');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const allNotes = progress.toc?.flatMap(ch => ch.notes?.map(n => ({...n, chTitle: ch.title, page: ch.page})) || []) || [];

  const generateSummary = async () => {
    setIsLoading(true);
    try {
      const notesText = allNotes.map(n => `${n.chTitle}: ${n.text}`).join('\n');
      
      const prompt = `You are a friendly reading assistant for a kid. Write a cute, encouraging 1-page reading report for the book "${book.title}" by ${book.author}. 
Here are the kid's notes:
${notesText}

Format the report with a friendly title, a short summary of what the book is about, a section highlighting their favorite parts (based on notes), and a cheerful conclusion. Use simple HTML formatting (like <h1>, <h2>, <p>, <ul>, <li>, <strong>) to make it look nice. Do NOT use Markdown formatting like asterisks or backticks in your final output, ONLY use HTML. Add some cute emojis. Keep it concise enough to fit on one A4 page.`;

      const result = await callGemini(prompt, null, false);
      let htmlContent = result;
      // Strip markdown code blocks if gemini outputs them
      htmlContent = htmlContent.replace(/```html/g, '').replace(/```/g, '');
      setContent(htmlContent);
    } catch (err) {
      console.error(err);
      setContent("<p>Oops, couldn't generate the report right now. Please try again later!</p>");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (reportType === 'summary' && !content) {
      if (allNotes.length > 0) {
        generateSummary();
      } else {
        setTimeout(() => {
          if (isMounted) setContent("<p>You haven't written any notes yet! Add some notes while reading to get a cool AI summary.</p>");
        }, 0);
      }
    }
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto flex flex-col">
      <div className="print:hidden p-4 flex justify-between items-center bg-gray-50 border-b shrink-0">
        <button
          onClick={onClose}
          className="p-2 bg-white rounded-full shadow-sm text-gray-500 hover:bg-gray-100 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex space-x-2 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
          <button
            onClick={() => setReportType("summary")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${reportType === "summary" ? theme.primary + " text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
          >
            AI Summary
          </button>
          <button
            onClick={() => setReportType("full")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${reportType === "full" ? theme.primary + " text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
          >
            Full Notes
          </button>
        </div>
        <button
          onClick={handlePrint}
          className={`px-4 py-2 rounded-xl text-white font-bold shadow-md transition hover:opacity-90 flex items-center space-x-2 ${theme.primary}`}
        >
          <Printer size={18} />
          <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      <div
        className="flex-1 p-8 print:p-0 max-w-3xl mx-auto w-full bg-white print:bg-transparent"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        {reportType === "summary" ? (
          isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <Sparkles
                className={`animate-spin ${theme.primaryText}`}
                size={40}
              />
              <p className="font-bold text-gray-500">
                Gemini is writing your cute report...
              </p>
            </div>
          ) : (
            <div
              className={`max-w-none text-gray-800 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:mb-4 [&_h1]:text-gray-900 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-gray-900 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-2 [&_strong]:font-black [&_strong]:text-gray-900`}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )
        ) : (
          <div className="space-y-6">
            <div className="text-center pb-6 border-b-4 border-gray-100">
              <h1 className="text-3xl sm:text-4xl font-black mb-2 text-gray-900">
                My Notes: {book.title}
              </h1>
              <p className="text-lg font-bold text-gray-500">
                by {book.author}
              </p>
            </div>
            {allNotes.length === 0 ? (
              <p className="text-center text-gray-400 italic mt-10">
                No notes yet!
              </p>
            ) : (
              <div className="space-y-4">
                {allNotes
                  .sort((a, b) => parseInt(a.page || 0) - parseInt(b.page || 0))
                  .map((note, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-2xl bg-gray-50 border border-gray-200 break-inside-avoid shadow-sm"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-sm text-gray-900">
                          {note.chTitle}
                        </span>
                        {note.page && (
                          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-white shadow-sm border border-gray-100 text-gray-500">
                            Page {note.page}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap font-medium leading-relaxed text-gray-700">
                        {note.text}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}