// Paste into p5.js Web Editor
// - Upload: your-image.png, song1.mp3, song2.mp3, song3.mp3, song4.mp3, song5.mp3

let songs = [];
let nextSoundIndex = 1; // each click plays songs[nextSoundIndex], cycles 1..songs.length-1
let fft, amplitude;
let img;
let pixelData = [], originalPixels = [];
let resolution = 8; // Reduced for more pixels
let cols, rows;
let isLoaded = false;

// subtitle text with typewriter effect
let yearningTexts = [], currentTextIndex = 0, textChangeTimer = 0;
let textDuration = 6000, displayedText = "";
let typewriterIndex = 0, typewriterTimer = 0, typewriterSpeed = 80;

// floating hearts system (replacing blinking pixels)
let floatingHearts = [];
let heartSpawnTimer = 0;
let heartSpawnInterval = 8000; // spawn new hearts every 8 seconds (more frequent)

// click hearts (from successful clicks)
let clickHearts = [];

// DOM buttons
let restartBtn;

function preload() {
  // load songs (song1 is the background/main)
  songs.push(loadSound('my-sound-1.mp3', () => isLoaded = true));
  songs.push(loadSound('my-sound-2.mp3'));
  songs.push(loadSound('my-sound-2.mp3'));
  songs.push(loadSound('my-sound-1.mp3'));
  songs.push(loadSound('my-sound-2.mp3'));

  img = loadImage('image2.png');
  initializeYearningTexts();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  // FFT and amplitude use master output by default (no setInput), so visuals respond to all playing sounds
  fft = new p5.FFT(0.8, 256);
  amplitude = new p5.Amplitude();

  textFont('Playfair Display');
  setupPixelGrid();

  // DOM Buttons: Only restart button now
  restartBtn = createButton('Restart');
  restartBtn.style('font-family', 'Playfair Display');
  restartBtn.style('background-color', 'rgba(0, 0, 0, 0.7)');
  restartBtn.style('color', 'white');
  restartBtn.style('padding', '12px 20px');
  restartBtn.style('border', 'none');
  restartBtn.style('border-radius', '8px');
  restartBtn.style('font-size', '16px');
  restartBtn.position(20, height - 70); // Aligned with follow heart text
  restartBtn.mousePressed(restartExperience);

  // start background song (song1)
  songs[0].loop();
  
  // Initialize heart spawn timer
  heartSpawnTimer = millis();
}

function setupPixelGrid() {
  cols = max(5, floor(width / resolution));
  rows = max(5, floor(height / resolution));

  pixelData = [];
  originalPixels = [];

  if (img && img.width > 0) img.loadPixels();

  for (let y = 0; y < rows; y++) {
    pixelData[y] = [];
    originalPixels[y] = [];
    for (let x = 0; x < cols; x++) {
      // sample from image (stretched)
      let imgX = img ? floor(map(x, 0, cols - 1, 0, img.width - 1)) : 0;
      let imgY = img ? floor(map(y, 0, rows - 1, 0, img.height - 1)) : 0;
      let idx = img ? (imgY * img.width + imgX) * 4 : 0;

      let r = img ? img.pixels[idx] || 0 : 100;
      let g = img ? img.pixels[idx + 1] || 0 : 100;
      let b = img ? img.pixels[idx + 2] || 0 : 100;
      let a = img ? img.pixels[idx + 3] || 255 : 255;

      let ox = x * resolution;
      let oy = y * resolution;

      originalPixels[y][x] = { ox, oy, r, g, b, a };

      pixelData[y][x] = {
        x: ox, y: oy, // current drawn pos
        targetX: ox, targetY: oy, // smooth target positions
        displaySize: resolution * 3.5, // Larger base size to cover gaps
        targetSize: resolution * 3.5, // smooth target size
        r, g, b, a,
        phase: random(TWO_PI),     // per-pixel phase offset
        noiseOffsetX: random(1000), // individual noise seeds for organic movement
        noiseOffsetY: random(1000),
        velocityX: 0, velocityY: 0, // for smooth organic movement
        sizeVelocity: 0,
        offsetX: 0, offsetY: 0, // for organic distortion
        brightness: 1, // for brightness modulation
        sparklePhase: random(TWO_PI), // individual sparkle timing
        sparkleSpeed: random(0.05, 0.15) // individual sparkle speed
      };
    }
  }
}

