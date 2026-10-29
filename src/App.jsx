import { Routes, Route } from "react-router-dom";
import Hero from "./Components/Hero";
import Watchlist from "./Components/Watchlist";
import Login from "./Pages/Login";
import Navbar from "./Components/Navbar";
import Register from "./Pages/Register";
import Terms from "./Pages/Terms";
import Explore from "./Pages/Explore";
import Account from "./Pages/Account";
import Admin from "./Pages/Admin";
import AdminLogin from "./Pages/AdminLogin";

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
          <Route path="/terms" element={<Terms />} />
          <Route path="/explore" element={<Explore />} />
          
          <Route path="/account" element={<Account />} />
          <Route path="/admin/login" element={<AdminLogin />} />
<Route path="/admin" element={<Admin />} />
          
      </Routes>

    </>
  );
}