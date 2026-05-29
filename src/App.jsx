import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { 
  MapPin, 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  ArrowLeft, 
  Radio, 
  Map as MapIcon, 
  Search,
  Loader,
  Crosshair,
  Hexagon,
  Wifi,
  Save,
  Navigation,
  X
} from 'lucide-react';

export default function App() {
  // ==========================================
  // SAFE OFFLINE STORAGE
  // ==========================================
  const loadSavedData = () => {
    try {
      const saved = localStorage.getItem('bps_geofence_data_v2');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  };

  const initialData = loadSavedData();
  
  // STATES
  const [appMode, setAppMode] = useState(initialData ? 'tracking' : 'setup'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  
  const [targetData, setTargetData] = useState(initialData); 
  const [location, setLocation] = useState(null);
  const [isInside, setIsInside] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('Menunggu Sinyal...');
  
  // REFS
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const boundaryLayerRef = useRef(null);
  const watchIdRef = useRef(null);

  // ==========================================
  // 1. INISIALISASI PETA (HANYA 1 KALI, ANTI-BLANK)
  // ==========================================
  useEffect(() => {
    // Peta di-render secara diam-diam di background sejak awal aplikasi dibuka
    if (!mapRef.current && mapContainerRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { 
        zoomControl: false,
        attributionControl: false 
      }).setView([-0.789275, 113.921327], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    // Monitor Jaringan
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ==========================================
  // 2. LIVE SEARCH YANG DIJAMIN AMAN DARI CRASH
  // ==========================================
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const query = (searchQuery || '').trim();
      if (query.length >= 3) {
        if(!isOfflineMode) {
          fetchSuggestions(query);
        } else {
          setSearchError("Anda sedang Offline. Sambungkan internet untuk mencari wilayah.");
        }
      } else {
        setSuggestions([]);
        setSearchError(null);
      }
    }, 600); 

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isOfflineMode]);

  const fetchSuggestions = async (query) => {
    setIsTyping(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=id&format=json&polygon_geojson=1&limit=8&addressdetails=1`;
      const response = await fetch(url, { headers: { 'Accept-Language': 'id' } });
      
      if (!response.ok) throw new Error("Server Error");
      
      const data = await response.json();

      if (data && Array.isArray(data) && data.length > 0) {
        const validPolygons = data.filter(item => 
          item?.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')
        );

        if (validPolygons.length > 0) {
          setSuggestions(validPolygons);
        } else {
          setSearchError("Batas Polygon untuk area ini belum dipetakan. Coba area yang lebih luas (Misal: Kecamatan).");
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
        setSearchError("Wilayah tidak ditemukan.");
      }
    } catch (error) {
      setSearchError("Koneksi terganggu atau Server sibuk.");
      setSuggestions([]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSelectLocation = (item) => {
    // Pengaman optional chaining
    const namaLokasi = item?.display_name || 'Wilayah Terpilih';
    
    setSearchQuery(namaLokasi); 
    setSuggestions([]); 
    
    // Simpan ke offline storage
    try {
      localStorage.setItem('bps_geofence_data_v2', JSON.stringify(item));
    } catch(e) { console.warn("Local storage penuh/diblokir"); }
    
    setTargetData(item);
    setAppMode('tracking');
  };

  // ==========================================
  // 3. LOGIKA TRACKING & GEOFENCE 
  // ==========================================
  useEffect(() => {
    if (appMode === 'tracking' && targetData && mapRef.current) {
      // Hapus layer lama
      if (boundaryLayerRef.current) {
        mapRef.current.removeLayer(boundaryLayerRef.current);
      }

      // Gambar Polygon Merah BPS
      if (targetData.geojson) {
        const polygonStyle = {
          color: '#DC2626', 
          weight: 3,
          opacity: 0.9,
          fillColor: '#DC2626', 
          fillOpacity: 0.08, 
          dashArray: '5, 8'
        };
        
        boundaryLayerRef.current = L.geoJSON(targetData.geojson, { style: polygonStyle }).addTo(mapRef.current);
        
        // Animasi terbang halus
        setTimeout(() => {
            if(mapRef.current && boundaryLayerRef.current) {
                mapRef.current.fitBounds(boundaryLayerRef.current.getBounds(), { padding: [30, 30] });
            }
        }, 100);
      }

      startLiveTracking();
    }
    
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [appMode, targetData]);

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Perangkat tidak mendukung GPS.");
      return;
    }

    setGpsStatus('Menghubungkan ke GPS...');

    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newLocation = { lat: latitude, lng: longitude, acc: accuracy };
        setLocation(newLocation);
        
        if (accuracy <= 20) setGpsStatus('Akurasi Tinggi (Lock)');
        else if (accuracy <= 80) setGpsStatus('Akurasi Sedang');
        else setGpsStatus('Akurasi Lemah (Cari ruang terbuka)');

        updateMapMarker(newLocation);
        checkGeofence(latitude, longitude);
      },
      (error) => {
        setIsInside(null); 
        setLocation(null);
        if(error.code === error.PERMISSION_DENIED) {
          setGpsStatus('Akses GPS Ditolak!');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsStatus('Sinyal GPS Hilang.');
        } else {
          setGpsStatus('Gagal membaca GPS (Timeout).');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const checkGeofence = (lat, lng) => {
    if (!targetData || !targetData.geojson) return;

    try {
      const currentPoint = turf.point([lng, lat]);
      const isPointInside = turf.booleanPointInPolygon(currentPoint, targetData.geojson);
      setIsInside(isPointInside);
    } catch (e) {
      console.error("Geofence Error:", e);
    }
  };

  const updateMapMarker = (loc) => {
    if (!mapRef.current) return;
    const latLng = [loc.lat, loc.lng];

    const customIcon = L.divIcon({
      className: 'custom-gps-icon',
      html: '<div class="gps-marker-realtime"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
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
        mapRef.current.fitBounds(boundaryLayerRef.current.getBounds(), { padding: [30, 30] });
    }
  };

  const centerToMe = () => {
    if(mapRef.current && location) {
      mapRef.current.setView([location.lat, location.lng], 18, { animate: true }); 
    }
  };

  const resetApp = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    setAppMode('setup');
    setSearchQuery('');
    setSuggestions([]);
  };

  const deleteOfflineData = () => {
    localStorage.removeItem('bps_geofence_data_v2');
    setTargetData(null);
    setSearchQuery('');
  };

  // Safe Parsing untuk Display Nama
  const rawDisplayName = targetData?.name || targetData?.display_name || "Wilayah Tugas";
  const displayParts = rawDisplayName.split(',');
  const mainDisplayName = displayParts[0] || "Wilayah";
  const parentAreaName = displayParts[1] ? displayParts[1].trim() : "";
  
  const isGpsLocked = location !== null;
  const showLoading = !isGpsLocked && isInside === null;

  // ==========================================
  // RENDER (SINGLE DOM ARCHITECTURE)
  // ==========================================
  return (
    <div className="relative w-full h-screen bg-[#e5e5e5] overflow-hidden select-none">
      
      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .leaflet-tile-pane { filter: brightness(0.97) contrast(1.05); } 
        .leaflet-container { background-color: #f3f4f6 !important; background-image: radial-gradient(#d1d5db 1px, transparent 1px); background-size: 20px 20px; }
        
        .gps-marker-realtime {
          width: 20px; height: 20px;
          background-color: #2563EB;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
          position: relative;
        }
        .gps-marker-realtime::after {
          content: ''; position: absolute;
          top: -50%; left: -50%;
          width: 200%; height: 200%;
          background-color: rgba(37, 99, 235, 0.4);
          border-radius: 50%;
          animation: real-pulse 1.5s infinite ease-in-out;
        }
        @keyframes real-pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      {/* LAYER 1: PETA BACKGROUND SELALU HIDUP */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0"></div>

      {/* LAYER 2: OVERLAY TRACKING (PETA INTERAKTIF) */}
      <div className={`absolute inset-0 w-full h-full flex flex-col justify-between transition-opacity duration-700 ease-in-out ${appMode === 'tracking' ? 'z-10 opacity-100 pointer-events-none' : 'z-[-1] opacity-0 pointer-events-none'}`}>
        
        <div className="p-4 pointer-events-auto mt-2">
          <div className="bg-white/95 backdrop-blur-md shadow-sm rounded-2xl p-3 flex items-center justify-between border border-white/50">
            <button onClick={resetApp} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-center flex-1 px-2 overflow-hidden">
              <h2 className="text-[15px] font-bold text-gray-800 truncate">{mainDisplayName}</h2>
              {parentAreaName && <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{parentAreaName}</p>}
            </div>
            <div className="w-10 h-10 flex items-center justify-center text-[#005A9C]">
              <Shield className="w-6 h-6" />
            </div>
          </div>
          
          {isOfflineMode && (
            <div className="mx-auto mt-2 bg-gray-800/90 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-md absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
               <Save className="w-3 h-3 text-emerald-400" /> Mode Peta Offline Aktif
            </div>
          )}
        </div>

        <div className="absolute bottom-[240px] right-4 flex flex-col gap-3 pointer-events-auto">
          <button onClick={centerToArea} className="w-12 h-12 bg-white rounded-full shadow-[0_10px_30px_-10px_rgba(0,0,0,0.3)] flex items-center justify-center text-[#DC2626] hover:bg-gray-50 focus:outline-none">
            <Hexagon className="w-6 h-6" />
          </button>
          <button onClick={centerToMe} className="w-12 h-12 bg-[#005A9C] rounded-full shadow-[0_8px_20px_rgba(0,90,156,0.3)] flex items-center justify-center text-white hover:bg-[#003F6E] focus:outline-none">
            <Crosshair className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[2rem] p-6 pointer-events-auto border-t border-gray-100 pb-8 mt-auto">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5"></div>

          <div className={`p-4 rounded-2xl flex items-center gap-4 transition-colors duration-300 shadow-sm border ${
            showLoading ? 'bg-gray-50 border-gray-100' :
            !isGpsLocked ? 'bg-orange-50 border-orange-100' : 
            isInside === true ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
          }`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-inner shrink-0 ${
              showLoading ? 'bg-gray-100 text-gray-400' :
              !isGpsLocked ? 'bg-orange-100 text-orange-600' :
              isInside === true ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
            }`}>
              {showLoading ? <Loader className="w-7 h-7 animate-spin" /> :
               !isGpsLocked ? <AlertTriangle className="w-7 h-7" /> :
               isInside === true ? <CheckCircle className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5 text-gray-500">Status Koordinat Realtime</p>
              <h3 className={`text-[18px] font-bold leading-tight ${
                showLoading ? 'text-gray-700' : !isGpsLocked ? 'text-orange-700' :
                isInside === true ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {showLoading ? 'Menunggu Lokasi...' : 
                 !isGpsLocked ? 'Lokasi Belum Ditemukan' :
                 isInside === true ? 'Posisi DI DALAM Batas' : 'Posisi DI LUAR Batas'}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Akurasi GPS</span>
              </div>
              <span className={`text-xs font-bold ${!location ? 'text-red-500' : 'text-gray-800'}`}>
                {location ? `± ${Math.round(location.acc)} meter` : 'Belum Ada'}
              </span>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                <Radio className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Info Sistem</span>
              </div>
              <span className={`text-xs font-bold truncate block ${gpsStatus.includes('Ditolak') || gpsStatus.includes('Hilang') ? 'text-red-500' : 'text-gray-800'}`} title={gpsStatus}>
                {gpsStatus}
              </span>
            </div>
          </div>
          
          {(!isGpsLocked && !showLoading) && (
              <button onClick={startLiveTracking} className="mt-4 w-full bg-orange-100 text-orange-700 hover:bg-orange-200 py-2.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                <Radio className="w-4 h-4" /> Hubungkan Ulang GPS
              </button>
          )}
        </div>
      </div>

      {/* LAYER 3: OVERLAY SETUP / PENCARIAN */}
      <div className={`absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-br from-[#005A9C] to-[#003F6E] transition-opacity duration-700 ease-in-out ${appMode === 'setup' ? 'z-50 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}>
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-[#F9A11B]/20 rounded-full blur-3xl"></div>

        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-7 relative z-10 flex flex-col min-h-[480px]">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-[#F0F6FA] rounded-2xl flex items-center justify-center mx-auto mb-3 text-[#005A9C] border border-blue-50">
              <MapIcon className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Geofence Offline BPS</h1>
            <p className="text-[13px] text-gray-500 mt-1 font-medium">Cari dan simpan batas wilayah ke HP Anda.</p>
          </div>

          {isOfflineMode && (
             <div className="bg-yellow-50 text-yellow-700 text-xs p-3 rounded-xl flex items-center gap-2 border border-yellow-200 shadow-sm mb-4">
               <Wifi className="w-4 h-4" />
               <span className="font-bold">HP Anda sedang Offline.</span>
             </div>
          )}

          {targetData && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-[#005A9C] mb-2">
                  <Save className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Tersimpan di Perangkat</span>
                </div>
                <button onClick={deleteOfflineData} className="text-gray-400 hover:text-red-500 text-xs font-bold underline">Hapus</button>
              </div>
              <h3 className="font-bold text-gray-800 text-sm leading-tight mb-3 line-clamp-2">
                {rawDisplayName}
              </h3>
              <button 
                onClick={() => setAppMode('tracking')}
                className="w-full bg-[#005A9C] text-white text-sm font-bold py-2.5 rounded-lg shadow-md hover:bg-[#003F6E] transition-all flex justify-center items-center gap-2"
              >
                <Navigation className="w-4 h-4" /> Buka Peta Offline
              </button>
            </div>
          )}

          <div className="relative flex-1">
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 ml-1">Cari Wilayah Baru</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Search className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Misal: Randuagung, Lumajang"
                disabled={isOfflineMode}
                className="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C] disabled:bg-gray-100 disabled:text-gray-400 transition-all text-sm font-medium"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                {isTyping ? (
                  <Loader className="w-5 h-5 text-[#005A9C] animate-spin" />
                ) : searchQuery ? (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    <X className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
            </div>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] max-h-56 overflow-y-auto divide-y divide-gray-50">
                {suggestions.map((item, index) => {
                  const safeName = item?.display_name || item?.name || "Wilayah";
                  const parts = safeName.split(',');
                  const mainName = parts[0] || "Wilayah Tidak Diketahui";
                  const subName = parts.slice(1, 4).join(', ') || ""; 

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
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">
                          <CheckCircle className="w-3 h-3" /> Area Akurat (Poligon)
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            
            {searchError && !isTyping && (
              <div className="bg-red-50 text-red-600 text-[11px] p-3 rounded-xl flex items-start gap-2 border border-red-100 shadow-sm mt-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="font-medium leading-relaxed">{searchError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

