/**
 * Polaroid Camera - main entry file
 * Initializes and coordinates all modules
 */

// Initialize the app once the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    
    // Preload the mobile features module onto a global
    const loadMobileFeatures = async () => {
        try {
            const mobileFeatures = await import('./utils/mobileFeatures.js');
            window.mobileFeatures = mobileFeatures;
            console.log('Mobile features module loaded');
        } catch (error) {
            console.warn('Mobile features module failed to load:', error);
        }
    };
    
    // Preload the Homemade Apple font so the date text renders correctly
    const fontLoader = async () => {
        
        try {
            // Try to load the font
            const font = new FontFace(
                'Homemade Apple', 
                `url(assets/fonts/homemade-0.woff2)`
            );
            
            // Wait for the font to load
            await font.load();
            
            // Add the font to the document
            document.fonts.add(font);
            
        } catch (err) {
            console.warn("Font failed to load, using a fallback font:", err);
        }
    };
    
    // Load the font and mobile features in parallel, then initialize the app
    Promise.all([fontLoader(), loadMobileFeatures()]).then(() => {
        // Initialize the core module
        PolaroidCore.init();
        
        // Initialize UI interactions
        UIController.init();
    });
});