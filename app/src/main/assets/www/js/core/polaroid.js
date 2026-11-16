/**
 * Polaroid Camera - core module
 * Handles photo upload, Polaroid rendering and saving
 */

const PolaroidCore = (function() {
    // Private variables
    let polaroidCanvas = null;
    let polaroidContainer = null;
    let imageUpload = null;
    let saveBtn = null;
    let resetBtn = null;
    let currentPhotoDataURL = null;
    let autoSaveExecuted = false;
    let polaroidFramePath = '';
    

    
    // Initialization function
    function init() {
        
        
        // Look up the DOM elements
        polaroidCanvas = document.getElementById('polaroidCanvas');
        polaroidContainer = document.getElementById('polaroidContainer');
        imageUpload = document.getElementById('imageUpload');
        
        // Set the Polaroid frame image path
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        polaroidFramePath = baseUrl + 'assets/frame.png';
        

        
        
        // Make sure the front-layer image renders correctly
        const cameraFrontLayer = document.querySelector('.camera-front-layer');
        if (cameraFrontLayer) {
            cameraFrontLayer.style.display = 'block';
        }
        
        // Preload the frame image
        const preloadFrameImg = new Image();
        preloadFrameImg.src = polaroidFramePath;
        
        // Ensure the canvas exists and set the right size
        if (polaroidCanvas) {
            // Raise the canvas resolution to 1080p
            polaroidCanvas.width = 1080;
            polaroidCanvas.height = 1296; // Keep the original aspect ratio (1080 * 1.2)
            
            
            // Keep the canvas visible at the right size without a background
            polaroidCanvas.style.display = 'block';
            polaroidCanvas.style.width = '100%';
            polaroidCanvas.style.height = 'auto';
        } else {
            console.error("polaroidCanvas element not found; check the HTML structure");
        }
        
        // Add the canvas update listener
        polaroidCanvas.addEventListener('renderComplete', function() {
            try {
                
                currentPhotoDataURL = polaroidCanvas.toDataURL('image/png');
                
            } catch(e) {
                console.error("Could not read the photo data in the renderComplete event:", e);
            }
        });
        
        // Add the animation-end listener (transitionend)
        if (polaroidContainer) {
            polaroidContainer.addEventListener('transitionend', function(e) {
                // Only handle transitionend for the opacity or top properties
                if (e.propertyName === 'opacity' || e.propertyName === 'top') {

                    // The photo print is done. Keep it in place and let the
                    // user save it. The photo wall has been removed entirely,
                    // so the previous photo is cleared as soon as a new one is
                    // taken, and the in-app copy is released when the app exits.
                    if (currentPhotoDataURL && !autoSaveExecuted) {
                        autoSaveExecuted = true;

                        // Wait a moment so the user can see the finished print
                        setTimeout(function() {
                            addDownloadButtonForSmallScreen();
                        }, 2000); // 2-second delay
                    }
                }
            });
        }
        
        // Function that adds a download button on small screens
        function addDownloadButtonForSmallScreen() {
            // Remove any existing download button first
            const existingBtn = document.getElementById('smallScreenDownloadBtn');
            if (existingBtn) {
                existingBtn.remove();
            }
            
            // Create the download button
            const downloadBtn = document.createElement('button');
            downloadBtn.id = 'smallScreenDownloadBtn';
            downloadBtn.textContent = 'Download';
            downloadBtn.className = 'download-button';
            
            // Style the button - no longer absolutely positioned, it sits in the normal flow
            Object.assign(downloadBtn.style, {
                display: 'block',
                backgroundColor: '#052329',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'normal',
                fontSize: '16px',
                fontFamily: "'Playfair Display', serif",
                margin: '10px auto 100px',  // Add bottom margin so it does not collide with the social buttons
                width: '140px',
                textAlign: 'center',
                zIndex: '10',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                transition: 'all 0.3s'
            });
            
            // Add the hover effect
            downloadBtn.onmouseover = function() {
                this.style.backgroundColor = '#0B4A56';
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
            };
            
            downloadBtn.onmouseout = function() {
                this.style.backgroundColor = '#052329';
                this.style.transform = 'none';
                this.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            };
            
            // Wire up the download
            downloadBtn.addEventListener('click', function() {
                if (!currentPhotoDataURL) return;

                const fileName = `polaroid_photo_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')}.png`;

                // Save through the native bridge (Android WebView) or the classic
                // <a download> fallback (browser). No Blob/File is created, so
                // nothing is written to the browser's on-disk blob storage.
                import('../utils/mobileFeatures.js').then(({ saveImageToDevice }) => {
                    saveImageToDevice(currentPhotoDataURL, fileName);
                }).catch(error => {
                    console.warn('Mobile features module unavailable; using the classic download', error);
                    const link = document.createElement('a');
                    link.href = currentPhotoDataURL;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            });
            
            // Insert the button after .action-buttons
            const actionButtons = document.querySelector('.action-buttons');
            if (actionButtons && actionButtons.parentNode) {
                actionButtons.parentNode.insertBefore(downloadBtn, actionButtons.nextSibling);
            } else {
                // Fallback: append it under the fixed camera wrapper
                const cameraFixedWrapper = document.querySelector('.camera-fixed-wrapper');
                if (cameraFixedWrapper && cameraFixedWrapper.parentNode) {
                    cameraFixedWrapper.parentNode.appendChild(downloadBtn);
                }
            }
        }
        
        // Listen for image uploads
        if (imageUpload) {
            imageUpload.addEventListener('change', handleImageUpload);
            
        } else {
            console.error("Image upload element not found");
        }
        
        // Show an empty frame
        displayEmptyFrame();
    }
    
    // Handle image upload
    function handleImageUpload(e) {
        const file = e.target.files[0];
        
        if (!file) {
            return;
        }
        
        // Check that the file is an image
        if (!file.type.match('image.*')) {
            alert('Please upload an image file.');
            return;
        }
        
        // Check the screen width
        const screenWidth = window.innerWidth;
        
        // On small screens, remove the download button if a photo is already shown
        if (screenWidth <= 1000) {
            const existingBtn = document.getElementById('smallScreenDownloadBtn');
            if (existingBtn) {
                existingBtn.remove();
            }
        }
        
        const reader = new FileReader();
        
        reader.onload = function(event) {
            // Hide the frame immediately so it starts fully hidden
            polaroidContainer.style.display = 'none';
            polaroidContainer.classList.remove('animated');
            polaroidContainer.classList.add('hidden');
            
            // Set the initial position (top)
            polaroidContainer.style.opacity = '0';
            polaroidContainer.style.top = '0';
            
            // Force a reflow so the hidden state applies
            void polaroidContainer.offsetWidth;
            
            // Prepare the animation without starting it
            if (polaroidContainer) {
                // Keep the canvas content visible without an extra background
                polaroidCanvas.style.border = 'none';
                
                // Reset every style to avoid conflicts
                polaroidContainer.style.display = 'block';
                polaroidContainer.style.backgroundColor = 'transparent';
                polaroidContainer.style.padding = '0';
                polaroidContainer.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
                polaroidContainer.style.transition = 'none'; // Disable all transitions
                
                // Set the initial position - inside the camera
                polaroidContainer.style.opacity = '0';
                polaroidContainer.style.top = '-20px';
                
                // Remove every possible class
                polaroidContainer.classList.remove('hidden');
                polaroidContainer.classList.remove('animated');
                
                // Force a reflow so the initial styles apply
                void polaroidContainer.offsetWidth;
                
                // Set up the animation transition
                polaroidContainer.style.transition = 'opacity 0.7s ease-out, top 1.5s ease-out';
            } else {
                console.error("[Error] polaroidContainer element not found");
                return;
            }
            
            // Show the Polaroid effect - build the image, then start the animation automatically
            createPolaroidPhoto(event.target.result);
        };
        
        reader.onerror = function(e) {
            console.error('File read failed', e);
            alert('File reading failed, please try again.');
        };
        
        // Start reading the file
        try {
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Error while reading the file:", err);
            alert('Error reading file, please try again.');
        }
    }
    
    // Create the Polaroid photo - works around canvas security restrictions
    function createPolaroidPhoto(userImageSrc) {

        // A new photo is being composed, so the previous print (if any) is
        // cleared immediately: its Download button is removed and its data URL
        // is dropped, which releases the ~1.4 MB base64 string it held. This
        // keeps the app holding at most ONE photo at a time, on every capture
        // path (camera, upload, ...).
        const prevBtn = document.getElementById('smallScreenDownloadBtn');
        if (prevBtn) prevBtn.remove();
        if (polaroidContainer) {
            polaroidContainer.style.transition = 'none';
            polaroidContainer.style.display = 'none';
            polaroidContainer.style.opacity = '0';
        }
        currentPhotoDataURL = null;
        autoSaveExecuted = false;

        const ctx = polaroidCanvas.getContext('2d');
        
        // Create the image element
        const frameImg = new Image();
        const userImg = new Image();
        
        // Load the user image
        userImg.onload = function() {
            
            
            // Load the frame image
            frameImg.onload = function() {
                
                
                try {
                    
                    
                    // Clear the canvas
                    ctx.clearRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                    
                    // Draw the white background
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                    
                    // Draw the user image on the canvas (near-square ratio)
                    const imgWidth = polaroidCanvas.width * 0.86;
                    // Adjust the height so the photo area is closer to square
                    const imgHeight = imgWidth; // 1:1 square ratio
                    const imgX = (polaroidCanvas.width - imgWidth) / 2;
                    const imgY = 30; // Shift up slightly
                    
                    // Create a temporary canvas to process the image
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = imgWidth;
                    tempCanvas.height = imgHeight;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    // Draw the user image onto the temporary canvas
                    drawImageProp(tempCtx, userImg, 0, 0, imgWidth, imgHeight);
                    
                    // Apply the Fuji-style blue-tinted vintage filter
                    applyPolaroidFilter(tempCtx, imgWidth, imgHeight);
                    
                    // Draw the processed image onto the main canvas
                    ctx.drawImage(tempCanvas, imgX, imgY);
                    
                    // Prepare the animation before drawing the frame
                    if (polaroidContainer) {
                        // Reset every style to avoid conflicts
                        polaroidContainer.style.display = 'block';
                        polaroidContainer.style.backgroundColor = 'transparent';
                        polaroidContainer.style.padding = '0';
                        polaroidContainer.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
                        polaroidContainer.style.transition = 'none'; // Disable all transitions
                        
                        // Set the initial position - inside the camera
                        polaroidContainer.style.opacity = '0';
                        polaroidContainer.style.top = '-20px';
                        
                        // Remove every possible class
                        polaroidContainer.classList.remove('hidden');
                        polaroidContainer.classList.remove('animated');
                        
                        // Force a reflow so the initial styles apply
                        void polaroidContainer.offsetWidth;
                        
                        // Set up the transition - much longer for a slower animation
                        polaroidContainer.style.transition = 'opacity 1.5s ease-out, top 6s ease-out';
                    }
                    
                    // Draw the frame - keeping it high quality
                    ctx.save();
                    // Use high-quality drawing mode
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(frameImg, 0, 0, polaroidCanvas.width, polaroidCanvas.height);
                    ctx.restore();
                    
                    // Add the date after drawing the frame so it sits on top of it
                    // Format the current date, e.g. Mar.13.2025
                    const now = new Date();
                    const month = now.toLocaleString('en-US', { month: 'short' }); // Mar
                    const day = now.getDate(); // 13
                    const year = now.getFullYear(); // Full year, e.g. 2025
                    const dateText = `${month}.${day}.${year}`;
                    
                    // Use a larger font size
                    const fontSize = 68; // Fixed font size of 68px
                    
                    // Set the text style
                    ctx.save();
                    ctx.font = `${fontSize}px 'Homemade Apple', cursive, serif`; // Use the Homemade Apple font with fallbacks
                    ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; // Slightly reduce opacity for a more natural look
                    ctx.textAlign = "center";
                    
                    // Draw the date at the bottom of the frame, inside the bottom margin
                    const textY = polaroidCanvas.height - 110; // A fixed 80 px from the bottom
                    ctx.fillText(dateText, polaroidCanvas.width / 2, textY);
                    ctx.restore();
                    
                    // Start the animation immediately
                    if (polaroidContainer) {
                        // Trigger the Polaroid print vibration the moment the animation starts
                        try {
                            console.log('📷 Polaroid printing started, triggering vibration feedback...');
                            
                            // Use a faster vibration pattern: short pulses with shorter gaps
                            if (typeof window.mobileFeatures !== 'undefined' && window.mobileFeatures.vibrate) {
                                // Fast vibration pattern: short pulses with very short gaps
                                window.mobileFeatures.vibrate([150, 50, 150, 50, 150]);
                                console.log('✅ Print vibration: [150, 50, 150, 50, 150] ms');
                            } else {
                                // Fall back to the classic API but keep the fast pattern
                                if ('vibrate' in navigator) {
                                    navigator.vibrate([150, 50, 150, 50, 150]);
                                    console.log('✅ Print vibration (standard API): [150, 50, 150, 50, 150] ms');
                                } else {
                                    console.warn('⚠️ This device does not support vibration');
                                }
                            }
                        } catch (error) {
                            console.warn('❌ Vibration failed:', error);
                        }
                        
                        // Set the final state - sliding out of the camera
                        polaroidContainer.style.opacity = '1';
                        polaroidContainer.style.top = '40px';
                        
                        
                    } else {
                        console.error("[Display error] polaroidContainer does not exist");
                    }
                    
                    // Store the processed image data read from the canvas
                    try {
                        // Get the processed photo data URL - PNG for high resolution and quality
                        currentPhotoDataURL = polaroidCanvas.toDataURL('image/png', 1.0);
                        
                    } catch(e) {
                        console.error("Failed to get the canvas data URL:", e);
                        // If reading the canvas fails, fall back to the original image
                        
                        currentPhotoDataURL = userImageSrc;
                    }
                    
                    // Emit the renderComplete event
                    const renderCompleteEvent = new CustomEvent('renderComplete', { 
                        detail: { success: true, dataURL: currentPhotoDataURL } 
                    });
                    polaroidCanvas.dispatchEvent(renderCompleteEvent);
                    
                    // Note: the delayed auto-save is gone
                    // instead, the transitionend event detects the end of the animation
                    
                } catch (e) {
                    console.error("Error while composing the photo:", e);
                    
                    // Emit a composition-failure event
                    const renderCompleteEvent = new CustomEvent('renderComplete', { 
                        detail: { success: false, error: e } 
                    });
                    polaroidCanvas.dispatchEvent(renderCompleteEvent);
                }
            };
            
            // Handle a failed frame load by continuing instead of stopping
            frameImg.onerror = function(e) {
                console.error("Frame image failed to load:", e);
                
                
                try {
                    // If the frame fails to load, use only the user image
                    ctx.clearRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                    
                    // Draw the user image with a margin to mimic a frame, keeping a square ratio
                    const padding = 20;
                    const imgWidth = polaroidCanvas.width - (padding * 2);
                    // Keep the image area close to square
                    const imgHeight = imgWidth; // 1:1 square ratio
                    
                    // Draw the white background on the canvas
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                    
                    // Use high-quality drawing mode
                    ctx.save();
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Draw the user image
                    drawImageProp(ctx, userImg, padding, padding, imgWidth, imgHeight);
                    ctx.restore();
                    
                    // Add the date text
                    // Format the current date, e.g. Mar.13.2025
                    const now = new Date();
                    const month = now.toLocaleString('en-US', { month: 'short' }); // Mar
                    const day = now.getDate(); // 13
                    const year = now.getFullYear(); // Full year, e.g. 2025
                    const dateText = `${month}.${day}.${year}`;
                    
                    // Use a larger font size
                    const fontSize = 68; // Fixed font size of 68px
                    
                    // Set the text style
                    ctx.save();
                    ctx.font = `${fontSize}px 'Homemade Apple', cursive, serif`; // Use the Homemade Apple font with fallbacks
                    ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; // Slightly reduce opacity for a more natural look
                    ctx.textAlign = "center";
                    
                    // Draw the date at the bottom of the frame, inside the bottom margin
                    const textY = polaroidCanvas.height - 80; // A fixed 80 px from the bottom
                    ctx.fillText(dateText, polaroidCanvas.width / 2, textY);
                    ctx.restore();
                    
                    // Get the photo data - PNG for high resolution and quality
                    currentPhotoDataURL = polaroidCanvas.toDataURL('image/png', 1.0);
                    
                    // Prepare the animation styles
                    if (polaroidContainer) {
                        // Reset every style to avoid conflicts
                        polaroidContainer.style.display = 'block';
                        polaroidContainer.style.backgroundColor = 'transparent';
                        polaroidContainer.style.padding = '0';
                        polaroidContainer.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
                        polaroidContainer.style.transition = 'none'; // Disable all transitions
                        
                        // Set the initial position - inside the camera
                        polaroidContainer.style.opacity = '0';
                        polaroidContainer.style.top = '-20px';
                        
                        // Remove every possible class
                        polaroidContainer.classList.remove('hidden');
                        polaroidContainer.classList.remove('animated');
                        
                        // Force a reflow so the initial styles apply
                        void polaroidContainer.offsetWidth;
                        
                        // Set up the transition - much longer for a slower animation
                        polaroidContainer.style.transition = 'opacity 3s ease-out, top 6s ease-out';
                        
                        // Start the animation right away without waiting
                        polaroidContainer.style.opacity = '1';
                        polaroidContainer.style.top = '40px';
                    }
                    
                    
                } catch(e2) {
                    console.error("Failed to process the photo without a frame:", e2);
                    alert("Photo processing failed, please refresh the page and try again.");
                }
            };
            
            // Set the frame image source
            frameImg.src = polaroidFramePath;
        };
        
        // Handle a failed user-image load
        userImg.onerror = function(e) {
            console.error("User image failed to load:", e);
            console.warn("Image failed to load; it may be a cross-origin issue or an unsupported format");
            
            // Create a blank placeholder image
            try {
                // Clear the canvas
                ctx.clearRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                
                // Draw the white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, polaroidCanvas.width, polaroidCanvas.height);
                
                // Draw the error message
                ctx.fillStyle = 'black';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Image loading failed', polaroidCanvas.width/2, polaroidCanvas.height/2);
                ctx.fillText('Please upload again', polaroidCanvas.width/2, polaroidCanvas.height/2 + 30);
                
                // Store the error placeholder as the current photo data - PNG format
                currentPhotoDataURL = polaroidCanvas.toDataURL('image/png', 1.0);
            } catch(e2) {
                console.error("Failed to create the error notice:", e2);
            }
            
            alert("Image loading failed, please upload again or choose another image.");
        };
        
        // Set the user image source
        userImg.src = userImageSrc;

        // A fresh photo is being composed: the old print (if any) is released
        // as soon as the user starts a new one - see the upload handler.
    }
    
    // Apply the classic Polaroid-style filter
    function applyPolaroidFilter(ctx, width, height) {
        // Read the image data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Build lookup tables (LUTs) for tone mapping
        const rLUT = new Uint8Array(256);
        const gLUT = new Uint8Array(256);
        const bLUT = new Uint8Array(256);
        
        // Initialize the Polaroid-style tone mapping - lower brightness and reduce the yellow cast
        for (let i = 0; i < 256; i++) {
            // Red channel - slightly lower brightness and tone down the warm cast
            rLUT[i] = Math.min(255, Math.max(0, 
                i < 64 ? i * 0.95 : // Lower reds in the shadows
                i < 190 ? i * 1.02 : // Slightly lift reds in the midtones, but not too much
                i * 0.95 // Roll off reds in highlights to lower brightness
            ));
            
            // Green channel - lower green to reduce the yellow cast
            gLUT[i] = Math.min(255, Math.max(0, 
                i < 50 ? i * 0.88 : // Lower greens in the shadows
                i < 150 ? i * 0.92 : // Lower greens in the midtones
                i * 0.95 // Lower greens in the highlights to reduce the yellow cast
            ));
            
            // Blue channel - lower it moderately, but keep some blue for balance
            bLUT[i] = Math.min(255, Math.max(0, 
                i < 80 ? i * 0.85 : // Lower blues in the shadows moderately
                i < 160 ? i * 0.90 : // Slightly lower blues in the midtones
                i * 0.95 // Slightly lower blues in the highlights
            ));
        }
        
        // Apply the filter
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Apply the LUTs
            data[i] = rLUT[r];
            data[i + 1] = gLUT[g];
            data[i + 2] = bLUT[b];
            
            // Increase contrast - Polaroid photos are usually high contrast
            const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            const contrast = 0.22; // Stronger contrast
            
            data[i] = Math.min(255, Math.max(0, data[i] + (data[i] - 128) * contrast));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (data[i + 1] - 128) * contrast));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (data[i + 2] - 128) * contrast));
            
            // Polaroid-style shadow treatment: lift reds and lower blues in the shadows
            if (brightness < 0.40) {
                const warmShift = 0.10 * (1 - brightness * 2.5); // The darker the pixel, the stronger the tint shift
                data[i] = Math.min(255, data[i] + warmShift * 30); // Boost reds in the shadows
                data[i + 1] = Math.min(255, data[i + 1] + warmShift * 15); // Slightly boost greens in the shadows
                data[i + 2] = Math.max(0, data[i + 2] - warmShift * 30); // Lower blues in the shadows
            }
            
            // Highlight handling - softer, more natural highlights
            if (brightness > 0.75) { // Raise the threshold so only brighter areas are affected
                const subtleHighlight = 0.08 * (brightness - 0.75) * 2.5; // Lower the strength
                data[i] = Math.min(255, data[i] + subtleHighlight * 10); // Slightly boost reds in the highlights
                data[i + 1] = Math.min(255, data[i + 1] + subtleHighlight * 8); // Add even less green to highlights to reduce the yellow cast
            }
            
            // Subtle cross-processing - lower strength for a more natural result
            const crossAmount = 0.05; // Lower the cross-processing strength
            
            // Lower overall brightness
            const darkeningFactor = 0.93; // Reduce overall brightness by about 7%
            data[i] = Math.min(255, Math.max(0, data[i] * darkeningFactor));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * darkeningFactor));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * darkeningFactor));
            
            // Simplified cross-processing that reduces the yellow cast
            if (brightness > 0.65) { // Raise the highlight threshold
                // More limited highlight handling and less green boost
                data[i] = Math.min(255, data[i] * (1 + crossAmount * (brightness - 0.65)));
                // Only slightly boost green so the yellow cast stays subtle
                data[i + 1] = Math.min(255, data[i + 1] * (1 + crossAmount * 0.4 * (brightness - 0.65)));
            }
        }
        
        // Add the stronger Fujifilm-style grain
        const grainAmount = 12; // Boost grain strength noticeably
        const grainDensity = 0.85; // Increase grain coverage (lower values affect more pixels)
        
        for (let i = 0; i < data.length; i += 4) {
            // Compute the brightness-based grain
            const pixelBrightness = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
            
            // More grain in the shadows and less in the highlights (like real film)
            const brightnessFactor = pixelBrightness < 0.5 ? 
                1.3 - pixelBrightness * 0.6 : // Stronger grain in the shadows
                0.8 - pixelBrightness * 0.3;  // Weaker grain in highlights
                
            // Randomly decide whether to grain each pixel, which raises density
            if (Math.random() > grainDensity) {
                // Scale grain strength by brightness: strong in shadows, weak in highlights
                const localGrainAmount = grainAmount * brightnessFactor;
                
                // Generate slightly correlated grain for a more natural look
                const baseGrain = (Math.random() - 0.5) * localGrainAmount;
                
                // Apply slightly different grain per channel for a more natural film look
                const redGrain = baseGrain * 0.9 + (Math.random() - 0.5) * 2;
                const greenGrain = baseGrain * 0.85 + (Math.random() - 0.5) * 2;
                const blueGrain = baseGrain * 1.2 + (Math.random() - 0.5) * 3; // Stronger grain in the blue channel
                
                data[i] = Math.min(255, Math.max(0, data[i] + redGrain));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + greenGrain));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + blueGrain));
            }
        }
        
        // Put the processed image data back into the canvas
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Draw the image and preserve its ratio (like object-fit: cover)
    function drawImageProp(ctx, img, x, y, w, h) {
        // Default value
        if (typeof x !== 'number') x = 0;
        if (typeof y !== 'number') y = 0;
        if (typeof w === 'undefined') w = ctx.canvas.width;
        if (typeof h === 'undefined') h = ctx.canvas.height;
        
        // Compute the scale factor
        const imgRatio = img.width / img.height;
        const containerRatio = w / h;
        
        let newW, newH, offsetX, offsetY;
        
        // Decide the crop from the aspect ratio
        if (containerRatio > imgRatio) {
            newW = w;
            newH = w / imgRatio;
            offsetX = 0;
            offsetY = (h - newH) / 2;
        } else {
            newH = h;
            newW = h * imgRatio;
            offsetX = (w - newW) / 2;
            offsetY = 0;
        }
        
        // Draw the image
        ctx.drawImage(img, x + offsetX, y + offsetY, newW, newH);
    }
    
    // Show an empty frame
    function displayEmptyFrame() {
        const emptyFrame = new Image();
        emptyFrame.onload = function() {
            const ctx = polaroidCanvas.getContext('2d');
            ctx.drawImage(emptyFrame, 0, 0, polaroidCanvas.width, polaroidCanvas.height);
            
        };
        emptyFrame.src = polaroidFramePath;
    }
    
    // saveCurrentPhoto was removed; auto-save now triggers on the transitionend event
    
    // Public API
    return {
        init: init,
        createPolaroidPhoto: createPolaroidPhoto
    };
})();