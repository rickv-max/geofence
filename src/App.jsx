import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { 
  MapPin, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Satellite, 
  Radio, 
  Map as MapIcon, 
  Search,
  Loader2,
  Crosshair,
  Hexagon,
  Info,
  CircleDashed,
  X
} from 'lucide-react';

const SkeletonForm = () => (
  <div className="animate-pulse space-y-4 w-full">
    <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto mb-6"></div>
    <div className="h-14 bg-gray-100 border border-gray-200 rounded-xl w-full"></div>
    <div className="h-14 bg-gray-200 rounded-xl w-full mt-4"></div>
  </div>
);

export default function App() {
  const [appMode, setAppMode] = useState('setup'); // 'setup' | 'tracking'
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [searchError, setSearchError] = useState(null);
  
  const [targetData, setTargetData] = useState(null); 
  const [boundaryMode, setBoundaryMode] = useState('polygon'); 
  const [location, setLocation] = useState(null);
  const [isInside, setIsInside] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('Menunggu GPS...');
  
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const boundaryLayerRef = useRef(null);
  const watchIdRef = useRef(null);

  const RADIUS_ESTIMASI_METER = 2500; 

  // ==========================================
  // INISIALISASI PETA 1 KALI SAJA (ANTI-BLANK)
  // ==========================================
  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { 
        zoomControl: false,
        attributionControl: false 
      }).setView([-0.789275, 113.921327], 5); // Default zoom Indonesia

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.9 
      }).addTo(mapRef.current);
    }
  }, []); // Berjalan sekali saat aplikasi dimuat

  // ==========================================
  // AUTOCOMPLETE SEARCH
  // ==========================================
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        fetchSuggestions(searchQuery);
      } else {
        setSuggestions([]);
        setSearchError(null);
      }
    }, 600); 

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const fetchSuggestions = async (query) => {
    setIsTyping(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=id&format=json&polygon_geojson=1&limit=5&addressdetails=1`;
      const response = await fetch(url, { headers: { 'Accept-Language': 'id' } });
      const data = await response.json();

      if (data && data.length > 0) {
        setSuggestions(data);
      } else {
        setSuggestions([]);
        setSearchError("Lokasi tidak ditemukan. Coba perbaiki ejaan Anda.");
      }
    } catch (error) {
      setSearchError("Koneksi terputus. Periksa jaringan internet Anda.");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSelectLocation = (item) => {
    setSearchQuery(item.display_name); 
    setSuggestions([]); 
    
    if (item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')) {
      setBoundaryMode('polygon');
      setTargetData(item);
    } else if (item.geojson && item.geojson.type === 'Point') {
      setBoundaryMode('radius'); 
      setTargetData(item);
    } else {
      setSearchError("Data peta satelit korup untuk lokasi ini.");
      return;
    }
    
    // Pindah Mode akan mentrigger transisi CSS
    setAppMode('tracking');
  };

  // ==========================================
  // GAMBAR GEOFENCE & MULAI TRACKING
  // ==========================================
  useEffect(() => {
    if (appMode === 'tracking' && targetData && mapRef.current) {
      // 1. Bersihkan Geofence lama jika ada
      if (boundaryLayerRef.current) {
        mapRef.current.removeLayer(boundaryLayerRef.current);
      }

      // 2. Gambar Geofence baru
      if (boundaryMode === 'polygon') {
        const polygonStyle = {
          color: '#E11D48', 
          weight: 4,
          opacity: 1,
          fillColor: '#005A9C', 
          fillOpacity: 0.15,
          dashArray: '8, 6'
        };
        boundaryLayerRef.current = L.geoJSON(targetData.geojson, { style: polygonStyle }).addTo(mapRef.current);
        
        setTimeout(() => {
            if(mapRef.current && boundaryLayerRef.current) {
                mapRef.current.fitBounds(boundaryLayerRef.current.getBounds(), { padding: [40, 40] });
            }
        }, 300);

      } else if (boundaryMode === 'radius') {
        const latLng = [parseFloat(targetData.lat), parseFloat(targetData.lon)];
        
        const circle = L.circle(latLng, {
          color: '#E11D48',
          weight: 3,
          opacity: 0.9,
          fillColor: '#005A9C',
          fillOpacity: 0.1,
          dashArray: '8, 8',
          radius: RADIUS_ESTIMASI_METER
        });
        
        const centerMarker = L.marker(latLng, {
          icon: L.divIcon({
            className: 'bg-transparent',
            html: '<div class="w-4 h-4 bg-rose-600 rounded-full border-2 border-white shadow-md mx-auto mt-[-8px] ml-[-8px]"></div>',
          })
        });

        // Group menjadi 1 layer agar mudah dihapus nanti
        boundaryLayerRef.current = L.layerGroup([circle, centerMarker]).addTo(mapRef.current);
        
        setTimeout(() => {
            if(mapRef.current && circle) {
                mapRef.current.fitBounds(circle.getBounds(), { padding: [40, 40] });
            }
        }, 300);
      }

      // 3. Mulai Sensor GPS
      startLiveTracking();
    }
  }, [targetData, appMode]);

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus("GPS Tidak Didukung.");
      return;
    }

    setGpsStatus('Mencari satelit...');
    
    // Pastikan tidak double-watch
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newLocation = { lat: latitude, lng: longitude, acc: accuracy };
        setLocation(newLocation);
        
        if (accuracy <= 15) setGpsStatus('Akurasi Tinggi');
        else if (accuracy <= 50) setGpsStatus('Akurasi Sedang');
        else setGpsStatus('Akurasi Lemah');

        updateMapMarker(newLocation);
        checkGeofence(latitude, longitude);
      },
      (error) => {
        setGpsStatus('GPS Ditolak/Hilang');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  };

  const checkGeofence = (lat, lng) => {
    if (!targetData || !targetData.geojson) return;

    try {
      // PENTING: Gunakan parseFloat agar Turf tidak crash
      const currentPoint = turf.point([lng, lat]);
      
      if (boundaryMode === 'polygon') {
        const isPointInside = turf.booleanPointInPolygon(currentPoint, targetData.geojson);
        setIsInside(isPointInside);
      } else {
        const targetLon = parseFloat(targetData.lon);
        const targetLat = parseFloat(targetData.lat);
        const centerPoint = turf.point([targetLon, targetLat]);
        
        const distanceKm = turf.distance(centerPoint, currentPoint, { units: 'kilometers' });
        setIsInside(distanceKm <= (RADIUS_ESTIMASI_METER / 1000));
      }
    } catch (e) {
      console.error("Geofence perhitungan error (Abaikan jika GPS baru lock):", e);
    }
  };

  const updateMapMarker = (loc) => {
    if (!mapRef.current) return;
    const latLng = [loc.lat, loc.lng];

    const customIcon = L.divIcon({
      className: 'custom-gps-icon',
      html: '<div class="gps-marker-custom"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: customIcon }).addTo(mapRef.current);
      accuracyCircleRef.current = L.circle(latLng, {
        radius: loc.acc,
        color: '#2563EB',
        fillColor: '#2563EB',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(loc.acc);
    }
  };

  const centerToArea = () => {
    if(mapRef.current && boundaryLayerRef.current) {
        // Handle Polygon vs LayerGroup (Radius) Bounds
        const bounds = boundaryLayerRef.current.getBounds ? boundaryLayerRef.current.getBounds() : null;
        if(bounds) mapRef.current.fitBounds(bounds, { padding: [30, 30] });
    }
  };

  const centerToMe = () => {
    if(mapRef.current && location) {
      mapRef.current.setView([location.lat, location.lng], 17, { animate: true });
    }
  };

  const resetApp = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (boundaryLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(boundaryLayerRef.current);
        boundaryLayerRef.current = null;
    }
    if (markerRef.current && mapRef.current) {
        mapRef.current.removeLayer(markerRef.current);
        mapRef.current.removeLayer(accuracyCircleRef.current);
        markerRef.current = null;
        accuracyCircleRef.current = null;
    }
    
    setAppMode('setup');
    setSearchQuery('');
    setSuggestions([]);
    setTargetData(null);
    setLocation(null);
    setIsInside(null);
    setSearchError(null);
  };

  // Nama Display
  const displayName = targetData?.name || targetData?.display_name?.split(',')[0] || "Wilayah Tugas";
  const parentArea = targetData?.display_name?.split(', ')[1] || "";

  return (
    <div className="relative w-full h-screen bg-[#e5e5e5] overflow-hidden select-none">
      
      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .leaflet-tile-pane { filter: brightness(0.95) contrast(1.1); } 
        
        .gps-marker-custom {
          width: 24px; height: 24px;
          background-color: #2563EB;
          border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(0,0,0,0.4);
          position: relative;
        }
        .gps-marker-custom::after {
          content: ''; position: absolute;
          top: -50%; left: -50%;
          width: 200%; height: 200%;
          background-color: rgba(37, 99, 235, 0.4);
          border-radius: 50%;
          animation: gps-pulse 1.5s infinite ease-in-out;
        }
        @keyframes gps-pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      {/* MAP LAYER: SELALU DI RENDER DI BAWAH (Z-INDEX: 0) */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0"></div>

      {/* OVERLAY 1: UI TRACKING PETA (Z-INDEX: 10) */}
      <div className={`absolute inset-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between transition-opacity duration-700 ${appMode === 'tracking' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="p-4 pointer-events-auto mt-2">
          <div className="bg-white/95 backdrop-blur-md shadow-sm rounded-2xl p-3 flex items-center justify-between border border-white/50">
            <button 
              onClick={resetApp}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Ganti Wilayah"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-center flex-1 px-2 overflow-hidden">
              <h2 className="text-[15px] font-bold text-gray-800 truncate">{displayName}</h2>
              {parentArea && <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{parentArea}</p>}
            </div>
            <div className="w-10 h-10 flex items-center justify-center text-[#005A9C]">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
          
          {boundaryMode === 'radius' && appMode === 'tracking' && (
            <div className="mx-auto mt-2 bg-yellow-100/95 backdrop-blur-sm border border-yellow-200 text-yellow-800 text-[10px] font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-sm absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
               <CircleDashed className="w-3 h-3" /> Area Estimasi (Radius 2.5 KM)
            </div>
          )}
        </div>

        <div className="absolute bottom-[240px] right-4 flex flex-col gap-3 pointer-events-auto">
          <button 
            onClick={centerToArea}
            className="w-12 h-12 bg-white rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] flex items-center justify-center text-[#E11D48] hover:bg-gray-50 focus:outline-none"
            title="Lihat Seluruh Area Target"
          >
            <Hexagon className="w-6 h-6" />
          </button>
          <button 
            onClick={centerToMe}
            className="w-12 h-12 bg-[#005A9C] rounded-full shadow-[0_8px_20px_rgba(0,90,156,0.3)] flex items-center justify-center text-white hover:bg-[#003F6E] focus:outline-none"
            title="Fokus Lokasi Saya"
          >
            <Crosshair className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem] p-6 pointer-events-auto border-t border-gray-100 pb-8 mt-auto transform transition-transform duration-700 ease-out translate-y-0">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5"></div>

          <div className={`p-4 rounded-2xl flex items-center gap-4 transition-colors duration-500 shadow-sm border ${
            isInside === null ? 'bg-gray-50 border-gray-100' :
            isInside === true ? 'bg-emerald-50 border-emerald-100' : 
            'bg-red-50 border-red-100'
          }`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-inner shrink-0 ${
              isInside === null ? 'bg-gray-100 text-gray-400' :
              isInside === true ? 'bg-emerald-100 text-emerald-600' : 
              'bg-red-100 text-red-600'
            }`}>
              {isInside === null ? <Loader2 className="w-7 h-7 animate-spin" /> :
               isInside === true ? <CheckCircle2 className="w-7 h-7" /> : 
               <AlertTriangle className="w-7 h-7" />}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5 text-gray-500">
                Status Koordinat
              </p>
              <h3 className={`text-[19px] font-bold leading-tight ${
                isInside === null ? 'text-gray-700' :
                isInside === true ? 'text-emerald-700' : 
                'text-red-700'
              }`}>
                {isInside === null ? 'Menghitung...' : 
                 isInside === true ? (boundaryMode === 'radius' ? 'Di Dalam Estimasi' : 'Di Dalam Batas') : 
                 'Di Luar Area'}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Akurasi GPS</span>
              </div>
              <span className="text-xs text-gray-800 font-medium">
                {location ? `± ${Math.round(location.acc)} meter` : 'Menunggu...'}
              </span>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                <Radio className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Sistem</span>
              </div>
              <span className="text-xs text-gray-800 font-medium truncate block" title={gpsStatus}>
                {gpsStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* OVERLAY 2: UI SETUP / SEARCH (Z-INDEX: 50) */}
      <div className={`absolute inset-0 z-50 flex items-center justify-center p-6 bg-gradient-to-br from-[#005A9C] to-[#003F6E] transition-opacity duration-700 ease-in-out ${appMode === 'setup' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        {/* Dekorasi Background */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-[#F9A11B]/20 rounded-full blur-3xl"></div>

        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-8 relative z-10 flex flex-col min-h-[450px]">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#F0F6FA] rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#005A9C] shadow-inner border border-blue-50">
              <MapIcon className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Geofence Wilayah</h1>
            <p className="text-sm text-gray-500 mt-2 font-medium">Ketik nama desa atau kecamatan untuk mencari.</p>
          </div>

          <div className="relative flex-1">
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 ml-1">Cari Wilayah (Live)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Search className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Contoh: Ranuwurung"
                className="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C] focus:border-transparent transition-all placeholder-gray-400 text-sm font-medium"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                {isTyping ? (
                  <Loader2 className="w-5 h-5 text-[#005A9C] animate-spin" />
                ) : searchQuery ? (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    <X className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
            </div>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] max-h-60 overflow-y-auto overflow-x-hidden divide-y divide-gray-50">
                {suggestions.map((item, index) => {
                  const parts = item.display_name.split(', ');
                  const mainName = parts[0];
                  const subName = parts.slice(1, 4).join(', '); 

                  return (
                    <li 
                      key={item.place_id || index} 
                      onClick={() => handleSelectLocation(item)}
                      className="p-3.5 hover:bg-blue-50 cursor-pointer transition-colors flex items-start gap-3 group"
                    >
                      <MapPin className="w-5 h-5 text-gray-400 group-hover:text-[#005A9C] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-gray-800 group-hover:text-[#005A9C]">{mainName}</h4>
                        <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">{subName}</p>
                        
                        <span className={`inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider ${
                          (item.geojson && item.geojson.type.includes('Polygon')) 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {(item.geojson && item.geojson.type.includes('Polygon')) ? 'Peta Batas Tersedia' : 'Hanya Estimasi Titik'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            
            {searchError && !isTyping && (
              <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl flex items-start gap-2 border border-red-100 shadow-sm mt-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="font-medium leading-relaxed">{searchError}</p>
              </div>
            )}
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Database Peta: OpenStreetMap</p>
          </div>
        </div>
      </div>
      
    </div>
  );
}

