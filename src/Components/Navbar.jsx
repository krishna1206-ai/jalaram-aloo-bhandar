import './Navbar.css'
function Navbar(){
    return(
        <>
           <header className="topbar">
            <a href="" className="brand">
                <span className="brand-mark">JA</span>
                <span className="brand-text">
                    <strong>Jalaram Aloo Bhandar</strong>
                    <small>COMMODITY MARKET</small>
                </span>
            </a>
            <a href="" className="login-link">Login</a>
           </header>
        </>
    )
}
export default Navbar;