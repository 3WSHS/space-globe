import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Constellation variables
const constellationsGroup = new THREE.Group();
scene.add(constellationsGroup);
const starHipMap = new Map();
const starLabels = new Map();
let constellations = [];

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(10, 0, 10);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x222222));

camera.position.z = 15;

// Earth
let earth;
const textureLoader = new THREE.TextureLoader();
textureLoader.load(
  './textures/earth_day.jpg',
  (texture) => {
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(5, 128, 128),
      new THREE.MeshPhongMaterial({ 
        map: texture,
        specular: new THREE.Color(0x111111),
        shininess: 10
      })
    );
    earth.rotation.x = -0.41;
    scene.add(earth);
    document.getElementById('info').textContent = "Earth Loaded - Real-Time Mode Active";
    animate();
  },
  undefined,
  (err) => {
    document.getElementById('info').textContent = "Failed to load Earth texture - Using fallback";
    console.error("Earth texture failed:", err);
    createFallbackEarth();
  }
);

function createFallbackEarth() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a5fb4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2e8b57';
  ctx.beginPath();
  ctx.ellipse(canvas.width*0.5, canvas.height*0.25, 300, 400, 0, 0, Math.PI*2);
  ctx.ellipse(canvas.width*0.15, canvas.height*0.3, 250, 350, 0, 0, Math.PI*2);
  ctx.fill();

  earth = new THREE.Mesh(
    new THREE.SphereGeometry(5, 128, 128),
    new THREE.MeshPhongMaterial({ map: new THREE.CanvasTexture(canvas) })
  );
  earth.rotation.x = -0.41;
  scene.add(earth);
  animate();
}

function createStarSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'white');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createStarLabel(name, position) {
  const label = document.createElement('div');
  label.className = 'star-label';
  label.textContent = name;
  document.body.appendChild(label);
  starLabels.set(name, { label, position });
}

function createConstellationLabel(name, position) {
  const label = document.createElement('div');
  label.className = 'constellation-label';
  label.textContent = name;
  document.body.appendChild(label);
  starLabels.set(`constellation-${name}`, { label, position });
}

function getStarColor(spectral) {
  if (!spectral) return '#ffffff';
  const type = spectral[0].toUpperCase();
  switch (type) {
    case 'O': return '#9bb0ff';
    case 'B': return '#aabfff';
    case 'A': return '#cad7ff';
    case 'F': return '#f8f7ff';
    case 'G': return '#fff4ea';
    case 'K': return '#ffd2a1';
    case 'M': return '#ffcc6f';
    default: return '#ffffff';
  }
}

function verifyHIPNumbers() {
  const requiredHIPs = new Set();
  constellations.forEach(c => c.lines.forEach(hip => requiredHIPs.add(hip)));
  
  const missing = [];
  requiredHIPs.forEach(hip => {
    if (!starHipMap.has(hip)) missing.push(hip);
  });
  
  console.log("Missing HIP numbers:", missing.join(", "));
  document.getElementById('info').textContent += `\nMissing ${missing.length} HIP numbers`;
}

