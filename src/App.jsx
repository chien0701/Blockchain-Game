import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import SystemBar from './components/SystemBar';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';

const Lobby      = lazy(() => import('./pages/Lobby'));
const Game       = lazy(() => import('./pages/Game'));
const Verifier   = lazy(() => import('./pages/Verifier'));
const Docs       = lazy(() => import('./pages/Docs'));
const Stats      = lazy(() => import('./pages/Stats'));
const Dice       = lazy(() => import('./pages/games/Dice'));
const Roulette   = lazy(() => import('./pages/games/Roulette'));
const Slots      = lazy(() => import('./pages/games/Slots'));
const Mastermind = lazy(() => import('./pages/games/Mastermind'));
const Mining     = lazy(() => import('./pages/games/Mining'));
const Crash      = lazy(() => import('./pages/games/Crash'));
const Limbo      = lazy(() => import('./pages/games/Limbo'));
const Wheel      = lazy(() => import('./pages/games/Wheel'));
const Plinko     = lazy(() => import('./pages/games/Plinko'));
const Revolver   = lazy(() => import('./pages/games/Revolver'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="flex gap-2">{[0,1,2].map(i => <div key={i} className="dot w-3 h-3 bg-electric-500 rounded-full" />)}</div>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <div className="flex flex-col min-h-screen bg-ink-950">
        <SystemBar />
        <Navbar />
        <main className="flex-1 bg-grid">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"               element={<Home />} />
              <Route path="/lobby"          element={<Lobby />} />
              <Route path="/game/:id"       element={<Game />} />
              <Route path="/verifier"       element={<Verifier />} />
              <Route path="/docs"           element={<Docs />} />
              <Route path="/stats"          element={<Stats />} />
              <Route path="/play/dice"      element={<Dice />} />
              <Route path="/play/roulette"  element={<Roulette />} />
              <Route path="/play/slots"     element={<Slots />} />
              <Route path="/play/mastermind" element={<Mastermind />} />
              <Route path="/play/mining"    element={<Mining />} />
              <Route path="/play/crash"     element={<Crash />} />
              <Route path="/play/limbo"     element={<Limbo />} />
              <Route path="/play/wheel"     element={<Wheel />} />
              <Route path="/play/plinko"    element={<Plinko />} />
              <Route path="/play/revolver"  element={<Revolver />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
    </WalletProvider>
  );
}