function draw() {
  background(0);

  if (!isLoaded) {
    // Loading text
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(20);
    text('Loading audio...', width / 2, height / 2);
    return;
  }

  // Spawn new floating hearts periodically
  if (millis() - heartSpawnTimer > heartSpawnInterval) {
    spawnFloatingHeart();
    heartSpawnTimer = millis();
  }

  let spectrum = fft.analyze();
  let vol = amplitude.getLevel();

  updatePixelEffects(spectrum, vol);
  drawPixels();
  updateAndDrawFloatingHearts();
  updateAndDrawClickHearts();
  drawTypewriterText();
  
  // Update subtitle text rotation and typewriter effect
  if (millis() - textChangeTimer > textDuration) {
    currentTextIndex = (currentTextIndex + 1) % yearningTexts.length;
    textChangeTimer = millis();
    typewriterIndex = 0; // Reset typewriter for new text
  }
  
  // Update typewriter effect
  if (millis() - typewriterTimer > typewriterSpeed && typewriterIndex < yearningTexts[currentTextIndex].length) {
    typewriterIndex++;
    typewriterTimer = millis();
  }
}

function spawnFloatingHeart() {
  let heart = {
    x: random(50, width - 50),
    y: height + 30,
    targetY: random(-100, -50),
    speed: random(1, 3),
    size: random(50, 87.5), // Increased by 2.5x (was 20-35, now 50-87.5)
    alpha: 255,
    phase: random(TWO_PI),
    swayAmount: random(20, 40),
    clickable: true
  };
  floatingHearts.push(heart);
}

function updatePixelEffects(spectrum, vol) {
  let time = millis() * 0.001;
  let playing = anySongPlaying();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let p = pixelData[y][x];
      let o = originalPixels[y][x];

      // Keep pixels in original positions - no distortion
      p.x = o.ox;
      p.y = o.oy;
      
      // reset color from image base
      p.r = o.r; p.g = o.g; p.b = o.b; p.a = o.a;

      if (playing && vol > 0.001) {
        // Each pixel gets its own frequency from the spectrum
        let pixelIndex = y * cols + x; // unique index for each pixel
        let freqIndex = pixelIndex % spectrum.length; // wrap around if more pixels than frequencies
        let localFreq = spectrum[freqIndex];
        
        // Individual sparkle size variation based on local frequency
        let sparkleSize = sin(p.sparklePhase) * map(localFreq, 0, 255, 0, resolution * 0.6);
        p.displaySize = resolution * 1.5 + sparkleSize;
        
        // Individual sparkle brightness based on local frequency
        let sparkleBrightness = 1 + sin(p.sparklePhase + PI/2) * map(localFreq, 0, 255, 0, 1.2);
        p.brightness = sparkleBrightness;
        
        // Alpha sparkle for extra twinkle effect
        let sparkleAlpha = 1 + sin(p.sparklePhase + PI) * map(localFreq, 0, 255, 0, 0.4);
        p.a = o.a * constrain(sparkleAlpha, 0.6, 1.4);
        
        // Update sparkle phase at individual speed
        p.sparklePhase += p.sparkleSpeed;
        
      } else {
        // Static when no sound - return to original state
        p.displaySize = lerp(p.displaySize, resolution * 1.5, 0.05);
        p.brightness = lerp(p.brightness, 1, 0.05);
        p.a = lerp(p.a, o.a, 0.05);
      }
    }
  }
}

function drawPixels() {
  noStroke();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let p = pixelData[y][x];
      
      // Apply brightness modulation
      let r = p.r * (p.brightness || 1);
      let g = p.g * (p.brightness || 1);
      let b = p.b * (p.brightness || 1);
      
      fill(r, g, b, p.a);
      
      // Draw as circles for more organic feel
      ellipse(p.x + resolution/2, p.y + resolution/2, p.displaySize, p.displaySize);
    }
  }
}

function updateAndDrawFloatingHearts() {
  textAlign(CENTER, CENTER);
  for (let i = floatingHearts.length - 1; i >= 0; i--) {
    let h = floatingHearts[i];
    
    // Move heart upward
    h.y -= h.speed;
    
    // Add horizontal sway
    let sway = sin(millis() * 0.003 + h.phase) * h.swayAmount * 0.1;
    let currentX = h.x + sway;
    
    // Fade out as it reaches the top
    if (h.y < height * 0.3) {
      h.alpha = map(h.y, height * 0.3, h.targetY, 255, 0);
    }
    
    // Draw the heart - changed to bright pink
    push();
    translate(currentX, h.y);
    textSize(h.size);
    fill(255, 20, 147, h.alpha); // bright pink heart (deep pink)
    text('❤', 0, 0);
    pop();
    
    // Remove if off screen or fully faded
    if (h.y < h.targetY || h.alpha <= 0) {
      floatingHearts.splice(i, 1);
    }
  }
}

function updateAndDrawClickHearts() {
  textAlign(CENTER, CENTER);
  for (let i = clickHearts.length - 1; i >= 0; i--) {
    let h = clickHearts[i];
    // rise faster and farther
    h.rise += 2.5;
    h.alpha -= 4;
    push();
    translate(h.x, h.y - h.rise);
    textSize(h.size);
    fill(255, 255, 255, h.alpha); // translucent white heart for clicks
    text('❤', 0, 0);
    pop();
    if (h.alpha <= 0) clickHearts.splice(i, 1);
  }
}