async function loadStars() {
  try {
    document.getElementById('info').textContent += "\nLoading star data...";
    const response = await fetch('./data/hygdata_v3.csv');
    const data = await response.text();
    const rows = data.split('\n').slice(1);

    const positions = [];
    const colors = [];
    const starsToLabel = [];

    for (let row of rows) {
      const [id, hip, hd, hr, gl, bf, proper, ra, dec, dist, mag, absmag, , , , ci, spect] = row.split(',');
      if (!ra || !dec || !dist || !mag || parseFloat(mag) > 7) continue; // Changed from 5 to 7

      const raNum = parseFloat(ra);
      const decNum = parseFloat(dec);
      const distance = parseFloat(dist) * 8;

      const phi = (raNum * Math.PI / 12) - Math.PI;
      const theta = decNum * Math.PI / 180;

      const x = distance * Math.cos(theta) * Math.cos(phi);
      const y = distance * Math.sin(theta);
      const z = distance * Math.cos(theta) * Math.sin(phi);
      positions.push(x, y, z);

      const color = new THREE.Color(getStarColor(spect));
      colors.push(color.r, color.g, color.b);

      if (hip) {
        starHipMap.set(parseInt(hip), new THREE.Vector3(x, y, z));
      }

      if (proper && parseFloat(mag) < 2.5) {
        starsToLabel.push({ name: proper, position: new THREE.Vector3(x, y, z) });
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      map: createStarSprite(),
      transparent: true
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    for (const star of starsToLabel) {
      createStarLabel(star.name, star.position);
    }

    await loadConstellations();
    document.getElementById('info').textContent += "\nStars and constellations loaded!";
  } catch (err) {
    console.error("Failed to load star data:", err);
    document.getElementById('info').textContent += "\nStar data failed to load";
  }
}

async function loadConstellations() {
  try {
    const response = await fetch('./data/constellation-lines.json');
    constellations = await response.json();
    let validConnections = 0;

    constellations.forEach(constellation => {
      const lines = [];
      let prevValidPos = null;
      
      for (let i = 0; i < constellation.lines.length; i++) {
        const hip = constellation.lines[i];
        if (starHipMap.has(hip)) {
          const currentPos = starHipMap.get(hip);

          if (prevValidPos) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
              prevValidPos,
              currentPos
            ]);
            lines.push(new THREE.Line(
              geometry,
              new THREE.LineBasicMaterial({
                color: 0x4466ff,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
              })
            ));
            validConnections++;
          }
          prevValidPos = currentPos;
        } else {
          prevValidPos = null; // Reset when missing HIP
        }
      }

      if (lines.length > 0) {
        const group = new THREE.Group();
        group.name = constellation.name;
        group.add(...lines);
        constellationsGroup.add(group);
        
        // Add label at first valid position
        const firstValidStar = constellation.lines.find(hip => starHipMap.has(hip));
        if (firstValidStar) {
          createConstellationLabel(
            constellation.name,
            starHipMap.get(firstValidStar)
          );
        }
      }
    });

    console.log(`Created ${validConnections} constellation connections`);
    document.getElementById('info').textContent += `\nCreated ${validConnections} constellation lines`;
    
    // Add the verification
    verifyHIPNumbers();
    
    // Add toggle button for constellations
    if (!document.getElementById('toggleConstellations')) {
      const btn = document.createElement('button');
      btn.id = 'toggleConstellations';
      btn.textContent = 'Toggle Constellations';
      btn.style.position = 'absolute';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '100';
      btn.addEventListener('click', toggleConstellations);
      document.body.appendChild(btn);
    }
  } catch (err) {
    console.error("Error loading constellations:", err);
    document.getElementById('info').textContent += "\nFailed to load constellations";
  }
}

function toggleConstellations() {
  constellationsGroup.visible = !constellationsGroup.visible;
}

function updateEarthRotation() {
  if (!earth) return;
  const now = new Date();
  const utcHours = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
  earth.rotation.y = (utcHours * Math.PI / 12) - Math.PI/2;
  
  const sunAngle = earth.rotation.y + Math.PI;
  sun.position.set(10 * Math.cos(sunAngle), 0, 10 * Math.sin(sunAngle));
  
  const info = document.getElementById('info');
  info.innerHTML = info.innerHTML.split('<br>')[0] + `<br>UTC: ${now.toUTCString()}<br>Rotation: ${(earth.rotation.y * 180/Math.PI).toFixed(2)}°`;
}

function updateLabels() {
  starLabels.forEach(({ label, position }) => {
    const proj = position.clone().project(camera);
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
    label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    label.style.opacity = proj.z < 1 ? '1' : '0';
  });
}

function animate() {
  requestAnimationFrame(animate);
  updateEarthRotation();
  updateLabels();
  renderer.render(scene, camera);
}

// Initialize
loadStars();