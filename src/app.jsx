import React, { useState, useEffect } from 'react';
import { BookOpen, Clock, Settings, Key, FileText, Loader2, Wand2, CheckCircle, XCircle, Search, Globe, Trophy, Flame, User, LogOut } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, increment } from "firebase/firestore";
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

// Initialize Firebase (Try/Catch to prevent crash if config is missing)
let auth, db, googleProvider;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
} catch (e) {
    console.warn("Firebase not configured yet. Gamification features disabled.");
}

const DEMO_TEXT = `[...Header Data...]
THE HINDU - OPINION
Tuesday, Nov 26, 2025

EDITORIAL: THE ATTENTION ECONOMY
The rise of the "attention economy" has fundamentally altered the landscape of human cognition. Where once information was the scarce resource, today it is attention itself that is mined, commodified, and sold. This shift is not merely economic but ontological; it changes what it means to be a subject in the world. The algorithms that curate our digital feeds are not neutral arbiters of taste but active architects of desire, designing loops of feedback that prioritize engagement over truth, and outrage over nuance. 

Consider the implications for democratic discourse. Habermas's ideal of the public sphere presupposed a citizenry capable of rational-critical debate, a capacity that requires the temporal luxury of reflection. The attention economy, by contrast, thrives on immediacy. It collapses the gap between stimulus and response, effectively short-circuiting the deliberative process.

[...Sports Section...]
India wins cricket match against Australia...
[...Ads...]
Buy 1 Get 1 Free...`;

