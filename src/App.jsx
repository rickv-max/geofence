<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>GeoBatas Pro - BPS Geofencing System</title>

    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        bps: {
                            blue: '#005A9C',
                            blueDark: '#003F6E',
                            orange: '#F9A11B',
                            orangeLight: '#FFF3E0',
                            light: '#F0F6FA'
                        }
                    },
                    boxShadow: {
                        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.05)',
                        'float': '0 10px 40px -10px rgba(0,0,0,0.15)'
                    }
                }
            }
        }
    </script>

    <!-- React & ReactDOM -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Babel for JSX -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <!-- Leaflet JS & CSS for Mapping -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <!-- Turf.js for Offline Geofencing (Point in Polygon Calculation) -->
    <script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>

    <!-- FontAwesome for Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Google Fonts: Inter -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            overflow: hidden; 
            background-color: #f8fafc;
            -webkit-tap-highlight-color: transparent;
        }
        #map-container {
            height: 100vh;
            width: 100vw;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
        }
        .ui-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none; 
            z-index: 10;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .pointer-events-auto {
            pointer-events: auto;
        }
        .leaflet-control-attribution {
            display: none !important;
        }
        /* Custom pulsing dot for GPS marker */
        .gps-marker {
            width: 22px;
            height: 22px;
            background-color: #3b82f6;
            border: 4px solid white;
            border-radius: 50%;
            box-shadow: 0 0 15px rgba(0,0,0,0.3);
        }
        .gps-marker::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background-color: rgba(59, 130, 246, 0.4);
            border-radius: 50%;
            animation: pulse 1.5s infinite ease-in-out;
        }
        @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(1.5); opacity: 0; }
        }
        
        /* Smooth transitions */
        .fade-enter { opacity: 0; transform: translateY(10px); }
        .fade-enter-active { opacity: 1; transform: translateY(0); transition: opacity 300ms, transform 300ms; }
        .fade-exit { opacity: 1; }
        .fade-exit-active { opacity: 0; transition: opacity 300ms; }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

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

        const App = () => {
            // App States
            const [appMode, setAppMode] = useState('setup'); // 'setup' | 'tracking'
            const [searchQuery, setSearchQuery] = useState('');
            const [isSearching, setIsSearching] = useState(false);
            const [searchError, setSearchError] = useState(null);
            
            // Geographic Data States
            const [targetData, setTargetData] = useState(null); // Data wilayah dari API
            const [location, setLocation] = useState(null);
            const [isInside, setIsInside] = useState(null); // true = didalam batas, false = diluar
            const [gpsStatus, setGpsStatus] = useState('Inisialisasi GPS...');
            
            // Refs
            const mapRef = useRef(null);
            const markerRef = useRef(null);
            const accuracyCircleRef = useRef(null);
            const polygonLayerRef = useRef(null);
            const watchIdRef = useRef(null);

            // ==========================================
            // PHASE 1: SETUP & SEARCH TARGET AREA
            // ==========================================
            const handleSearch = async (e) => {
                e.preventDefault();
                if(!searchQuery.trim()) return;

                setIsSearching(true);
                setSearchError(null);

                try {
                    // Fetch boundary using Nominatim API (polygon_geojson=1 is the secret sauce)
                    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&polygon_geojson=1&limit=1&addressdetails=1`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data && data.length > 0) {
                        const result = data[0];
                        
                        // Validate if OpenStreetMap has the Polygon data for this area
                        if (result.geojson && (result.geojson.type === 'Polygon' || result.geojson.type === 'MultiPolygon')) {
                            setTargetData(result);
                            setAppMode('tracking'); // Switch UI to map mode
                        } else {
                            setSearchError("Peta batas (Poligon) untuk wilayah ini belum tersedia di database OpenStreetMap. Coba wilayah di tingkat lebih tinggi (Kecamatan/Kabupaten).");
                        }
                    } else {
                        setSearchError("Wilayah tidak ditemukan. Pastikan ejaan benar (Contoh: Ranuwurung, Randuagung, Lumajang).");
                    }
                } catch (error) {
                    setSearchError("Gagal terhubung ke server peta. Periksa koneksi internet Anda.");
                } finally {
                    setIsSearching(false);
                }
            };


            // ==========================================
            // PHASE 2: INITIALIZE MAP & TRACKING
            // ==========================================
            useEffect(() => {
                if (appMode === 'tracking' && !mapRef.current) {
                    initMap();
                    startLiveTracking();
                }

                return () => {
                    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
                };
            }, [appMode]);

            const initMap = () => {
                mapRef.current = L.map('map-container', { 
                    zoomControl: false,
                    attributionControl: false 
                }).setView([-0.789275, 113.921327], 5);

                // Premium Base Map
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 19
                }).addTo(mapRef.current);

                // Draw Target Boundary
                if (targetData && targetData.geojson) {
                    const polygonStyle = {
                        color: '#F9A11B', // BPS Orange
                        weight: 4,
                        opacity: 0.9,
                        fillColor: '#005A9C', // BPS Blue
                        fillOpacity: 0.15,
                        dashArray: '6, 6'
                    };

                    polygonLayerRef.current = L.geoJSON(targetData.geojson, { style: polygonStyle }).addTo(mapRef.current);
                    
                    // Fit map strictly to target area bounds
                    mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [30, 30] });
                }
            };

            const startLiveTracking = () => {
                if (!navigator.geolocation) {
                    setGpsStatus("Perangkat tidak mendukung GPS.");
                    return;
                }

                setGpsStatus('Mencari sinyal satelit...');

                watchIdRef.current = navigator.geolocation.watchPosition(
                    (position) => {
                        const { latitude, longitude, accuracy } = position.coords;
                        const newLocation = { lat: latitude, lng: longitude, acc: accuracy };
                        setLocation(newLocation);
                        
                        // Set GPS Status based on accuracy
                        if (accuracy <= 15) setGpsStatus('Akurasi Tinggi (Satelit Lock)');
                        else if (accuracy <= 50) setGpsStatus('Akurasi Sedang');
                        else setGpsStatus('Akurasi Lemah (Gunakan ruang terbuka)');

                        updateMapMarker(newLocation);
                        checkGeofence(latitude, longitude); // The magic happens here
                    },
                    (error) => {
                        setGpsStatus('GPS Ditolak / Hilang');
                    },
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );
            };

            // ==========================================
            // TURF.JS GEOFENCING ALGORITHM (OFFLINE)
            // ==========================================
            const checkGeofence = (lat, lng) => {
                if (!targetData || !targetData.geojson) return;

                try {
                    // Create turf point from current GPS
                    const currentPoint = turf.point([lng, lat]);
                    
                    // Calculate if point is inside the GeoJSON polygon using Turf's mathematical algorithm
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
                    html: '<div class="gps-marker"></div>',
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

            // ==========================================
            // RENDER UI
            // ==========================================
            if (appMode === 'setup') {
                return (
                    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-bps-blue to-bps-blueDark relative overflow-hidden">
                        {/* Abstract background graphics */}
                        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-bps-orange/20 rounded-full blur-3xl"></div>

                        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-8 relative z-10">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-bps-light rounded-2xl flex items-center justify-center mx-auto mb-4 text-bps-blue shadow-inner border border-blue-50">
                                    <i className="fa-solid fa-map-location-dot text-3xl"></i>
                                </div>
                                <h1 className="text-2xl font-bold text-gray-800">Geofence Batas Area</h1>
                                <p className="text-sm text-gray-500 mt-2 font-medium">Tetapkan wilayah tugas Anda sebelum turun ke lapangan.</p>
                            </div>

                            {isSearching ? (
                                <SkeletonForm />
                            ) : (
                                <form onSubmit={handleSearch} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 ml-1">Nama Wilayah Tujuan</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <i className="fa-solid fa-location-dot text-gray-400"></i>
                                            </div>
                                            <input 
                                                type="text" 
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Contoh: Ranuwurung, Randuagung, Lumajang"
                                                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-bps-blue focus:border-transparent transition-all placeholder-gray-400 text-sm font-medium"
                                                required
                                            />
                                        </div>
                                    </div>
                                    
                                    {searchError && (
                                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-start gap-2 border border-red-100">
                                            <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
                                            <p className="font-medium leading-relaxed">{searchError}</p>
                                        </div>
                                    )}

                                    <button 
                                        type="submit" 
                                        className="w-full bg-bps-blue text-white font-bold py-3.5 rounded-xl shadow-[0_8px_20px_rgba(0,90,156,0.3)] hover:bg-bps-blueDark hover:shadow-[0_4px_10px_rgba(0,90,156,0.4)] transition-all flex justify-center items-center gap-2"
                                    >
                                        <i className="fa-solid fa-satellite-dish"></i> Unduh Batas Wilayah
                                    </button>
                                </form>
                            )}
                            
                            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Sistem Deteksi Offline BPS</p>
                            </div>
                        </div>
                    </div>
                );
            }

            // Tracking Mode UI
            const displayName = targetData?.address?.village || targetData?.address?.suburb || targetData?.address?.town || targetData?.name || "Wilayah Tugas";
            
            return (
                <div className="relative w-full h-screen bg-gray-100">
                    <div id="map-container"></div>

                    <div className="ui-layer">
                        {/* Top Bar Navigation */}
                        <div className="p-4 pointer-events-auto">
                            <div className="bg-white/95 backdrop-blur-md shadow-glass rounded-2xl p-3 flex items-center justify-between border border-white/50">
                                <button 
                                    onClick={resetApp}
                                    className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"
                                    title="Ganti Wilayah"
                                >
                                    <i className="fa-solid fa-arrow-left"></i>
                                </button>
                                <div className="text-center flex-1 px-2 overflow-hidden">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Target Operasi</p>
                                    <h2 className="text-sm font-bold text-gray-800 truncate">{displayName}</h2>
                                </div>
                                <div className="w-10 h-10 flex items-center justify-center text-bps-blue text-lg">
                                    <i className="fa-solid fa-shield-halved"></i>
                                </div>
                            </div>
                        </div>

                        {/* Floating Map Controls */}
                        <div className="absolute bottom-[230px] right-4 flex flex-col gap-3 pointer-events-auto">
                            <button 
                                onClick={centerToArea}
                                className="w-12 h-12 bg-white rounded-full shadow-float flex items-center justify-center text-bps-orange hover:bg-gray-50 focus:outline-none"
                                title="Lihat Seluruh Area Target"
                            >
                                <i className="fa-solid fa-draw-polygon text-lg"></i>
                            </button>
                            <button 
                                onClick={centerToMe}
                                className="w-12 h-12 bg-bps-blue rounded-full shadow-[0_8px_20px_rgba(0,90,156,0.3)] flex items-center justify-center text-white hover:bg-bps-blueDark focus:outline-none"
                                title="Fokus Lokasi Saya"
                            >
                                <i className="fa-solid fa-crosshairs text-xl"></i>
                            </button>
                        </div>

                        {/* Bottom Information Sheet (Geofence Status) */}
                        <div className="bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem] p-6 pointer-events-auto border-t border-gray-100 pb-8">
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5"></div>

                            {/* Status Indicator Banner */}
                            <div className={`p-4 rounded-2xl flex items-center gap-4 transition-colors duration-500 shadow-sm border ${
                                isInside === null ? 'bg-gray-50 border-gray-100' :
                                isInside === true ? 'bg-emerald-50 border-emerald-100' : 
                                'bg-red-50 border-red-100'
                            }`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-inner ${
                                    isInside === null ? 'bg-gray-100 text-gray-400' :
                                    isInside === true ? 'bg-emerald-100 text-emerald-600' : 
                                    'bg-red-100 text-red-600'
                                }`}>
                                    <i className={`fa-solid ${
                                        isInside === null ? 'fa-spinner fa-spin' :
                                        isInside === true ? 'fa-check-double' : 
                                        'fa-triangle-exclamation'
                                    }`}></i>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">
                                        Status Koordinat
                                    </p>
                                    <h3 className={`text-xl font-bold leading-none ${
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
                                        <i className="fa-solid fa-satellite text-[10px]"></i>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Akurasi GPS</span>
                                    </div>
                                    <span className="text-xs text-gray-800 font-medium">
                                        {location ? `± ${Math.round(location.acc)} meter` : 'Menunggu...'}
                                    </span>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                                        <i className="fa-solid fa-signal text-[10px]"></i>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Sistem</span>
                                    </div>
                                    <span className="text-xs text-gray-800 font-medium truncate" title={gpsStatus}>
                                        {gpsStatus}
                                    </span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>

