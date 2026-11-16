/**
 * Polaroid Camera - UI controller module
 * Handles UI interaction and camera features
 */

const UIController = (function() {
    // Initialization function
    function init() {
        
        
        // Camera implementation
        initCameraInterface();
        
        
    }
    
    // Initialize the camera interface
    function initCameraInterface() {
        const cameraBtn = document.getElementById('cameraBtn');
        const cameraInterface = document.getElementById('cameraInterface');
        const closeCameraBtn = document.getElementById('closeCameraBtn');
        const cameraPreview = document.getElementById('cameraPreview');
        const takePhotoBtn = document.getElementById('takePhotoBtn');
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        const deviceInfo = document.getElementById('deviceInfo');
        
        // Current camera mode: 'user' for front, 'environment' for rear
        let currentFacingMode = 'user';
        
        // Check whether the element exists
        if (!cameraBtn || !cameraInterface) {
            console.error("Camera UI elements are missing; camera features cannot be initialized");
            return;
        }
        
        // Open the camera UI
        cameraBtn?.addEventListener('click', function() {
            
            if (cameraInterface) {
                cameraInterface.classList.add('active');
                
                // Initialize the camera stream
                initCameraStream(cameraPreview, deviceInfo, currentFacingMode);
            }
        });
        
        // Close the camera UI
        closeCameraBtn?.addEventListener('click', function() {
            
            if (cameraInterface) {
                cameraInterface.classList.remove('active');
                
                // Stop the camera stream
                stopCameraStream(cameraPreview);
            }
        });
        
        // Capture button
        takePhotoBtn?.addEventListener('click', function() {
            
            if (cameraPreview && cameraPreview.srcObject) {
                takePhoto(cameraPreview, currentFacingMode);
            } else {
                console.error("Camera preview is not initialized; cannot capture");
                alert("Camera not ready, please try again in a moment.");
            }
        });
        
        // Switch-camera button
        switchCameraBtn?.addEventListener('click', function() {
            if (cameraPreview && cameraPreview.srcObject) {
                // Switch camera
                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                
                // Stop the current camera stream
                stopCameraStream(cameraPreview);
                
                // Initialize the camera with the new mode
                initCameraStream(cameraPreview, deviceInfo, currentFacingMode);
            }
        });
    }
    
    // Initialize the camera - capture flow tuned for iOS devices
    function initCameraStream(videoElement, infoElement, facingMode = 'user') {
        if (!videoElement) return;
        
        // Show the loading state
        const loadingElement = document.getElementById('cameraLoading');
        if (loadingElement) loadingElement.style.display = 'flex';
        
        // Special handling: remove any filter overlay left over from before
        const existingOverlay = document.getElementById('filter-overlay');
        if (existingOverlay && existingOverlay.parentNode) {
            existingOverlay.parentNode.removeChild(existingOverlay);
        }
        
        // Detect iOS devices and the WebView environment
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isWebView = window.navigator.standalone !== undefined || 
                         window.matchMedia('(display-mode: standalone)').matches ||
                         /WebView|wkwebview|UIWebView/.test(navigator.userAgent) ||
                         (window.webkit && window.webkit.messageHandlers);
        
        if (isIOS) {
            console.log("iOS device detected");
            if (isWebView) {
                console.log("WebView detected, using the WebView camera mode");
            } else {
                console.log("Safari browser detected, using the iOS-specific capture mode");
            }
        }
        
        // Try to acquire the user media device
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                // Capture constraints tuned per environment
                let constraints;
                
                if (isIOS && isWebView) {
                    // WebView: most conservative settings to avoid live mode
                    constraints = { 
                        video: { 
                            facingMode: facingMode, // Simple mode inside WebView
                            // WebView: lower resolution for compatibility
                            width: { ideal: 1280, max: 1280 },
                            height: { ideal: 720, max: 720 }
                            // Never set frameRate and let WebView choose the best mode
                        },
                        audio: false 
                    };
                    console.log("Using WebView optimized constraints");
                } else if (isIOS) {
                    // Safari: use high-quality capture settings
                    constraints = { 
                        video: { 
                            facingMode: { ideal: facingMode },
                            width: { ideal: 1920, max: 1920 },
                            height: { ideal: 1080, max: 1080 }
                            // Omit frameRate entirely on Safari
                        },
                        audio: false 
                    };
                    console.log("Using Safari iOS optimized constraints");
                } else {
                    // Non-iOS: standard settings
                    constraints = { 
                        video: { 
                            facingMode: { ideal: facingMode },
                            width: { ideal: 1280, max: 1920 },
                            height: { ideal: 720, max: 1080 },
                            frameRate: { ideal: 15 }
                        },
                        audio: false 
                    };
                }
                
                // Request user media according to the environment
                navigator.mediaDevices.getUserMedia(constraints)
                    .then(stream => {
                        // Set the stream
                        videoElement.srcObject = stream;
                        
                        // Keep autoplay off until fully loaded
                        videoElement.autoplay = false;
                        
                        // Keep the video element size stable
                        videoElement.style.width = '100%';
                        videoElement.style.height = '100%';
                        videoElement.style.objectFit = 'cover';
                        
                        // Mirror only when the front camera is in use
                        if (facingMode === 'user') {
                            videoElement.style.transform = 'scaleX(-1)';
                        } else {
                            videoElement.style.transform = 'scaleX(1)';
                        }
                        
                        // Show which camera is in use
                        if (infoElement) {
                            infoElement.textContent = facingMode === 'user' ? 
                                'Using front camera' : 'Using back camera';
                        }
                        
                        // Runs after the video element loads its metadata
                        videoElement.onloadedmetadata = function() {
                            // Delay playback so the camera can settle
                            setTimeout(() => {
                                // Apply the filter
                                applyFilterToPreview(videoElement);
                                
                                // Start playback
                                videoElement.play()
                                    .then(() => {
                                        // Hide the loading state
                                        if (loadingElement) loadingElement.style.display = 'none';
                                    })
                                    .catch(playError => {
                                        console.error("Failed to play the camera stream:", playError);
                                        if (loadingElement) loadingElement.textContent = "Camera error: " + playError.message;
                                    });
                            }, 300); // Short delay so the device can settle
                        };
                    })
                    .catch(error => {
                        console.error("Camera initialization failed:", error);
                        
                        // Covers devices without the requested camera (e.g. no front camera)
                        if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                            // Environment-compatible fallback constraints
                            let fallbackConstraints;
                            
                            if (isIOS && isWebView) {
                                // WebView fallback: most basic settings
                                fallbackConstraints = {
                                    video: {
                                        facingMode: facingMode,
                                        width: { ideal: 640, max: 1280 },
                                        height: { ideal: 480, max: 720 }
                                        // WebView fallback: never set frameRate
                                    },
                                    audio: false
                                };
                                console.log("Using WebView fallback constraints");
                            } else if (isIOS) {
                                // iOS Safari fallback
                                fallbackConstraints = {
                                    video: {
                                        facingMode: facingMode,
                                        width: { ideal: 1280, max: 1920 },
                                        height: { ideal: 720, max: 1080 }
                                        // iOS Safari fallback without frameRate
                                    },
                                    audio: false
                                };
                                console.log("Using iOS Safari fallback constraints");
                            } else {
                                // Non-iOS fallback
                                fallbackConstraints = {
                                    video: {
                                        facingMode: facingMode,
                                        width: { ideal: 960, max: 1280 },
                                        height: { ideal: 540, max: 720 },
                                        frameRate: { ideal: 15 }
                                    },
                                    audio: false
                                };
                            }
                            
                            // Show the fallback message
                            if (loadingElement) loadingElement.textContent = "Trying alternative camera settings...";
                            
                            // Try the fallback settings
                            navigator.mediaDevices.getUserMedia(fallbackConstraints)
                                .then(stream => {
                                    videoElement.srcObject = stream;
                                    videoElement.autoplay = false;
                                    videoElement.style.width = '100%';
                                    videoElement.style.height = '100%';
                                    videoElement.style.objectFit = 'cover';
                                    
                                    // Apply the appropriate transform
                                    if (facingMode === 'user') {
                                        videoElement.style.transform = 'scaleX(-1)';
                                    } else {
                                        videoElement.style.transform = 'scaleX(1)';
                                    }
                                    
                                    // Show camera information
                                    if (infoElement) {
                                        infoElement.textContent = facingMode === 'user' ? 
                                            'Using front camera (fallback)' : 'Using back camera (fallback)';
                                    }
                                    
                                    videoElement.onloadedmetadata = function() {
                                        setTimeout(() => {
                                            applyFilterToPreview(videoElement);
                                            videoElement.play()
                                                .then(() => {
                                                    if (loadingElement) loadingElement.style.display = 'none';
                                                })
                                                .catch(playError => {
                                                    console.error("Fallback camera playback failed:", playError);
                                                    if (loadingElement) loadingElement.textContent = "Camera error: " + playError.message;
                                                });
                                        }, 300);
                                    };
                                })
                                .catch(fallbackError => {
                                    console.error("Fallback camera initialization also failed:", fallbackError);
                                    if (loadingElement) loadingElement.textContent = "Camera access failed: " + fallbackError.message;
                                    alert("Cannot access camera: " + fallbackError.message);
                                });
                        } else {
                            // Other errors
                            if (loadingElement) loadingElement.textContent = "Camera access failed: " + error.message;
                            alert("Cannot access camera: " + error.message);
                        }
                    });
            } catch (error) {
                console.error("Camera request error:", error);
                if (loadingElement) loadingElement.textContent = "Camera request error";
                alert("Error requesting camera: " + (error.message || "Unknown error"));
            }
        } else {
            console.error("This browser does not support getUserMedia");
            if (loadingElement) loadingElement.textContent = "Your browser doesn't support camera";
            alert("Your browser does not support camera functionality.");
        }
    }
    
    // Stop the camera stream - tuned for releasing camera resources on iOS
    function stopCameraStream(videoElement) {
        if (videoElement && videoElement.srcObject) {
            // Detect iOS devices
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            
            // On iOS devices, pause the video element first
            if (isIOS && !videoElement.paused) {
                try {
                    videoElement.pause();
                } catch (e) {
                    console.log("Could not pause the video element");
                }
            }
            
            const stream = videoElement.srcObject;
            const tracks = stream.getTracks();
            
            // Optimized resource-release flow
            tracks.forEach(track => {
                if (track.enabled) track.enabled = false; // Disable first
                track.stop(); // Then stop
            });
            
            // Fully clear the video source
            videoElement.srcObject = null;
            
            // Extra cleanup on iOS devices
            if (isIOS) {
                videoElement.load(); // Reset the video element state
            }
            
            // Remove the filter overlay
            const overlay = document.getElementById('filter-overlay');
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            
            
        }
    }
    
    // True iOS capture mode: capture the way iOS expects instead of a live stream
    function takePhoto(videoElement, facingMode = 'user') {
        if (!videoElement || !videoElement.srcObject) {
            console.error("The video element or stream is unavailable");
            return;
        }
        
        // Detect iOS devices
        const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        // iOS-specific handling: pause the video to avoid live mode
        try {
            videoElement.pause();
        } catch (e) {
            console.log("Could not pause the video stream; capturing anyway");
        }
        
        // Detect the environment and pick the best capture strategy
        const detectiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const detectWebView = window.navigator.standalone !== undefined || 
                         window.matchMedia('(display-mode: standalone)').matches ||
                         /WebView|wkwebview|UIWebView/.test(navigator.userAgent) ||
                         (window.webkit && window.webkit.messageHandlers);
        
        if (detectiOS && detectWebView) {
            // WebView: special optimizations
            console.log("Using the WebView capture mode");
            if (facingMode === 'user') {
                // WebView front camera: minimal delay
                showCountdown(1, () => {
                    showFlashAndCapture(videoElement, facingMode, 'webview');
                });
            } else {
                // WebView rear camera: capture immediately
                showFlashAndCapture(videoElement, facingMode, 'webview');
            }
        } else if (detectiOS) {
            // Safari iOS: standard iOS optimizations
            console.log("Using the Safari iOS capture mode");
            if (facingMode === 'user') {
                showCountdown(2, () => {
                    showFlashAndCapture(videoElement, facingMode, 'ios');
                });
            } else {
                showFlashAndCapture(videoElement, facingMode, 'ios');
            }
        } else {
            // Non-iOS: standard flow
            if (facingMode === 'user') {
                showCountdown(3, () => {
                    showFlashAndCapture(videoElement, facingMode, false);
                });
            } else {
                showFlashAndCapture(videoElement, facingMode, false);
            }
        }
    }
    
    // Show the flash and capture - supports several modes
    function showFlashAndCapture(videoElement, facingMode, mode = false) {
        // Show the flash
        const flashEffect = document.createElement('div');
        flashEffect.className = 'flash-effect';
        document.querySelector('.camera-preview-container').appendChild(flashEffect);
        
        // Adjust the flash duration per mode
        let flashDuration = 600; // Default
        if (mode === 'webview') {
            flashDuration = 300; // Shortest for WebView
        } else if (mode === 'ios') {
            flashDuration = 400; // Medium on iOS
        }
        
        setTimeout(() => {
            flashEffect.remove();
        }, flashDuration);
        
        // Choose the capture mode for the environment
        if (mode === 'webview') {
            console.log("Using the WebView capture mode");
            captureImageForWebView(videoElement, facingMode);
        } else if (mode === 'ios') {
            console.log("Using the iOS Safari capture mode");
            captureImageForIOS(videoElement, facingMode);
        } else {
            // Standard capture mode
            captureImage(videoElement, facingMode);
        }
    }
    
    // Show the countdown
    function showCountdown(seconds, callback) {
        // Get the countdown element
        const countdownDisplay = document.getElementById('countdownDisplay');
        if (!countdownDisplay) {
            console.error("Countdown element not found");
            if (typeof callback === 'function') callback();
            return;
        }
        
        // Show the current second
        countdownDisplay.textContent = seconds;
        countdownDisplay.style.display = 'block';
        
        // Add a pulse animation
        countdownDisplay.classList.add('pulse');
        
        // Countdown logic
        if (seconds > 1) {
            setTimeout(() => {
                // Remove the animation and get ready for the next one
                countdownDisplay.classList.remove('pulse');
                
                // Continue the countdown
                setTimeout(() => {
                    showCountdown(seconds - 1, callback);
                }, 200);
            }, 800);
        } else {
            // Last second
            setTimeout(() => {
                // Hide the countdown display
                countdownDisplay.style.display = 'none';
                
                // Run the callback
                if (typeof callback === 'function') {
                    callback();
                }
            }, 1000);
        }
    }
    
    // Hide the countdown
    function hideCountdown() {
        const countdownDisplay = document.getElementById('countdownDisplay');
        if (countdownDisplay) {
            countdownDisplay.style.display = 'none';
        }
    }
    
    // Generic capture: grab a high-quality still
    function captureImage(videoElement, facingMode = 'user') {
        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Size the canvas to the real video dimensions
        canvas.width = videoElement.videoWidth || 1280; // Default standard quality
        canvas.height = videoElement.videoHeight || 720;
        
        // Decide whether to mirror based on the camera type
        if (facingMode === 'user') {
            // The front camera needs mirroring
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        
        // Standard drawing settings
        context.imageSmoothingEnabled = true;
        
        // Draw the video frame onto the canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Read the image data
        try {
            // Use PNG for compatibility
            const imageData = canvas.toDataURL('image/png', 0.9);
            
            // Check the screen width
            const screenWidth = window.innerWidth;
            
            // On small screens, remove any existing photo and download button first
            if (screenWidth <= 1000) {
                const existingBtn = document.getElementById('smallScreenDownloadBtn');
                if (existingBtn) {
                    existingBtn.remove();
                }
            }
            
            // Close the camera UI after 0.8 s so the flash can be seen
            setTimeout(() => {
                // Close the camera UI
                const cameraInterface = document.getElementById('cameraInterface');
                if (cameraInterface) {
                    cameraInterface.classList.remove('active');
                }
                
                // Stop the camera stream
                stopCameraStream(videoElement);
                
                // Create the Polaroid photo
                PolaroidCore.createPolaroidPhoto(imageData);
            }, 800);
            
        } catch (error) {
            console.error("Image capture failed:", error);
            alert("Failed to take photo, please try again.");
        }
    }
    
    // New: capture flow tuned specifically for WebView
    function captureImageForWebView(videoElement, facingMode = 'user') {
        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // WebView: conservative resolution settings for compatibility
        canvas.width = videoElement.videoWidth || 1280; // Medium quality to avoid WebView limits
        canvas.height = videoElement.videoHeight || 720;
        
        // Decide whether to mirror based on the camera type
        if (facingMode === 'user') {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        
        // WebView: basic drawing settings for stability
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'medium'; // Medium quality to avoid performance issues
        
        // Draw the video frame onto the canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // WebView: obtain stable image data
        try {
            // Use PNG for WebView compatibility
            const imageData = canvas.toDataURL('image/png', 0.8);
            
            // Check the screen width
            const webViewScreenWidth = window.innerWidth;
            
            if (webViewScreenWidth <= 1000) {
                const existingBtn = document.getElementById('smallScreenDownloadBtn');
                if (existingBtn) {
                    existingBtn.remove();
                }
            }
            
            // WebView: shortest delay to avoid UI lag
            setTimeout(() => {
                const cameraInterface = document.getElementById('cameraInterface');
                if (cameraInterface) {
                    cameraInterface.classList.remove('active');
                }
                
                stopCameraStream(videoElement);
                
                console.log("Creating the photo with the WebView optimized mode");
                PolaroidCore.createPolaroidPhoto(imageData);
            }, 400); // Shortest delay in WebView
            
        } catch (error) {
            console.error("WebView image capture failed:", error);
            alert("Capture failed, please try again");
        }
    }
    
    // Photo capture optimized for iOS Safari
    function captureImageForIOS(videoElement, facingMode = 'user') {
        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // iOS capture: size the canvas to the real video dimensions for higher resolution
        canvas.width = videoElement.videoWidth || 1920; // Default high quality
        canvas.height = videoElement.videoHeight || 1080;
        
        // Decide whether to mirror based on the camera type
        if (facingMode === 'user') {
            // The front camera needs mirroring
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        
        // iOS capture: high-quality drawing settings
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        
        // Draw the video frame onto the canvas using the iOS-optimized method
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // iOS capture: obtain high-quality image data
        try {
            // Use JPEG at high quality, better suited to iOS capture
            const imageData = canvas.toDataURL('image/jpeg', 0.95);
            
            // Check the screen width
            const iosScreenWidth = window.innerWidth;
            
            // On small screens, remove any existing photo and download button first
            if (iosScreenWidth <= 1000) {
                const existingBtn = document.getElementById('smallScreenDownloadBtn');
                if (existingBtn) {
                    existingBtn.remove();
                }
            }
            
            // iOS: shorter delay for a better experience
            setTimeout(() => {
                // Close the camera UI
                const cameraInterface = document.getElementById('cameraInterface');
                if (cameraInterface) {
                    cameraInterface.classList.remove('active');
                }
                
                // Stop the camera stream - fully release iOS camera resources
                stopCameraStream(videoElement);
                
                // Create the Polaroid photo
                console.log("Creating the photo with the iOS optimized mode");
                PolaroidCore.createPolaroidPhoto(imageData);
            }, 600); // Shorter delay on iOS
            
        } catch (error) {
            console.error("Image capture failed:", error);
            alert("Failed to take photo, please try again.");
        }
    }
    
    
    // Apply the filter to the camera preview - CSS filters instead of canvas work for speed
    function applyFilterToPreview(videoElement) {
        // Use CSS filters instead of live canvas processing to reduce overhead
        if (videoElement) {
            // Apply the CSS filter to the video element
            videoElement.style.filter = 'contrast(110%) brightness(95%) saturate(95%) sepia(15%)';
            
            // Stabilize on the video's first play
            let firstPlayHandler = function() {
                // Create a static filter overlay that is never updated live
                if (!document.getElementById('filter-overlay')) {
                    // Create the overlay
                    const overlay = document.createElement('div');
                    overlay.id = 'filter-overlay';
                    overlay.style.position = 'absolute';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.pointerEvents = 'none';
                    overlay.style.zIndex = '2';
                    
                    // Use a simple background tint instead of live image processing
                    overlay.style.backgroundColor = 'rgba(65, 105, 155, 0.15)'; // A hint of blue
                    overlay.style.mixBlendMode = 'overlay';
                    
                    // Append to the video container
                    const container = videoElement.parentElement;
                    if (container) {
                        container.style.position = 'relative';
                        container.appendChild(overlay);
                    }
                }
                
                // Remove the listener so it only runs once
                videoElement.removeEventListener('playing', firstPlayHandler);
            };
            
            // One-time setup when the video starts playing
            videoElement.addEventListener('playing', firstPlayHandler, false);
        }
    }
    
    // Public API
    return {
        init: init
    };
})();