export default function App() {
    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [generatedRC, setGeneratedRC] = useState(null);
    const [userAnswers, setUserAnswers] = useState({});
    const [score, setScore] = useState(null);
    const [timer, setTimer] = useState(0);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const [apiKey, setApiKey] = useState(""); 
    const [showSettings, setShowSettings] = useState(true);
    const [autoExtract, setAutoExtract] = useState(true);
    const [useBackend, setUseBackend] = useState(true);

    // --- NEW STATE FOR GAMIFICATION ---
    const [user, setUser] = useState(null);
    const [userStats, setUserStats] = useState({ xp: 0, streak: 0, testsTaken: 0 });
    const [leaderboard, setLeaderboard] = useState([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // --- AUTHENTICATION & DATA LOADING ---
    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Fetch User Stats
                const docRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Check Streak Integrity
                    const today = new Date().toISOString().split('T')[0];
                    const lastDate = data.lastPracticeDate;
                    
                    // If missed a day (and it's not today), reset streak to 0 locally (will update DB on next practice)
                    let currentStreak = data.streak || 0;
                    if (lastDate !== today) {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = yesterday.toISOString().split('T')[0];
                        if (lastDate !== yesterdayStr && lastDate !== today) currentStreak = 0;
                    }
                    
                    setUserStats({ ...data, streak: currentStreak });
                } else {
                    // Create new user profile
                    await setDoc(docRef, {
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        xp: 0,
                        streak: 0,
                        testsTaken: 0,
                        lastPracticeDate: ""
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
        if (!auth) return alert("Firebase not configured in code!");
        try { await signInWithPopup(auth, googleProvider); } catch (error) { console.error(error); }
    };

    const handleLogout = async () => {
        if (auth) await signOut(auth);
        setUser(null);
        setUserStats({ xp: 0, streak: 0, testsTaken: 0 });
    };

    // --- UPDATED SUBMIT LOGIC ---
    const submitTest = async () => {
        setIsTimerActive(false);
        let correctCount = 0;
        generatedRC.questions.forEach(q => {
            if (userAnswers[q.id] === q.correct_option_index) correctCount++;
        });
        setScore(correctCount);

        // SAVE PROGRESS IF LOGGED IN
        if (user && db) {
            const today = new Date().toISOString().split('T')[0];
            const xpGained = correctCount * 10; // 10 XP per correct answer
            
            // Streak Logic
            let newStreak = userStats.streak;
            const lastDate = userStats.lastPracticeDate;
            
            if (lastDate !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                
                if (lastDate === yesterdayStr) {
                    newStreak += 1;
                } else {
                    newStreak = 1; // Reset or Start new
                }
            }

            const newStats = {
                xp: increment(xpGained),
                testsTaken: increment(1),
                streak: newStreak,
                lastPracticeDate: today,
                displayName: user.displayName // Update name in case it changed
            };

            await updateDoc(doc(db, "users", user.uid), newStats);
            setUserStats(prev => ({
                ...prev,
                xp: prev.xp + xpGained,
                streak: newStreak,
                testsTaken: prev.testsTaken + 1,
                lastPracticeDate: today
            }));
            fetchLeaderboard(); // Refresh leaderboard
        }
    };

    // Load API Key from local storage (Fallback only)
    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        if (storedKey) setApiKey(storedKey);
    }, []);

    const handleApiKeyChange = (e) => {
        const key = e.target.value;
        setApiKey(key);
        localStorage.setItem("gemini_api_key", key);
    };

    // Timer logic
    useEffect(() => {
        let interval = null;
        if (isTimerActive) {
            interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
        } else if (!isTimerActive && timer !== 0) {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isTimerActive, timer]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const generateRC = async () => {
        if (!inputText && !DEMO_TEXT) return;
        const textToProcess = inputText || DEMO_TEXT;
        
        setIsLoading(true);
        setGeneratedRC(null);
        setScore(null);
        setUserAnswers({});
        setTimer(0);

        const extractionInstruction = autoExtract 
            ? `FIRST, analyze the provided raw text (which may contain noise, ads, or other news) and EXTRACT ONLY the main "Editorial" or "Opinion" piece. If there are multiple, pick the most intellectual/abstract one suitable for CAT.`
            : `Use the provided text exactly as is.`;

        setStatusMessage(autoExtract ? "Scanning & Extracting Editorial..." : "Generating Questions...");

        const prompt = `
            Act as a strict CAT (Common Admission Test) Exam setter. 
            INPUT CONTEXT: ${extractionInstruction}
            TASK: Generate a Reading Comprehension set based on that extracted passage.
            OUTPUT JSON STRUCTURE:
            {
                "passage_title": "A short, abstract title",
                "extracted_text": "The clean text",
                "questions": [
                    {
                        "id": 1,
                        "question_text": "Question?",
                        "options": ["A", "B", "C", "D"],
                        "correct_option_index": 0,
                        "explanation": "Why?"
                    }
                ]
            }
            REQUIREMENTS: 4 Questions (Main Idea, Inference, Tone, Critical Reasoning). Tricky options.
            RAW INPUT TEXT: 
            ${textToProcess}
        `;

        try {
            let data;
            
            // STRATEGY: Try Backend First, Fallback to Client Key
            if (useBackend) {
                try {
                    const response = await fetch('/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt })
                    });
                    
                    if (!response.ok) throw new Error("Backend not found or error");
                    data = await response.json();
                    
                } catch (backendError) {
                    console.warn("Backend failed, falling back to client key:", backendError);
                    setUseBackend(false); // Switch to manual mode for next time
                    if (!apiKey) throw new Error("Backend unavailable and no API Key provided.");
                    
                    // Fallback to direct Google call
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { responseMimeType: "application/json" }
                        })
                    });
                    data = await response.json();
                }
            } else {
                 // Direct Google Call (Manual Mode)
                 const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });
                data = await response.json();
            }

            if(data.error) throw new Error(data.error.message);
            
            // Handle different structure from Backend vs Direct
            const candidates = data.candidates || data.result?.candidates;
            const resultText = candidates[0].content.parts[0].text;
            const parsedRC = JSON.parse(resultText);
            
            setGeneratedRC({ ...parsedRC });
            setIsTimerActive(true);
            setIsLoading(false);
            setShowSettings(false);

        } catch (error) {
            alert("Error: " + error.message + "\n\nIf you are hosting this, check your Vercel logs. If running locally, ensure you have an API key.");
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-gray-100 font-sans text-gray-900 relative">
            {/* LEADERBOARD OVERLAY */}
            {showLeaderboard && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="text-yellow-500" /> Leaderboard</h2>
                            <button onClick={() => setShowLeaderboard(false)} className="text-gray-500 hover:text-gray-800"><XCircle /></button>
                        </div>
                        <div className="space-y-4">
                            {leaderboard.map((u, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${u.displayName === user?.displayName ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono font-bold text-gray-400">#{idx + 1}</span>
                                        {u.photoURL && <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />}
                                        <span className="font-semibold text-gray-800">{u.displayName}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1 text-orange-500 text-sm"><Flame className="w-3 h-3 fill-current" /> {u.streak}</div>
                                        <div className="font-bold text-indigo-600">{u.xp} XP</div>
                                    </div>
                                </div>
                            ))}
                            {leaderboard.length === 0 && <p className="text-center text-gray-500">No data yet. Be the first!</p>}
                        </div>
                    </div>
                </div>
            )}

            <header className="w-full max-w-7xl flex justify-between items-center mb-8 border-b border-gray-300 pb-4">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-8 h-8 text-indigo-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 leading-none">CAT Prep <span className="font-light text-indigo-600">Daily</span></h1>
                        <p className="text-xs text-gray-500 font-mono tracking-wide">AI Editorial Generator</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    {/* GAMIFICATION HEADER ITEMS */}
                    {user ? (
                        <div className="flex items-center gap-4 bg-white px-4 py-1.5 rounded-full shadow-sm border border-gray-200">
                            <div className="flex items-center gap-1 text-orange-500 font-bold" title="Daily Streak">
                                <Flame className="w-4 h-4 fill-current" /> {userStats.streak}
                            </div>
                            <div className="flex items-center gap-1 text-indigo-600 font-bold" title="Total XP">
                                <Trophy className="w-4 h-4" /> {userStats.xp}
                            </div>
                            <div className="h-4 w-px bg-gray-300"></div>
                            <button onClick={() => setShowLeaderboard(true)} className="text-xs font-semibold text-gray-600 hover:text-indigo-600">
                                Top 5
                            </button>
                            {user.photoURL && <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" />}
                            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500"><LogOut className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <button onClick={handleLogin} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition">
                            <User className="w-4 h-4" /> Login to Save
                        </button>
                    )}

                    {isTimerActive && (
                        <div className="bg-gray-800 text-white px-4 py-1 rounded-full font-mono flex items-center">
                            <Clock className="w-4 h-4 mr-2" />
                            {formatTime(timer)}
                        </div>
                    )}
                    <button onClick={() => setShowSettings(!showSettings)} className="text-gray-500 hover:text-indigo-600 transition-colors">
                        <Settings className="w-6 h-6" />
                    </button>
                </div>
            </header>
            
            {showSettings && (
                <div className="w-full max-w-7xl bg-white rounded-xl shadow-lg p-6 mb-8 transition-all">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <Key className="w-4 h-4" /> Connection
                            </h3>
                            
                            {/* Intelligent Status Indicator */}
                            <div className={`p-3 rounded-lg mb-4 text-sm flex items-center gap-2 ${useBackend ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-orange-50 text-orange-800 border border-orange-200'}`}>
                                {useBackend ? (
                                    <>
                                        <Globe className="w-4 h-4" /> 
                                        <span><strong>Live Mode:</strong> Using Backend Server (No Key Needed)</span>
                                    </>
                                ) : (
                                    <>
                                        <Key className="w-4 h-4" />
                                        <span><strong>Manual Mode:</strong> Using Browser Key</span>
                                    </>
                                )}
                            </div>

                            {!useBackend && (
                                <input 
                                    type="password" 
                                    placeholder="Paste Gemini API Key here..."
                                    className="w-full p-2 border rounded mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={apiKey}
                                    onChange={handleApiKeyChange}
                                />
                            )}
                            
                            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100 mt-4">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors ${autoExtract ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${autoExtract ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Auto-Extract Editorial</span>
                                    <input type="checkbox" className="hidden" checked={autoExtract} onChange={() => setAutoExtract(!autoExtract)} />
                                </label>
                                <p className="text-xs text-indigo-600 mt-1 ml-13">Ignores ads/sports in PDF dumps.</p>
                            </div>

                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setInputText(DEMO_TEXT)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition">Load Demo Text</button>
                                <button onClick={() => setInputText("")} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition">Clear</button>
                            </div>
                        </div>
                        <div className="flex flex-col h-full">
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Input
                            </h3>
                            <textarea 
                                className="w-full flex-grow p-3 border rounded focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-xs font-mono text-gray-600"
                                placeholder="Paste extracted PDF text here..."
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            ></textarea>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button 
                            onClick={generateRC}
                            disabled={isLoading || (!useBackend && !apiKey)}
                            className={`px-8 py-3 rounded-lg font-bold text-white flex items-center gap-2 ${isLoading || (!useBackend && !apiKey) ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md transform hover:-translate-y-1 transition'}`}
                        >
                            {isLoading ? <><Loader2 className="animate-spin w-5 h-5" /> {statusMessage || "Analyzing..."}</> : <><Wand2 className="w-5 h-5" /> Generate RC</>}
                        </button>
                    </div>
                </div>
            )}

            {generatedRC && !showSettings && (
                <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl flex-grow h-[calc(100vh-180px)]">
                    <div className="lg:w-1/2 bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-full">
                        <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center flex-shrink-0">
                            <h2 className="font-bold text-indigo-900 truncate pr-4">{generatedRC.passage_title}</h2>
                        </div>
                        <div className="p-6 overflow-y-auto font-serif leading-relaxed text-lg text-gray-800 flex-1">
                            {generatedRC.extracted_text?.split('\n').map((para, idx) => para.trim() && <p key={idx} className="mb-4 indent-8 text-justify">{para}</p>)}
                        </div>
                    </div>
                    <div className="lg:w-1/2 bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-full">
                        <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                            <h2 className="font-bold text-gray-700">Questions</h2>
                            {score !== null && <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">Score: {score}/4</span>}
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-8">
                            {generatedRC.questions.map((q, index) => (
                                <div key={q.id}>
                                    <div className="flex gap-3 mb-3">
                                        <span className="w-6 h-6 rounded bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                                        <p className="font-medium text-gray-800">{q.question_text}</p>
                                    </div>
                                    <div className="space-y-2 ml-9">
                                        {q.options.map((option, optIdx) => (
                                            <button 
                                                key={optIdx}
                                                onClick={() => score === null && setUserAnswers(prev => ({...prev, [q.id]: optIdx}))}
                                                className={`w-full text-left p-3 rounded-lg border text-sm transition ${score !== null 
                                                    ? (optIdx === q.correct_option_index ? "bg-green-50 border-green-500 text-green-900" : (userAnswers[q.id] === optIdx ? "bg-red-50 border-red-500 text-red-900" : "opacity-50"))
                                                    : (userAnswers[q.id] === optIdx ? "bg-indigo-50 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500" : "hover:bg-gray-50 border-gray-200")}`}
                                                disabled={score !== null}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span>{option}</span>
                                                    {score !== null && optIdx === q.correct_option_index && <CheckCircle className="w-5 h-5 text-green-600" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    {score !== null && <div className="mt-3 ml-9 p-3 bg-blue-50 text-blue-800 text-sm rounded border border-blue-100"><strong>Explanation:</strong> {q.explanation}</div>}
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end flex-shrink-0">
                            {score === null 
                                ? <button onClick={submitTest} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold shadow-sm transition">Submit</button>
                                : <button onClick={() => { setGeneratedRC(null); setShowSettings(true); setScore(null); }} className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-semibold transition">Next Article</button>
                            }
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}