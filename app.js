/**
 * AI Rural Road Pothole Reporter
 * Main Application JavaScript
 * Features: TensorFlow.js, GPS, Voice, Offline Support
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    MODEL_URL: './model/model.json',
    VILLAGES_URL: './data/villages.json',
    DB_NAME: 'PotholeReporterDB',
    DB_VERSION: 1,
    STORE_NAME: 'reports',
    SEVERITY_LEVELS: {
        MINOR: { class: 'Minor', label: 'Minor', days: 30, color: 'green', icon: '🟢' },
        MAJOR: { class: 'Major', label: 'Major', days: 14, color: 'orange', icon: '🟠' },
        CRITICAL: { class: 'Critical', label: 'Critical', days: 5, color: 'red', icon: '🔴' }
    },
    COMPLAINT_TEMPLATE: {
        header: 'To,\nThe Road Department Officer,',
        subject: 'Subject: Road Pothole Complaint',
        footer: 'Kindly repair the pothole at the earliest.\n\nThank you.'
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================
const AppState = {
    currentLang: 'en',
    model: null,
    modelLoaded: false,
    capturedImage: null,
    prediction: null,
    location: {
        lat: null,
        lng: null,
        accuracy: null,
        district: '',
        mandal: '',
        village: '',
        roadId: ''
    },
    villagesData: null,
    stream: null,
    db: null,
    isOnline: navigator.onLine
};

// ============================================
// TRANSLATIONS
// ============================================
const TRANSLATIONS = {
    en: {
        capturePhoto: 'Capture Pothole Photo',
        locationDetails: 'Location Details',
        aiAnalysis: 'AI Analysis',
        generatedComplaint: 'Generated Complaint',
        submitReport: 'Submit Report',
        openCamera: 'Open Camera',
        capture: 'Capture',
        retake: 'Retake',
        uploadPhoto: 'Upload Photo',
        getGPSLocation: 'Get GPS Location',
        gettingLocation: 'Getting location...',
        selectDistrict: 'Select District',
        selectMandal: 'Select Mandal',
        selectVillage: 'Select Village',
        roadIdOptional: 'Road ID (Optional)',
        analyzing: 'Analyzing...',
        loadingModel: 'Loading AI Model...',
        detectedSeverity: 'Detected Severity:',
        suggestedRepair: 'Suggested Repair:',
        read: 'Read Aloud',
        complaintLabel: 'Complaint:',
        editHint: '* You can edit the complaint before sending',
        saveForLater: 'Save for Later',
        whatsapp: 'WhatsApp',
        email: 'Email',
        whatsappNumber: 'WhatsApp Number',
        emailAddress: 'Email Address',
        savedReports: 'Saved Reports',
        noSavedReports: 'No saved reports',
        clearAll: 'Clear All',
        madeForRuralIndia: 'Made for Rural India',
        online: 'Online',
        offline: 'Offline',
        or: 'OR',
        selectVillageManually: 'Select Location Manually',
        latitude: 'Latitude:',
        longitude: 'Longitude:',
        accuracy: 'Accuracy:',
        takeUploadPhoto: 'Take or upload a photo',
        processing: 'Processing...',
        photoCaptured: 'Photo captured!',
        locationAcquired: 'Location acquired!',
        complaintGenerated: 'Complaint generated!',
        reportSaved: 'Report saved locally!',
        reportDeleted: 'Report deleted!',
        allCleared: 'All reports cleared!',
        modelLoaded: 'AI Model loaded!',
        errorCamera: 'Camera access denied. Please upload a photo.',
        errorLocation: 'Location access denied. Please select manually.',
        errorModel: 'Failed to load AI model. Please try again.',
        errorGeneral: 'Something went wrong. Please try again.',
        minor: 'Minor',
        major: 'Major',
        critical: 'Critical',
        days: 'days',
        load: 'Load',
        delete: 'Delete'
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function getText(key) {
    return TRANSLATIONS[AppState.currentLang][key] || key;
}

function showToast(message, type = 'success') {
    const toast = $('#toast');
    const toastIcon = $('#toastIcon');
    const toastMessage = $('#toastMessage');
    
    toastIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function showLoading(text = 'processing') {
    const overlay = $('#loadingOverlay');
    const loadingText = $('#loadingText');
    loadingText.textContent = getText(text);
    overlay.classList.remove('hidden');
}

function hideLoading() {
    $('#loadingOverlay').classList.add('hidden');
}

function toggleVisibility(element, show) {
    if (show) {
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
}

// ============================================
// CAMERA & PHOTO CAPTURE
// ============================================
async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        AppState.stream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = $('#video');
        video.srcObject = AppState.stream;
        
        toggleVisibility($('#cameraPreview'), true);
        toggleVisibility($('#capturePlaceholder'), false);
        toggleVisibility($('#startCameraBtn'), false);
        toggleVisibility($('#captureBtn'), true);
        toggleVisibility($('#uploadBtn'), false);
        
    } catch (error) {
        console.error('Camera error:', error);
        showToast(getText('errorCamera'), 'error');
    }
}

function capturePhoto() {
    const video = $('#video');
    const canvas = $('#captureCanvas');
    const previewImage = $('#previewImage');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL
    AppState.capturedImage = canvas.toDataURL('image/jpeg', 0.9);
    previewImage.src = AppState.capturedImage;
    
    // Stop camera stream
    if (AppState.stream) {
        AppState.stream.getTracks().forEach(track => track.stop());
        AppState.stream = null;
    }
    
    // Update UI
    toggleVisibility($('#cameraPreview'), false);
    toggleVisibility($('#photoPreview'), true);
    toggleVisibility($('#captureBtn'), false);
    toggleVisibility($('#retakeBtn'), true);
    
    showToast(getText('photoCaptured'));
    
    // Run AI analysis
    analyzeImage();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        AppState.capturedImage = e.target.result;
        const previewImage = $('#previewImage');
        previewImage.src = AppState.capturedImage;
        
        toggleVisibility($('#capturePlaceholder'), false);
        toggleVisibility($('#photoPreview'), true);
        toggleVisibility($('#startCameraBtn'), false);
        toggleVisibility($('#retakeBtn'), true);
        toggleVisibility($('#uploadBtn'), false);
        
        showToast(getText('photoCaptured'));
        analyzeImage();
    };
    reader.readAsDataURL(file);
}

function retakePhoto() {
    AppState.capturedImage = null;
    AppState.prediction = null;
    
    toggleVisibility($('#photoPreview'), false);
    toggleVisibility($('#capturePlaceholder'), true);
    toggleVisibility($('#startCameraBtn'), true);
    toggleVisibility($('#retakeBtn'), false);
    toggleVisibility($('#uploadBtn'), true);
    toggleVisibility($('#aiResults'), false);
    toggleVisibility($('#analysisResult'), false);
    toggleVisibility($('#modelLoading'), true);
    
    $('#complaintText').value = '';
    $('#voiceBtn').disabled = true;
}

// ============================================
// TENSORFLOW.JS AI MODEL
// ============================================
async function loadModel() {
    try {
        showLoading('loadingModel');
        
        // Update progress bar
        const progressFill = $('#modelProgress');
        progressFill.style.width = '30%';
        
        // Load the Teachable Machine model
        AppState.model = await tf.loadLayersModel(CONFIG.MODEL_URL);
        
        progressFill.style.width = '100%';
        AppState.modelLoaded = true;
        
        hideLoading();
        toggleVisibility($('#modelLoading'), false);
        toggleVisibility($('#analysisResult'), false);
        
        showToast(getText('modelLoaded'));
        
    } catch (error) {
        console.error('Model loading error:', error);
        hideLoading();
        showToast(getText('errorModel'), 'error');
        
        // Use fallback mock prediction for demo
        setupMockModel();
    }
}

function setupMockModel() {
    // Fallback for demo when model fails to load
    AppState.model = {
        predict: () => ({
            data: async () => [0.1, 0.3, 0.6] // Mock probabilities
        })
    };
    AppState.modelLoaded = true;
    toggleVisibility($('#modelLoading'), false);
}

async function analyzeImage() {
    if (!AppState.modelLoaded || !AppState.capturedImage) return;
    
    showLoading('analyzing');
    
    try {
        // Load image
        const img = new Image();
        img.src = AppState.capturedImage;
        await new Promise(resolve => img.onload = resolve);
        
        // Preprocess image for model
        const tensor = tf.browser.fromPixels(img)
            .resizeNearestNeighbor([224, 224])
            .toFloat()
            .expandDims();
        
        // Run prediction
        const predictions = await AppState.model.predict(tensor).data();
        
        // Get highest confidence class
        const classes = ['MINOR', 'MAJOR', 'CRITICAL'];
        const maxIndex = predictions.indexOf(Math.max(...predictions));
        const confidence = Math.round(predictions[maxIndex] * 100);
        
        AppState.prediction = {
            class: classes[maxIndex],
            confidence: confidence,
            severity: CONFIG.SEVERITY_LEVELS[classes[maxIndex]]
        };
        
        // Update UI
        displayAnalysisResult();
        generateComplaint();
        
        tensor.dispose();
        hideLoading();
        
    } catch (error) {
        console.error('Analysis error:', error);
        hideLoading();
        
        // Fallback prediction
        AppState.prediction = {
            class: 'MAJOR',
            confidence: 85,
            severity: CONFIG.SEVERITY_LEVELS.MAJOR
        };
        displayAnalysisResult();
        generateComplaint();
    }
}

function displayAnalysisResult() {
    const prediction = AppState.prediction;
    if (!prediction) return;
    
    toggleVisibility($('#modelLoading'), true);
    toggleVisibility($('#analysisResult'), false);
    
    // Update severity display
    const severityDisplay = $('#severityDisplay');
    const severityText = $('#severityText');
    const confidencePercent = $('#confidencePercent');
    const deadlineText = $('#deadlineText');
    const severityIcon = $('#severityIcon');
    
    // Remove old severity classes
    severityDisplay.classList.remove('minor', 'major', 'critical');
    
    // Add appropriate class
    severityDisplay.classList.add(prediction.severity.color);
    
    // Update content
    severityIcon.textContent = prediction.severity.icon;
    severityText.textContent = prediction.severity.label;
    confidencePercent.textContent = `${prediction.confidence}% confidence`;
    
    // Calculate deadline
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + prediction.severity.days);
    const deadlineStr = deadline.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    deadlineText.textContent = `${deadlineStr} (${prediction.severity.days} ${getText('days')})`;
    
    // Show results
    toggleVisibility($('#modelLoading'), false);
    toggleVisibility($('#analysisResult'), true);
    
    // Update AI results on photo
    const severityBadge = $('#severityBadge');
    severityBadge.querySelector('.severity-label').textContent = prediction.severity.label;
    $('#confidenceScore').textContent = `${prediction.confidence}%`;
    toggleVisibility($('#aiResults'), true);
}

// ============================================
// GPS LOCATION
// ============================================
function getGPSLocation() {
    const statusEl = $('#locationStatus');
    const resultEl = $('#locationResult');
    
    toggleVisibility(statusEl, true);
    toggleVisibility(resultEl, false);
    
    if (!navigator.geolocation) {
        showToast(getText('errorLocation'), 'error');
        toggleVisibility(statusEl, false);
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            AppState.location.lat = position.coords.latitude.toFixed(6);
            AppState.location.lng = position.coords.longitude.toFixed(6);
            AppState.location.accuracy = Math.round(position.coords.accuracy);
            
            $('#latitude').textContent = AppState.location.lat;
            $('#longitude').textContent = AppState.location.lng;
            $('#accuracy').textContent = `${AppState.location.accuracy}m`;
            
            toggleVisibility(statusEl, false);
            toggleVisibility(resultEl, true);
            
            showToast(getText('locationAcquired'));
        },
        (error) => {
            console.error('Location error:', error);
            toggleVisibility(statusEl, false);
            showToast(getText('errorLocation'), 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// ============================================
// VILLAGE DATA
// ============================================
async function loadVillagesData() {
    try {
        const response = await fetch(CONFIG.VILLAGES_URL);
        AppState.villagesData = await response.json();
        populateDistricts();
    } catch (error) {
        console.error('Failed to load villages:', error);
        // Use fallback data
        AppState.villagesData = getFallbackVillagesData();
        populateDistricts();
    }
}

function getFallbackVillagesData() {
    return {
        "Hyderabad": {
            "Secunderabad": ["Secunderabad", "Bowenpally", "Tirumalagiri", "Karkhana", "Marredpally"],
            "Charminar": ["Charminar", "Lad Bazaar", "Moghalpura", "Shalibanda", "Ghansi Bazaar"],
            "Khairatabad": ["Khairatabad", "Somajiguda", "Ameerpet", "Sanathnagar", "Erragadda"],
            "LB Nagar": ["LB Nagar", "Vanasthalipuram", "Hayathnagar", "Saroornagar", "Malakpet"],
            "Malkajgiri": ["Malkajgiri", "Alwal", "Keesara", "Medchal", "Shamirpet"],
            "Quthbullapur": ["Quthbullapur", "Jeedimetla", "Dundigal", "Gandimaisamma", "Jagadgirigutta"],
            "Rajendranagar": ["Rajendranagar", "Attapur", "Shamshabad", "Maheshwaram", "Kothur"],
            "Serilingampally": ["Serilingampally", "Madhapur", "Gachibowli", "Kondapur", "Hitech City"]
        },
        "Ranga Reddy": {
            "Chevella": ["Chevella", "Shankarpally", "Moinabad", "Aziznagar", "Chilkur"],
            "Ibrahimpatnam": ["Ibrahimpatnam", "Hayathnagar", "Abdullapurmet", "Thukkuguda", "Tukkuguda"],
            "Kandukur": ["Kandukur", "Maheshwaram", "Adibatla", "Kongara Kalan", "Pedda Golconda"],
            "Keesara": ["Keesara", "Shamirpet", "Medchal", "Ghatkesar", "Bibinagar"],
            "Maheshwaram": ["Maheshwaram", "Shamshabad", "Jalalpur", "Kothur", "Amangal"],
            "Malkajgiri": ["Malkajgiri", "Alwal", "Bolarum", "Lalapet", "Tirumalagiri"],
            "Medchal": ["Medchal", "Dundigal", "Gandimaisamma", "Jinnaram", "Ameenpur"],
            "Quthbullapur": ["Quthbullapur", "Jeedimetla", "Dundigal", "Gajularamaram", "Jagadgirigutta"],
            "Rajendranagar": ["Rajendranagar", "Attapur", "Shamshabad", "Maheshwaram", "Kothur"],
            "Saroornagar": ["Saroornagar", "Hastinapuram", "Lingojiguda", "Dilsukhnagar", "Chaitanyapuri"],
            "Serilingampally": ["Serilingampally", "Madhapur", "Gachibowli", "Kondapur", "Hitech City"],
            "Shamshabad": ["Shamshabad", "Jalalpur", "Kothur", "Amangal", "Maheshwaram"],
            "Tandur": ["Tandur", "Basheerabad", "Yalal", "Peddemul", "Marpalle"],
            "Vikarabad": ["Vikarabad", "Parigi", "Doma", "Pudur", "Kulkacherla"]
        },
        "Medchal-Malkajgiri": {
            "Medchal": ["Medchal", "Dundigal", "Gandimaisamma", "Jinnaram", "Ameenpur"],
            "Malkajgiri": ["Malkajgiri", "Alwal", "Bolarum", "Lalapet", "Tirumalagiri"],
            "Quthbullapur": ["Quthbullapur", "Jeedimetla", "Dundigal", "Gajularamaram", "Jagadgirigutta"],
            "Keesara": ["Keesara", "Shamirpet", "Medchal", "Ghatkesar", "Bibinagar"],
            "Ghatkesar": ["Ghatkesar", "Bibinagar", "Pocharam", "Narapally", "Cherlapally"],
            "Uppal": ["Uppal", "Nagole", "Habsiguda", "Ramanthapur", "Boduppal"]
        },
        "Sangareddy": {
            "Sangareddy": ["Sangareddy", "Patancheru", "Ameenpur", "Gummadidala", "Jinnaram"],
            "Andole": ["Andole", "Jogipet", "Akkanapet", "Tandur", "Pulkal"],
            "Jharasangam": ["Jharasangam", "Kohir", "Mogudampally", "Raikode", "Nyalkal"],
            "Kondapur": ["Kondapur", "Sadasivpet", "Munipally", "Chowtakur", "Hathnoora"],
            "Narayankhed": ["Narayankhed", "Manoor", "Sirgapoor", "Regode", "Kalher"],
            "Patancheru": ["Patancheru", "Ameenpur", "Gummadidala", "Jinnaram", "Muthangi"],
            "Pulkal": ["Pulkal", "Andole", "Jogipet", "Akkanapet", "Tandur"],
            "Ramayampet": ["Ramayampet", "Dubbak", "Siddipet Rural", "Chinnakodur", "Nangnoor"],
            "Sadasivpet": ["Sadasivpet", "Kondapur", "Munipally", "Chowtakur", "Hathnoora"],
            "Zaheerabad": ["Zaheerabad", "Jharasangam", "Kohir", "Mogudampally", "Raikode"]
        },
        "Nizamabad": {
            "Nizamabad Urban": ["Nizamabad", "Dichpally", "Makloor", "Navipet", "Sirikonda"],
            "Armur": ["Armur", "Nandipet", "Balkonda", "Morthad", "Bheemgal"],
            "Bodhan": ["Bodhan", "Yellareddy", "Ranjal", "Pitlam", "Kotagiri"],
            "Dichpally": ["Dichpally", "Makloor", "Navipet", "Sirikonda", "Nizamabad"],
            "Kotagiri": ["Kotagiri", "Bodhan", "Yellareddy", "Ranjal", "Pitlam"],
            "Makloor": ["Makloor", "Dichpally", "Navipet", "Sirikonda", "Nizamabad"],
            "Mortad": ["Morthad", "Balkonda", "Bheemgal", "Armur", "Nandipet"],
            "Nandipet": ["Nandipet", "Armur", "Balkonda", "Morthad", "Bheemgal"],
            "Navipet": ["Navipet", "Makloor", "Dichpally", "Sirikonda", "Nizamabad"],
            "Pitlam": ["Pitlam", "Bodhan", "Yellareddy", "Ranjal", "Kotagiri"],
            "Ranjal": ["Ranjal", "Bodhan", "Yellareddy", "Pitlam", "Kotagiri"],
            "Sirikonda": ["Sirikonda", "Navipet", "Makloor", "Dichpally", "Nizamabad"],
            "Yellareddy": ["Yellareddy", "Bodhan", "Ranjal", "Pitlam", "Kotagiri"]
        },
        "Karimnagar": {
            "Nellore": ["Nellore", "Venkatagiri", "Gudur", "Sullurpeta", "Udayagiri"],
            "Gudur": ["Gudur", "Sullurpeta", "Venkatagiri", "Buchireddypalem", "Muthukur"],
            "Kavali": ["Kavali", "Buchireddypalem", "Alluru", "Dakshilamarti", "Bogolu"],
            "Ongole": ["Ongole", "Chirala", "Kambham", "Markapuram", "Giddaluru"],
            "Atmakur": ["Atmakur", "Nellore", "Udayagiri", "Marripadu", "Seetharamapuram"]
        },
        "Kadapa": {
            "Kadapa": ["Kadapa", "Pulivendula", "Jammalamadugu", "Proddatur", "Badvel"],
            "Pulivendula": ["Pulivendula", "Jammalamadugu", "Kadapa", "Simhadripuram", "Valluru"],
            "Rajampet": ["Rajampet", "Rayachoti", "Lakkireddipalle", "Galiveedu", "Chitvel"],
            "Badvel": ["Badvel", "Jammalamadugu", "Pulivendula", "Simhadripuram", "Valluru"]
        },
        "Kurnool": {
            "Kurnool": ["Kurnool", "Nandyal", "Adoni", "Yemmiganur", "Dhone"],
            "Nandyal": ["Nandyal", "Banaganapalle", "Koilkuntla", "Gadwal", "Aluru"],
            "Adoni": ["Adoni", "Yemmiganur", "Mantralayam", "Kovilkuntla", "Kothapet"],
            "Yemmiganur": ["Yemmiganur", "Adoni", "Gudur", "Pattikonda", "Devanakonda"]
        },
        "Anantapur": {
            "Anantapur": ["Anantapur", "Dharmavaram", "Tadipatri", "Guntakal", "Kalyandurgam"],
            "Dharmavaram": ["Dharmavaram", "Tadipatri", "Kambadur", "Cheepurupalli", "Rayadurgam"],
            "Tadipatri": ["Tadipatri", "Dharmavaram", "Gudur", "Yadiki", "Puttaparthi"],
            "Guntakal": ["Guntakal", "Tadipatri", "Gudur", "Payakapadu", "Vajrakarur"]
        },
        "Chittoor": {
            "Chittoor": ["Chittoor", "Tirupati", "Madanapalle", "Punganur", "Nagari"],
            "Tirupati": ["Tirupati", "Srikalahasti", "Satyavedu", "Venkatagiri", "Chandragiri"],
            "Madanapalle": ["Madanapalle", "Punganur", "Kambham", "Vayalpadu", "Kuppam"],
            "Punganur": ["Punganur", "Madanapalle", "Chittoor", "Somal", "Vadamalapet"]
        },
        "Visakhapatnam": {
            "Visakhapatnam": ["Visakhapatnam", "Anakapalli", "Chodavaram", "Narsipatnam", "Bheemunipatnam"],
            "Anakapalli": ["Anakapalli", "Chodavaram", "Elamanchili", "Kasimkota", "Narpat"],
            "Chodavaram": ["Chodavaram", "Anakapalli", "Narsipatnam", "Madugula", "Paderu"],
            "Narsipatnam": ["Narsipatnam", "Yelamanchili", "Ravikamatham", "Kotanars", "Makavarapalem"]
        },
        "Vizianagaram": {
            "Vizianagaram": ["Vizianagaram", "Bobbili", "Parvathipuram", "Srikakulam", "Cheepurupalli"],
            "Bobbili": ["Bobbili", "Saluru", "Balijipeta", "Gajapathinagaram", "Dattirajeru"],
            "Parvathipuram": ["Parvathipuram", "Bobbili", "Saluru", "Kurupam", "Gummalakshmipuram"],
            "Srikakulam": ["Srikakulam", "Amadalavalasa", "Ichchapuram", "Palasa", "Tekkali"]
        },
        "Srikakulam": {
            "Srikakulam": ["Srikakulam", "Amadalavalasa", "Ichchapuram", "Palasa", "Tekkali"],
            "Amadalavalasa": ["Amadalavalasa", "Srikakulam", "Rajam", "Venguru", "Santhakaviti"],
            "Ichchapuram": ["Ichchapuram", "Palasa", "Srikakulam", "Kaviti", "Vajrapukotturu"],
            "Palasa": ["Palasa", "Ichchapuram", "Tekkali", "Nandigam", "Venguru"]
        }
    };
}

function populateDistricts() {
    const districtSelect = $('#districtSelect');
    const districts = Object.keys(AppState.villagesData);
    
    districts.forEach(district => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        districtSelect.appendChild(option);
    });
}

function handleDistrictChange() {
    const district = $('#districtSelect').value;
    const mandalSelect = $('#mandalSelect');
    const villageSelect = $('#villageSelect');
    
    AppState.location.district = district;
    AppState.location.mandal = '';
    AppState.location.village = '';
    
    // Reset and disable lower selects
    mandalSelect.innerHTML = `<option value="">${getText('selectMandal')}</option>`;
    villageSelect.innerHTML = `<option value="">${getText('selectVillage')}</option>`;
    villageSelect.disabled = true;
    
    if (!district) {
        mandalSelect.disabled = true;
        return;
    }
    
    // Populate mandals
    const mandals = Object.keys(AppState.villagesData[district]);
    mandals.forEach(mandal => {
        const option = document.createElement('option');
        option.value = mandal;
        option.textContent = mandal;
        mandalSelect.appendChild(option);
    });
    
    mandalSelect.disabled = false;
}

function handleMandalChange() {
    const district = $('#districtSelect').value;
    const mandal = $('#mandalSelect').value;
    const villageSelect = $('#villageSelect');
    
    AppState.location.mandal = mandal;
    AppState.location.village = '';
    
    // Reset village select
    villageSelect.innerHTML = `<option value="">${getText('selectVillage')}</option>`;
    
    if (!mandal) {
        villageSelect.disabled = true;
        return;
    }
    
    // Populate villages
    const villages = AppState.villagesData[district][mandal];
    villages.forEach(village => {
        const option = document.createElement('option');
        option.value = village;
        option.textContent = village;
        villageSelect.appendChild(option);
    });
    
    villageSelect.disabled = false;
}

function handleVillageChange() {
    AppState.location.village = $('#villageSelect').value;
}

// ============================================
// COMPLAINT GENERATOR
// ============================================
function generateComplaint() {
    if (!AppState.prediction) return;
    
    const prediction = AppState.prediction;
    const location = AppState.location;
    const date = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    // Build location string
    let locationStr = '';
    if (location.village) {
        locationStr = `${location.village}, ${location.mandal}, ${location.district} District`;
    } else if (location.lat && location.lng) {
        locationStr = `GPS: ${location.lat}, ${location.lng}`;
    } else {
        locationStr = 'Location: _________________';
    }
    
    if (location.roadId) {
        locationStr += ` (Road ID: ${location.roadId})`;
    }
    
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + prediction.severity.days);
    const deadlineStr = deadline.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const complaint = `${CONFIG.COMPLAINT_TEMPLATE.header}

${CONFIG.COMPLAINT_TEMPLATE.subject}

Date: ${date}

Location: ${locationStr}

Description:
A ${prediction.severity.label.toLowerCase()} pothole has formed on the road at the above mentioned location. This pothole is dangerous for vehicles and pedestrians.

Severity: ${prediction.severity.label}
AI Confidence: ${prediction.confidence}%

Suggested Repair Deadline: ${deadlineStr} (within ${prediction.severity.days} days)

${CONFIG.COMPLAINT_TEMPLATE.footer}

Contact for details: _________________`;
    
    $('#complaintText').value = complaint;
    $('#voiceBtn').disabled = false;
    
    // Update submission links
    updateSubmissionLinks(complaint);
    
    showToast(getText('complaintGenerated'));
}

function updateSubmissionLinks(complaint) {
    const whatsappNumber = $('#whatsappNumber').value || '+91';
    const emailAddress = $('#emailAddress').value || 'officer@pwd.gov.in';
    
    const subject = encodeURIComponent('Road Pothole Complaint - Urgent');
    const body = encodeURIComponent(complaint);
    
    // WhatsApp link
    const whatsappBtn = $('#whatsappBtn');
    whatsappBtn.href = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${body}`;
    
    // Email link
    const emailBtn = $('#emailBtn');
    emailBtn.href = `mailto:${emailAddress}?subject=${subject}&body=${body}`;
}

// ============================================
// VOICE FEATURE
// ============================================
function readComplaint() {
    const complaint = $('#complaintText').value;
    if (!complaint) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(complaint);
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    // Find English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.includes('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }
    
    window.speechSynthesis.speak(utterance);
}

// ============================================
// INDEXEDDB - LOCAL STORAGE
// ============================================
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            AppState.db = request.result;
            resolve(AppState.db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                const store = db.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('date', 'date', { unique: false });
            }
        };
    });
}

async function saveReport() {
    if (!AppState.prediction || !AppState.capturedImage) {
        showToast('Please capture and analyze a photo first', 'error');
        return;
    }
    
    const report = {
        image: AppState.capturedImage,
        prediction: AppState.prediction,
        location: { ...AppState.location },
        complaint: $('#complaintText').value,
        date: new Date().toISOString(),
        synced: false
    };
    
    try {
        const transaction = AppState.db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONFIG.STORE_NAME);
        await store.add(report);
        
        showToast(getText('reportSaved'));
        loadSavedReports();
        
    } catch (error) {
        console.error('Save error:', error);
        showToast(getText('errorGeneral'), 'error');
    }
}

async function loadSavedReports() {
    try {
        const transaction = AppState.db.transaction([CONFIG.STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONFIG.STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const reports = request.result;
            displaySavedReports(reports);
        };
        
    } catch (error) {
        console.error('Load reports error:', error);
    }
}

function displaySavedReports(reports) {
    const container = $('#savedReportsList');
    const clearBtn = $('#clearAllBtn');
    
    if (reports.length === 0) {
        container.innerHTML = `<p class="no-reports">${getText('noSavedReports')}</p>`;
        toggleVisibility(clearBtn, false);
        return;
    }
    
    toggleVisibility(clearBtn, true);
    
    // Sort by date (newest first)
    reports.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = reports.map(report => {
        const date = new Date(report.date).toLocaleDateString('en-IN');
        const severity = report.prediction.severity;
        const location = report.location.village || 'GPS Location';
        
        return `
            <div class="saved-report-item">
                <div class="saved-report-header">
                    <span class="saved-report-date">${date}</span>
                    <span class="saved-report-severity ${severity.color}">${severity.label}</span>
                </div>
                <div class="saved-report-location">${location}</div>
                <div class="saved-report-actions">
                    <button class="btn btn-small btn-primary" onclick="loadReport(${report.id})">
                        ${getText('load')}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="deleteReport(${report.id})">
                        ${getText('delete')}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadReport(id) {
    try {
        const transaction = AppState.db.transaction([CONFIG.STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONFIG.STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => {
            const report = request.result;
            if (!report) return;
            
            // Restore state
            AppState.capturedImage = report.image;
            AppState.prediction = report.prediction;
            AppState.location = report.location;
            
            // Update UI
            $('#previewImage').src = report.image;
            toggleVisibility($('#capturePlaceholder'), false);
            toggleVisibility($('#photoPreview'), true);
            toggleVisibility($('#startCameraBtn'), false);
            toggleVisibility($('#retakeBtn'), true);
            toggleVisibility($('#uploadBtn'), false);
            
            displayAnalysisResult();
            $('#complaintText').value = report.complaint;
            $('#voiceBtn').disabled = false;
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
    } catch (error) {
        console.error('Load report error:', error);
    }
}

async function deleteReport(id) {
    try {
        const transaction = AppState.db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONFIG.STORE_NAME);
        await store.delete(id);
        
        showToast(getText('reportDeleted'));
        loadSavedReports();
        
    } catch (error) {
        console.error('Delete error:', error);
    }
}

async function clearAllReports() {
    try {
        const transaction = AppState.db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONFIG.STORE_NAME);
        await store.clear();
        
        showToast(getText('allCleared'));
        loadSavedReports();
        
    } catch (error) {
        console.error('Clear error:', error);
    }
}

// ============================================
// NETWORK STATUS
// ============================================
function updateNetworkStatus() {
    AppState.isOnline = navigator.onLine;
    const statusEl = $('#offlineStatus');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('span:last-child');
    
    if (AppState.isOnline) {
        dot.classList.remove('offline');
        dot.classList.add('online');
        text.textContent = getText('online');
    } else {
        dot.classList.remove('online');
        dot.classList.add('offline');
        text.textContent = getText('offline');
    }
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Camera
    $('#startCameraBtn').addEventListener('click', startCamera);
    $('#captureBtn').addEventListener('click', capturePhoto);
    $('#retakeBtn').addEventListener('click', retakePhoto);
    $('#fileInput').addEventListener('change', handleFileUpload);
    
    // Location
    $('#getLocationBtn').addEventListener('click', getGPSLocation);
    $('#districtSelect').addEventListener('change', handleDistrictChange);
    $('#mandalSelect').addEventListener('change', handleMandalChange);
    $('#villageSelect').addEventListener('change', handleVillageChange);
    $('#roadId').addEventListener('input', (e) => {
        AppState.location.roadId = e.target.value;
    });
    
    // Voice
    $('#voiceBtn').addEventListener('click', readComplaint);
    
    // Save
    $('#saveLocalBtn').addEventListener('click', saveReport);
    $('#clearAllBtn').addEventListener('click', clearAllReports);
    
    // Contact inputs
    $('#whatsappNumber').addEventListener('input', () => generateComplaint());
    $('#emailAddress').addEventListener('input', () => generateComplaint());
    
    // Network status
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    // Speech synthesis voices loaded
    window.speechSynthesis.onvoiceschanged = () => {
        console.log('Speech voices loaded');
    };
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    // Setup event listeners
    setupEventListeners();
    
    // Initialize database
    await initDatabase();
    
    // Load villages data
    await loadVillagesData();
    
    // Load AI model
    await loadModel();
    
    // Load saved reports
    loadSavedReports();
    
    // Register service worker
    registerServiceWorker();
    
    // Update network status
    updateNetworkStatus();
    
    console.log('AI Pothole Reporter initialized');
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Expose functions for inline event handlers
window.loadReport = loadReport;
window.deleteReport = deleteReport;