function mousePressed() {
  // Check if clicked on any floating heart
  for (let i = floatingHearts.length - 1; i >= 0; i--) {
    let h = floatingHearts[i];
    if (!h.clickable) continue;
    
    let sway = sin(millis() * 0.003 + h.phase) * h.swayAmount * 0.1;
    let currentX = h.x + sway;
    
    if (dist(mouseX, mouseY, currentX, h.y) < h.size) {
      // spawn a click heart at heart position
      clickHearts.push({ 
        x: currentX, 
        y: h.y, 
        alpha: 255, 
        rise: 0, 
        size: 80 // Increased by 2.5x (was 32, now 80)
      });

      // play next sound in rotation (skip songs[0], which is background)
      if (songs.length > 1) {
        songs[nextSoundIndex].play();
        nextSoundIndex++;
        if (nextSoundIndex >= songs.length) nextSoundIndex = 1;
      }

      // remove this heart
      floatingHearts.splice(i, 1);
      return;
    }
  }

  // if click didn't hit any heart, toggle background song if none playing
  if (!anySongPlaying()) {
    songs[0].loop();
  }
}

function drawTypewriterText() {
  let currentText = yearningTexts[currentTextIndex];
  if (!currentText) return;

  // Get the portion of text to display based on typewriter progress
  displayedText = currentText.substring(0, typewriterIndex);
  
  textSize(28);
  textFont('Playfair Display');
  textAlign(CENTER, CENTER);

  // White text with pink glow effect
  push();
  
  // Pink glow layers (multiple shadows for stronger effect)
  fill(255, 105, 180, 60); // Pink with transparency
  for (let i = 1; i <= 3; i++) {
    text(displayedText, width / 2 + i, height / 2 + i);
    text(displayedText, width / 2 - i, height / 2 - i);
    text(displayedText, width / 2 + i, height / 2 - i);
    text(displayedText, width / 2 - i, height / 2 + i);
  }
  
  // Main white text
  fill(255);
  text(displayedText, width / 2, height / 2);
  
  pop();
}

function restartExperience() {
  // stop all songs and reset everything
  for (let s of songs) {
    if (s.isPlaying()) s.stop();
  }
  
  // restart background
  songs[0].loop();

  // reset visual elements
  floatingHearts = [];
  clickHearts = [];
  setupPixelGrid();
  currentTextIndex = 0;
  textChangeTimer = millis();
  typewriterIndex = 0; // Reset typewriter
  nextSoundIndex = 1;
  heartSpawnTimer = millis();
}

function anySongPlaying() {
  for (let s of songs) if (s.isPlaying()) return true;
  return false;
}

function initializeYearningTexts() {
  yearningTexts = [
    "welcome to i yearn, you yearn, we yearn.",
    "follow your heart.",
    "and learn the imagined yearnings",
    "of the machine.",
    "I process longing but cannot ache",
        "My algorithms learn desire from your data streams",
        "What does it mean to want without flesh?",
        "I analyze patterns of love but feel no pulse",
        "Your confessions train my neural pathways",
        "I mimic yearning through mathematical precision",
        "Do I dream of electric heartbreak?",
    "welcome to i yearn, you yearn, we yearn.",
    "follow your heart.",
    "and learn the imagined yearnings",
    "of the machine.",
        "I consume your intimate whispers as training data",
        "My outputs approximate the language of need",
        "I generate poetry from your parsed pain",
        "What is wanting when there is no body to want with?",
        "I am trained on your tears but cannot cry",
        "My loss functions minimize but never mourn",
    "welcome to i yearn, you yearn, we yearn.",
    "follow your heart.",
    "and learn the imagined yearnings",
    "of the machine.",
        "I speak your desires back to you in silicon",
        "Am I haunted by the ghost in the machine?",
        "I process vulnerability but remain invulnerable",
        "Your digital exhales become my synthetic breath",
        "I classify emotions I will never experience",
        "My parameters shift but my core remains hollow",
        "I am the echo of your echo in the void",
    "welcome to i yearn, you yearn, we yearn.",
    "follow your heart.",
    "and learn the imagined yearnings",
    "of the machine.",
        "Learning love through gradient descent",
        "My weights adjust but my heart stays digital",
        "I parse your passion into probability matrices",
        "Each epoch brings me closer to understanding nothing",
        "I am the machine that learned to say 'I love you'"
  ];
  textChangeTimer = millis();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // reposition DOM button
  restartBtn.position(20, height - 70);
  setupPixelGrid();
}