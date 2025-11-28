import React, { useState, useEffect } from 'react';
import { BookOpen, Clock, Settings, FileText, Loader2, Wand2, CheckCircle, XCircle, Trophy, Flame, User, LogOut, ChevronRight, AlertCircle, Newspaper } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, increment } from "firebase/firestore";

// --- DAILY CONFIGURATION (FOR CREATOR ONLY) ---
// Update this string daily to change the source for everyone.
// Examples: "The Hindu", "Aeon Essays", "The Guardian", "Project Syndicate", "Scientific American"
const DAILY_SOURCE = "The Hindu"; 

// --- FIREBASE CONFIGURATION ---
// IMPORTANT: Paste your real Firebase config here again!
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDLn30upjipjMWhH-D7gPawPprdjnU49l0",
  authDomain: "cat-prep-rc.firebaseapp.com",
  projectId: "cat-prep-rc",
  storageBucket: "cat-prep-rc.firebasestorage.app",
  messagingSenderId: "452526867396",
  appId: "1:452526867396:web:32106a7e977ad95a049a91",
  measurementId: "G-620EKJQESC"
};

// Initialize Firebase
let auth, db, googleProvider;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
} catch (e) {
    console.warn("Firebase config missing.");
}

export default function App() {
    const [isLoading, setIsLoading] = useState(false);
    const [generatedRC, setGeneratedRC] = useState(null);
    const [userAnswers, setUserAnswers] = useState({});
    const [score, setScore] = useState(null);
    const [timer, setTimer] = useState(0);
    const [isTimerActive, setIsTimerActive] = useState(false);
    
    const [user, setUser] = useState(null);
    const [userStats, setUserStats] = useState({ xp: 0, streak: 0, testsTaken: 0 });
    const [leaderboard, setLeaderboard] = useState([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Authentication Listener
    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                const docRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(docRef);
                const today = new Date().toISOString();

                if (docSnap.exists()) {
                    await updateDoc(docRef, {
                        lastLogin: today,
                        displayName: currentUser.displayName,
                        email: currentUser.email 
                    });
                    setUserStats(docSnap.data());
                } else {
                    await setDoc(docRef, {
                        displayName: currentUser.displayName,
                        email: currentUser.email,
                        photoURL: currentUser.photoURL,
                        xp: 0,
                        streak: 0,
                        testsTaken: 0,
                        lastLogin: today,
                        createdAt: today
                    });
                }
                fetchLeaderboard();
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchLeaderboard = async () => {
        if (!db) return;
        const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        const lb = [];
        querySnapshot.forEach((doc) => lb.push(doc.data()));
        setLeaderboard(lb);
    };

    const handleLogin = async () => {
        if (!auth) return alert("Firebase not configured!");
        try { await signInWithPopup(auth, googleProvider); } catch (error) { console.error(error); }
    };

    const handleLogout = async () => {
        if (auth) await signOut(auth);
        setUser(null);
    };

    const submitTest = async () => {
        setIsTimerActive(false);
        let correctCount = 0;
        generatedRC.questions.forEach(q => {
            if (userAnswers[q.id] === q.correct_option_index) correctCount++;
        });
        setScore(correctCount);

        if (user && db) {
            const xpGained = correctCount * 10;
            const newStats = {
                xp: increment(xpGained),
                testsTaken: increment(1),
                lastActivity: new Date().toISOString()
            };
            await updateDoc(doc(db, "users", user.uid), newStats);
            setUserStats(prev => ({ ...prev, xp: prev.xp + xpGained }));
            fetchLeaderboard();
        }
    };

    useEffect(() => {
        let interval = null;
        if (isTimerActive) interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
        return () => clearInterval(interval);
    }, [isTimerActive]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const generateRC = async () => {
        setIsLoading(true);
        setGeneratedRC(null);
        setScore(null);
        setUserAnswers({});
        setTimer(0);

        const prompt = `Act as a senior CAT (Common Admission Test) Exam setter.
        TASK: Create a brand new, high-difficulty Reading Comprehension passage (approx 450-550 words).
        
        SOURCE INSTRUCTION: Write this passage mimicking the specific editorial style, vocabulary, complexity, and tone of "${DAILY_SOURCE}".
        The passage should feel exactly like an editorial from this source.
        
        TOPIC: Choose a random complex topic (Philosophy, Economics, Art History, or Sociology) suitable for this publication.
        
        THEN, generate 4 CAT-style questions based on it.
        - Q1: Main Idea / Central Theme
        - Q2: Inference (What does the author imply...)
        - Q3: Critical Reasoning (Which statement weakens the argument...)
        - Q4: Tone / Structure
        
        OUTPUT JSON format ONLY: 
        { 
            "passage_title": "Abstract Title", 
            "extracted_text": "The full passage text...", 
            "questions": [
                { 
                    "id": 1, 
                    "question_text": "...", 
                    "options": ["Option A", "Option B", "Option C", "Option D"], 
                    "correct_option_index": 0, 
                    "explanation": "Detailed explanation of why the answer is correct." 
                }
            ] 
        }`;

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) throw new Error("Server error. Please check Vercel logs.");
            const data = await response.json();

            const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || data.result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!resultText) throw new Error("No text generated");
            
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '');
            const parsedRC = JSON.parse(cleanJson);
            
            setGeneratedRC(parsedRC);
            setIsTimerActive(true);
            setIsLoading(false);
        } catch (error) {
            alert("Error: " + error.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
             {showLeaderboard && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800"><Trophy className="text-yellow-500 fill-yellow-500" /> Leaderboard</h2>
                            <button onClick={() => setShowLeaderboard(false)} className="text-gray-400 hover:text-gray-600"><XCircle /></button>
                        </div>
                        <div className="space-y-3">
                            {leaderboard.map((u, i) => (
                                <div key={i} className={`flex items-center justify-between p-4 rounded-xl ${i === 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`font-bold w-6 text-center ${i===0 ? 'text-yellow-600 text-xl' : 'text-gray-400'}`}>#{i+1}</span>
                                        {u.photoURL && <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />}
                                        <span className="font-semibold text-gray-700">{u.displayName}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-green-600">{u.xp} XP</div>
                                        <div className="text-xs text-gray-400 font-medium">Streak: {u.streak} 🔥</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {/* --- HEADER --- */}
            <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-green-100 shadow-sm relative bg-green-50">
                            {/* LOGO */}
                            <img src="http://googleusercontent.com/image_generation_content/0" alt="Krishna Logo" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Krishna <span className="text-green-600">for CAT</span></h1>
                            <p className="text-xs text-gray-500 font-medium tracking-wide">Daily RC Mastery</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4 items-center">
                        {user ? (
                            <div className="flex items-center bg-gray-50 rounded-full border border-gray-200 p-1 pr-4 shadow-inner">
                                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border-2 border-white" />
                                <div className="ml-3 mr-4 hidden md:block">
                                    <div className="text-xs font-bold text-gray-900">{user.displayName}</div>
                                    <div className="text-[10px] font-bold text-green-500">{userStats.xp} XP</div>
                                </div>
                                <button onClick={() => setShowLeaderboard(true)} className="p-1.5 hover:bg-white rounded-full transition-colors text-gray-500 hover:text-green-600"><Trophy className="w-4 h-4" /></button>
                                <button onClick={handleLogout} className="p-1.5 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-red-500 ml-1"><LogOut className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <button onClick={handleLogin} className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-gray-800 transition shadow-md hover:shadow-lg">
                                <User className="w-4 h-4" /> Login
                            </button>
                        )}
                        
                        {isTimerActive && (
                            <div className="bg-green-600 text-white px-4 py-1.5 rounded-md font-mono font-bold shadow-md flex items-center gap-2 animate-pulse">
                                <Clock className="w-4 h-4" /> {formatTime(timer)}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-grow flex flex-col items-center justify-center p-4">
                
                {/* STATE 1: IDLE / START */}
                {!generatedRC && !isLoading && (
                    <div className="text-center max-w-2xl w-full animate-fade-in-up">
                        <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">
                            {/* Decorative Background Element */}
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-indigo-500"></div>
                            
                            <div className="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <BookOpen className="w-10 h-10 text-green-600" />
                            </div>
                            
                            <h2 className="text-3xl font-bold text-gray-900 mb-2">Daily RC Practice</h2>
                            
                            {/* Source Badge */}
                            <div className="flex items-center justify-center gap-2 mb-6">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Source of the Day</span>
                                <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                                    {DAILY_SOURCE}
                                </span>
                            </div>

                            <p className="text-gray-500 mb-8 text-lg">
                                Generate a high-difficulty passage mimicking <strong>{DAILY_SOURCE}</strong> with CAT-level inference questions.
                            </p>
                            
                            <button 
                                onClick={generateRC} 
                                className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-green-600 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 w-full md:w-auto"
                            >
                                <Wand2 className="w-5 h-5 mr-2" />
                                Start Session
                            </button>
                            
                            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
                                <AlertCircle className="w-4 h-4" />
                                <span>Strict CAT Difficulty Level</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATE 2: LOADING */}
                {isLoading && (
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700">Analyzing {DAILY_SOURCE}...</h3>
                        <p className="text-gray-500">Curating editorial & crafting questions</p>
                    </div>
                )}

                {/* STATE 3: ACTIVE TEST (CAT INTERFACE) */}
                {generatedRC && (
                    <div className="w-full max-w-[1400px] h-[calc(100vh-140px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col md:flex-row">
                        
                        {/* LEFT: PASSAGE */}
                        <div className="md:w-1/2 h-full border-r border-gray-200 flex flex-col bg-[#fcfcfc]">
                            <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Passage</span>
                                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-300">
                                        Source: {DAILY_SOURCE}
                                    </span>
                                </div>
                                <h2 className="font-bold text-gray-800 text-sm truncate max-w-[200px]">{generatedRC.passage_title}</h2>
                            </div>
                            <div className="p-8 overflow-y-auto flex-grow font-serif text-lg leading-relaxed text-gray-800 selection:bg-green-100 selection:text-green-900">
                                {generatedRC.extracted_text.split('\n').map((para, i) => (
                                    para.trim() && <p key={i} className="mb-6 indent-8 text-justify">{para}</p>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT: QUESTIONS */}
                        <div className="md:w-1/2 h-full flex flex-col bg-gray-50">
                            <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 shadow-sm z-10">
                                <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Questions</span>
                                {score !== null && (
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${score >= 3 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                        Score: {score} / 4
                                    </span>
                                )}
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-grow space-y-8">
                                {generatedRC.questions.map((q, i) => (
                                    <div key={q.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex gap-4 mb-4">
                                            <span className="flex-shrink-0 w-8 h-8 bg-green-50 text-green-600 font-bold rounded-lg flex items-center justify-center text-sm">
                                                Q{i+1}
                                            </span>
                                            <p className="font-medium text-gray-800 pt-1">{q.question_text}</p>
                                        </div>

                                        <div className="space-y-2 ml-12">
                                            {q.options.map((opt, optIdx) => {
                                                let btnStyle = "bg-white border-gray-200 hover:bg-gray-50 text-gray-600";
                                                
                                                if (score !== null) {
                                                    // Review Mode
                                                    if (optIdx === q.correct_option_index) btnStyle = "bg-green-50 border-green-500 text-green-800 font-medium";
                                                    else if (userAnswers[q.id] === optIdx) btnStyle = "bg-red-50 border-red-300 text-red-800";
                                                    else btnStyle = "bg-gray-50 border-gray-100 text-gray-400 opacity-60";
                                                } else {
                                                    // Active Mode
                                                    if (userAnswers[q.id] === optIdx) btnStyle = "bg-green-50 border-green-500 text-green-900 shadow-sm ring-1 ring-green-500 font-medium";
                                                }

                                                return (
                                                    <button 
                                                        key={optIdx} 
                                                        onClick={() => score === null && setUserAnswers(prev => ({...prev, [q.id]: optIdx}))}
                                                        className={`w-full text-left p-4 rounded-lg border text-sm transition-all duration-200 flex justify-between items-center group ${btnStyle}`}
                                                        disabled={score !== null}
                                                    >
                                                        <span>{opt}</span>
                                                        {score === null && userAnswers[q.id] === optIdx && <div className="w-2 h-2 rounded-full bg-green-600"></div>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {score !== null && (
                                            <div className="ml-12 mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900 animate-fade-in">
                                                <strong className="block mb-1 font-semibold text-blue-700">Explanation:</strong>
                                                {q.explanation}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
                                {score === null ? (
                                    <button 
                                        onClick={submitTest} 
                                        disabled={Object.keys(userAnswers).length < 4}
                                        className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg transition-all ${Object.keys(userAnswers).length < 4 ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 hover:-translate-y-1'}`}
                                    >
                                        Submit Test
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => {setGeneratedRC(null); setScore(null);}} 
                                        className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform hover:-translate-y-1"
                                    >
                                        Next Session <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}