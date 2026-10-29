import "leaflet/dist/leaflet.css";
import "./Mappicker.css";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet's default marker images when bundled with Vite
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

const INDIA_CENTER = [22.9734, 78.6569];
const NOMINATIM = "https://nominatim.openstreetmap.org";

// Turn a Nominatim result into our form fields
function toFields(result) {
  const a = result.address || {};
  const line = [a.house_number, a.building, a.road, a.neighbourhood || a.suburb || a.quarter]
    .filter(Boolean)
    .join(", ");
  return {
    address: line || result.display_name?.split(",").slice(0, 3).join(",").trim() || "",
    city: a.city || a.town || a.village || a.city_district || a.county || "",
    pincode: (a.postcode || "").replace(/\D/g, "").slice(0, 6),
    state: a.state || a.territory || "",
    full: result.display_name || "",
  };
}

/*
  <MapPicker open={showMap} onClose={() => setShowMap(false)} onPick={(fields) => ...} />
  onPick receives { address, city, pincode, state, lat, lng }
*/
export default function MapPicker({ open, onClose, onPick }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const lookupId = useRef(0);

  const [point, setPoint] = useState(null); // { lat, lng }
  const [found, setFound] = useState(null); // fields from reverse geocode
  const [status, setStatus] = useState("Search, tap the map, or use your current location.");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  /* Reverse geocode a point into an address */
  const lookup = async (lat, lng) => {
    const id = ++lookupId.current;
    setBusy(true);
    setStatus("Finding address…");
    try {
      const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (id !== lookupId.current) return; // a newer lookup started
      if (data.error) {
        setFound(null);
        setStatus("No address found here. Try a spot closer to a road.");
      } else {
        setFound(toFields(data));
        setStatus("Drag the pin to adjust, then tap “Use this address”.");
      }
    } catch {
      if (id === lookupId.current) setStatus("Couldn't load the address. Check your internet and try again.");
    } finally {
      if (id === lookupId.current) setBusy(false);
    }
  };

  /* Place or move the pin */
  const placePin = (lat, lng, zoom) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        setPoint({ lat: p.lat, lng: p.lng });
        lookup(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    map.setView([lat, lng], zoom ?? Math.max(map.getZoom(), 16));
    setPoint({ lat, lng });
    lookup(lat, lng);
  };

  /* Create the map when the dialog opens */
  useEffect(() => {
    if (!open || !mapEl.current) return;
    const map = L.map(mapEl.current).setView(INDIA_CENTER, 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (e) => placePin(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50); // the dialog was just shown

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      setPoint(null);
      setFound(null);
      setQuery("");
      setStatus("Search, tap the map, or use your current location.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Close with Esc */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Current location (GPS) */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Your browser doesn't support location. Search or tap the map instead.");
      return;
    }
    setBusy(true);
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => placePin(pos.coords.latitude, pos.coords.longitude, 17),
      (err) => {
        setBusy(false);
        setStatus(
          err.code === 1
            ? "Location permission was blocked. Allow it in your browser, or search instead."
            : "Couldn't get your location. Search or tap the map instead."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* Search an address or place */
  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setStatus("Searching…");
    try {
      const res = await fetch(`${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=in&accept-language=en&q=${encodeURIComponent(query)}`);
      const list = await res.json();
      if (!list.length) {
        setBusy(false);
        setStatus("No place found. Try a nearby area or landmark.");
        return;
      }
      placePin(Number(list[0].lat), Number(list[0].lon), 16);
    } catch {
      setBusy(false);
      setStatus("Search failed. Check your internet and try again.");
    }
  };

  const confirm = () => {
    if (!found || !point) return;
    onPick({ address: found.address, city: found.city, pincode: found.pincode, state: found.state, lat: point.lat, lng: point.lng });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="mp-overlay" onClick={onClose}>
      <section className="mp-dialog" role="dialog" aria-modal="true" aria-labelledby="mp-title" onClick={(e) => e.stopPropagation()}>
        <div className="mp-head">
          <h3 id="mp-title">Pick your address</h3>
          <button type="button" className="mp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="mp-search" onSubmit={search}>
          <input
            type="search"
            placeholder="Search area, landmark or pincode"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search location"
          />
          <button type="submit" disabled={busy}>Search</button>
        </form>

        <button type="button" className="mp-gps" onClick={useMyLocation} disabled={busy}>
          ◎ Use my current location
        </button>

        <div className="mp-map" ref={mapEl}></div>

        <p className="mp-status" role="status">{status}</p>

        {found && (
          <div className="mp-found">
            <strong>{found.address || "Address not found"}</strong>
            <span>{[found.city, found.state, found.pincode].filter(Boolean).join(", ")}</span>
          </div>
        )}

        <div className="mp-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={!found || busy}>
            Use this address
          </button>
        </div>
      </section>
    </div>
  );
}