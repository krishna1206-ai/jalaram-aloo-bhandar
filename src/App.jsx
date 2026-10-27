import { Routes, Route } from "react-router-dom";
import Hero from "./components/Hero";
import Watchlist from "./components/Watchlist";
import Login from "./Pages/Login";


function Home() {
  return (
    <>
      <Hero />
      <Watchlist />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}