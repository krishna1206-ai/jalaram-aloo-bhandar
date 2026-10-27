import { Routes, Route } from "react-router-dom";
import Hero from "./Components/Hero";
import Watchlist from "./Components/Watchlist";
import Login from "./Pages/Login";
import Navbar from "./Components/Navbar";

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
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </>
  );
}