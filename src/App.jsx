import { Routes, Route } from "react-router-dom";
import Hero from "./components/Hero";
import Watchlist from "./components/Watchlist";
import Login from "./Pages/Login";
import Navbar from "./Components/Navbar";


function Home() {
  return (
    <>
    <Navbar/>
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