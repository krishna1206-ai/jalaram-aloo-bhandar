import { Routes, Route } from "react-router-dom";
import Hero from "./Components/Hero";
import Watchlist from "./Components/Watchlist";
import Login from "./Pages/Login";
import Navbar from "./Components/Navbar";
import Register from "./Pages/Register";

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
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
         <Route path="/register" element={<Register />} />
      </Routes>

    </>
  );
}