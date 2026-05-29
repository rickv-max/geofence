import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { 
  MapPin, 
  Target, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Satellite, 
  Radio, 
  Map, 
  Search,
  Loader2,
  Crosshair,
  Hexagon,
  Info
} from 'lucide-react';

const SkeletonForm = () => (
  <div className="animate-pulse space-y-4 w-full">
    <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto mb-6"></div>
    <div className="h-14 bg-gray-100 border border-gray-200 rounded-xl w-full"></div>
    <div className="h-14 bg-gray-200 rounded-xl w-full mt-4"></div>
    <div className="space-y-2 mt-6">
      <div className="h-3 bg-gray-200 rounded w-full"></div>
      <div className="h-3 bg-gray-200 rounded w-5/6"></div>
    </div>
  </div>
);

export default function App() {
  const [appMode, setAppMode] = useState('setup');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  
  const [targetData, setTargetData] = useState(null); 
  const [location, setLocation] = useState(null);
  const [isInside, setIsInside] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('Inisialisasi GPS...');
  
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polygonLayerRef = useRef(null);
  const watchIdRef = useRef(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if(!query) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      // PERUBAHAN MAJOR: Ambil 10 hasil, bukan cuma 1 (limit=10)
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=10&addressdetails=1`;
      const response = await fetch(url, { headers: { 'Accept-Language': 'id' } });
      const data = await response.json();

      if (data && data.length > 0) {
        // ALGORITMA CERDAS: Cari hasil pertama yang MERUPAKAN POLIGON, abaikan hasil bertipe Point (Titik)
        const validPolygonResult = data.find(item => 
          item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')
        );

        if (validPolygonResult) {
          setTargetData(validPolygonResult);
          setAppMode('tracking'); 
        } else {
          setSearchError("Lokasi ditemukan, tapi satelit belum memiliki data 'Garis Batas' untuk area ini. Coba area di atasnya (misal: nama Kecamatan).");
        }
      } else {
        setSearchError("Wilayah tidak ditemukan. Tips: Coba kurangi kata (Misal cukup ketik: 'Ranuwurung, Lumajang' tanpa kecamatan).");
      }
    } catch (error) {
      setSearchError("Gagal terhubung ke satelit pemetaan. Periksa koneksi internet Anda.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (appMode === 'tracking' && mapContainerRef.current && !mapRef.current) {
      initMap();
      startLiveTracking();
    }
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [appMode]);

  const initMap = () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    mapRef.current = L.map(mapContainerRef.current, { 
      zoomControl: false,
      attributionControl: false 
    }).setView([-0.789275, 113.921327], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(mapRef.current);

    if (targetData && targetData.geojson) {
      const polygonStyle = {
        color: '#F9A11B', 
        weight: 3,
        opacity: 0.9,
        fillColor: '#005A9C', 
        fillOpacity: 0.15,
        dashArray: '6, 6'
      };

      polygonLayerRef.current = L.geoJSON(targetData.geojson, { style: polygonStyle }).addTo(mapRef.current);
      
      setTimeout(() => {
        if(mapRef.current && polygonLayerRef.current) {
          mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [30, 30] });
        }
      }, 100);
    }
  };

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Perangkat tidak mendukung GPS.");
      return;
    }

    setGpsStatus('Mencari satelit...');

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
      const currentPoint = turf.point([lng, lat]);
      const isPointInside = turf.booleanPointInPolygon(currentPoint, targetData.geojson);
      setIsInside(isPointInside);
    } catch (e) {
      console.error("Geofence calculation error:", e);
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
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        weight: 1
      }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(loc.acc);
    }
  };

  const centerToArea = () => {
    if(mapRef.current && polygonLayerRef.current) {
      mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [30, 30] });
    }
  };

  const centerToMe = () => {
    if(mapRef.current && location) {
      mapRef.current.setView([location.lat, location.lng], 17, { animate: true });
    }
  };

  const resetApp = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setAppMode('setup');
    setSearchQuery('');
    setTargetData(null);
    setLocation(null);
    setIsInside(null);
  };

  if (appMode === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#005A9C] to-[#003F6E] relative overflow-hidden select-none">
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-[#F9A11B]/20 rounded-full blur-3xl"></div>

        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#F0F6FA] rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#005A9C] shadow-inner border border-blue-50">
              <Map className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Geofence Batas Area</h1>
            <p className="text-sm text-gray-500 mt-2 font-medium">Tetapkan wilayah tugas Anda sebelum turun ke lapangan.</p>
          </div>

          {isSearching ? (
            <SkeletonForm />
          ) : (
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 ml-1">Nama Wilayah Tujuan</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Contoh: Ranuwurung, Lumajang"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C] focus:border-transparent transition-all placeholder-gray-400 text-sm font-medium"
                    required
                  />
                </div>
                
                {/* Tambahan Info UI yang Elegan */}
                <div className="flex items-start gap-2 mt-3 ml-1">
                   <Info className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                   <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                     Tips: Jika tidak ditemukan, persingkat nama. Cukup ketik <span className="font-bold text-gray-600">Nama Desa</span> koma <span className="font-bold text-gray-600">Nama Kabupaten</span>.
                   </p>
                </div>
              </div>
              
              {searchError && (
                <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl flex items-start gap-2 border border-red-100 shadow-sm mt-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="font-medium leading-relaxed">{searchError}</p>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full bg-[#005A9C] text-white font-bold py-3.5 rounded-xl shadow-[0_8px_20px_rgba(0,90,156,0.3)] hover:bg-[#003F6E] transition-all flex justify-center items-center gap-2 mt-4"
              >
                <Satellite className="w-5 h-5" /> Unduh Batas Wilayah
              </button>
            </form>
          )}
          
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Sistem Deteksi Offline BPS</p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = targetData?.address?.village || targetData?.address?.suburb || targetData?.address?.town || targetData?.name || "Wilayah Tugas";
  
  return (
    <div className="relative w-full h-screen bg-gray-100 overflow-hidden select-none">
      
      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .gps-marker-custom {
          width: 22px; height: 22px;
          background-color: #3b82f6;
          border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(0,0,0,0.3);
          position: relative;
        }
        .gps-marker-custom::after {
          content: ''; position: absolute;
          top: -50%; left: -50%;
          width: 200%; height: 200%;
          background-color: rgba(59, 130, 246, 0.4);
          border-radius: 50%;
          animation: gps-pulse 1.5s infinite ease-in-out;
        }
        @keyframes gps-pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0"></div>

      <div className="absolute inset-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between">
        <div className="p-4 pointer-events-auto">
          <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl p-3 flex items-center justify-between border border-white/50">
            <button 
              onClick={resetApp}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Ganti Wilayah"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-center flex-1 px-2 overflow-hidden">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Target Operasi</p>
              <h2 className="text-sm font-bold text-gray-800 truncate">{displayName}</h2>
            </div>
            <div className="w-10 h-10 flex items-center justify-center text-[#005A9C]">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-[240px] right-4 flex flex-col gap-3 pointer-events-auto">
          <button 
            onClick={centerToArea}
            className="w-12 h-12 bg-white rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] flex items-center justify-center text-[#F9A11B] hover:bg-gray-50 focus:outline-none"
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

        <div className="bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem] p-6 pointer-events-auto border-t border-gray-100 pb-8 mt-auto">
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
                 isInside === true ? 'Di Dalam Batas' : 
                 'Di Luar Batas'}
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
    </div>
  );
}



