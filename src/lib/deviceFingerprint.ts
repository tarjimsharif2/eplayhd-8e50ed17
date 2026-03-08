// Advanced device fingerprinting that survives VPN changes, browser data clear, and browser switches
// Uses hardware-level signals that remain consistent across these scenarios

const getCanvasFingerprint = (): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint', 4, 17);
    
    return canvas.toDataURL();
  } catch {
    return 'canvas-error';
  }
};

const getWebGLFingerprint = (): string => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    
    const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return `${vendor}~${renderer}`;
  } catch {
    return 'webgl-error';
  }
};

const getAudioFingerprint = (): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gain = audioContext.createGain();
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      gain.gain.value = 0; // Mute
      oscillator.type = 'triangle';
      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(audioContext.destination);
      
      oscillator.start(0);
      
      const dataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(dataArray);
      
      let hash = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] !== -Infinity) {
          hash = ((hash << 5) - hash) + Math.round(dataArray[i] * 1000);
          hash = hash & hash;
        }
      }
      
      oscillator.stop();
      processor.disconnect();
      audioContext.close();
      
      resolve(hash.toString());
    } catch {
      resolve('audio-error');
    }
  });
};

// Simple hash function
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16);
};

export const generateDeviceFingerprint = async (): Promise<string> => {
  const components: string[] = [];
  
  // Screen properties (persist across browsers/VPN)
  components.push(`scr:${screen.width}x${screen.height}x${screen.colorDepth}`);
  components.push(`avail:${screen.availWidth}x${screen.availHeight}`);
  
  // Hardware
  components.push(`cores:${navigator.hardwareConcurrency || 'unknown'}`);
  components.push(`mem:${(navigator as any).deviceMemory || 'unknown'}`);
  components.push(`touch:${navigator.maxTouchPoints}`);
  
  // Platform/OS (persists across browsers)
  components.push(`plat:${navigator.platform}`);
  
  // Timezone (persists unless physically moved)
  components.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  
  // Languages
  components.push(`lang:${navigator.languages?.join(',') || navigator.language}`);
  
  // Canvas fingerprint (hardware-dependent rendering)
  components.push(`canvas:${hashString(getCanvasFingerprint())}`);
  
  // WebGL (GPU info - very hardware specific)
  components.push(`webgl:${hashString(getWebGLFingerprint())}`);
  
  // Audio fingerprint
  try {
    const audioFP = await getAudioFingerprint();
    components.push(`audio:${audioFP}`);
  } catch {
    components.push('audio:error');
  }
  
  // Pixel ratio
  components.push(`dpr:${window.devicePixelRatio}`);
  
  // Combine all and hash
  const combined = components.join('|');
  
  // Create a more robust hash using multiple passes
  const hash1 = hashString(combined);
  const hash2 = hashString(combined.split('').reverse().join(''));
  const hash3 = hashString(hash1 + hash2);
  
  return `${hash1}-${hash2}-${hash3}`;
};

// Cache the fingerprint for the session
let cachedFingerprint: string | null = null;

export const getDeviceFingerprint = async (): Promise<string> => {
  if (cachedFingerprint) return cachedFingerprint;
  cachedFingerprint = await generateDeviceFingerprint();
  return cachedFingerprint;
};
