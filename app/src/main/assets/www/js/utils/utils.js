/**
 * Polaroid Camera - utility module
 * Provides helpers and shared methods
 */

const Utils = (function() {
    /**
     * Generate a random ID
     * @param {number} length - ID length
     * @returns {string} - Random ID
     */
    function generateRandomId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < length; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    
    /**
     * Debounce function
     * @param {Function} func - Function to run
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    /**
     * Throttle function
     * @param {Function} func - Function to run
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} - Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Format date and time
     * @param {Date} date - Date object
     * @param {string} format - Format string
     * @returns {string} - Formatted date string
     */
    function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }
    
    /**
     * Download a data URL as a file
     * @param {string} dataURL - Data URL
     * @param {string} fileName - File name
     */
    function downloadDataURL(dataURL, fileName) {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    /**
     * Play a sound effect
     * @param {string} soundSrc - Sound file path
     * @returns {Promise} - Promise resolved when playback finishes
     */
    function playSound(soundSrc) {
        return new Promise((resolve, reject) => {
            try {
                const audio = new Audio(soundSrc);
                audio.onended = resolve;
                audio.onerror = reject;
                audio.play().catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Deep-clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} - Cloned object
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (obj instanceof Array) {
            return obj.map(item => deepClone(item));
        }
        
        if (obj instanceof Object) {
            const copy = {};
            Object.keys(obj).forEach(key => {
                copy[key] = deepClone(obj[key]);
            });
            return copy;
        }
        
        throw new Error('Unable to copy obj! Its type is not supported.');
    }
    
    /**
     * Generate a random number in a range
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} - Random number
     */
    function randomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * Detect the device type
     * @returns {Object} - Device information
     */
    function detectDevice() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
        const isTablet = /(ipad|tablet|playbook|silk)|(android(?!.*mobile))/i.test(userAgent);
        const isDesktop = !isMobile && !isTablet;
        
        return {
            isMobile,
            isTablet,
            isDesktop,
            isIOS: /iphone|ipad|ipod/i.test(userAgent),
            isAndroid: /android/i.test(userAgent),
            isSafari: /safari/i.test(userAgent) && !/chrome/i.test(userAgent)
        };
    }
    
    // Public API
    return {
        generateRandomId,
        debounce,
        throttle,
        formatDateTime,
        downloadDataURL,
        playSound,
        deepClone,
        randomNumber,
        detectDevice
    };
})();